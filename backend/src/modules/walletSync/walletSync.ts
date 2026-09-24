import { PoolClient } from 'pg';
import { db, pool } from '../../db/client';
import { getOpenLots, FIFO_DUST_EPSILON } from '../fifo/engine';
import { getProviderForNetwork } from './providers/registry';
import { decryptApiKey } from './apiKeyCrypto';

export interface SyncResult {
  asset: string;
  status: 'ok' | 'discrepancy' | 'error';
  onchainBalance: number | null;
  expectedBalance: number;
  discrepancyPct: number | null;
  error?: string;
}

const DISCREPANCY_THRESHOLD = 0.005; // 0.5%
const CIRCUIT_BREAKER_THRESHOLD = 3;
const ENV_KEY_BY_NETWORK: Record<string, string> = {
  Ethereum: 'ETHERSCAN_API_KEY',
  Cardano: 'BLOCKFROST_API_KEY',
  'Polkadot Asset Hub': 'SUBSCAN_API_KEY',
};

// Fallos consecutivos por red — vive en memoria del proceso; si el backend
// reinicia, el circuit breaker se resetea (aceptable: un reinicio es una
// señal razonable para volver a intentar).
const consecutiveFailures = new Map<string, number>();

async function resolveApiKey(networkId: string, networkName: string, client: PoolClient): Promise<string | undefined> {
  const row = await client.query(
    `SELECT api_key_encrypted, api_key_iv FROM network_api_keys WHERE network_id = $1`,
    [networkId]
  );
  if (row.rows.length > 0) {
    return decryptApiKey(row.rows[0].api_key_encrypted, row.rows[0].api_key_iv);
  }
  const envVar = ENV_KEY_BY_NETWORK[networkName];
  return envVar ? process.env[envVar] || undefined : undefined;
}

async function getExpectedBalance(asset: string, walletId: string, client: PoolClient): Promise<number> {
  const lots = await getOpenLots(asset, walletId, client);
  return lots.reduce((sum, l) => sum + l.quantityRemaining, 0);
}

function evaluate(onchain: number, expected: number): { status: SyncResult['status']; discrepancyPct: number | null } {
  if (expected === 0) {
    return onchain > FIFO_DUST_EPSILON
      ? { status: 'discrepancy', discrepancyPct: null }
      : { status: 'ok', discrepancyPct: 0 };
  }
  const pct = Math.abs(onchain - expected) / expected;
  return { status: pct > DISCREPANCY_THRESHOLD ? 'discrepancy' : 'ok', discrepancyPct: pct };
}

async function syncOneAsset(
  asset: string,
  address: string,
  walletId: string,
  contractAddress: string | undefined,
  providerName: string,
  apiKey: string | undefined,
  client: PoolClient
): Promise<Omit<SyncResult, 'asset'>> {
  const failures = consecutiveFailures.get(providerName) ?? 0;
  if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
    const expectedBalance = await getExpectedBalance(asset, walletId, client);
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'circuit breaker abierto (proveedor con fallos repetidos)' };
  }

  const provider = getProviderForNetwork(providerName);
  const expectedBalance = await getExpectedBalance(asset, walletId, client);
  if (!provider) {
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'sin proveedor registrado para esta red' };
  }

  const result = await provider.getBalance(address, apiKey, contractAddress);
  if (!result.ok) {
    consecutiveFailures.set(providerName, failures + 1);
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: result.error };
  }
  consecutiveFailures.set(providerName, 0);

  const { status, discrepancyPct } = evaluate(result.balance, expectedBalance);
  return { status, onchainBalance: result.balance, expectedBalance, discrepancyPct };
}

export async function syncWalletAddress(walletAddressId: string): Promise<SyncResult[]> {
  return db.transaction(async client => {
    const addrRes = await client.query(
      `SELECT wa.wallet_id, wa.address, wa.network_id, n.name AS network_name, n.native_asset
       FROM wallet_addresses wa JOIN networks n ON n.id = wa.network_id
       WHERE wa.id = $1`,
      [walletAddressId]
    );
    if (addrRes.rows.length === 0 || !addrRes.rows[0].address) return [];
    const { wallet_id: walletId, address, network_id: networkId, network_name: networkName, native_asset: nativeAsset } = addrRes.rows[0];

    const apiKey = await resolveApiKey(networkId, networkName, client);
    const results: SyncResult[] = [];

    const nativeOutcome = await syncOneAsset(nativeAsset, address, walletId, undefined, networkName, apiKey, client);
    results.push({ asset: nativeAsset, ...nativeOutcome });

    const tokens = await client.query(`SELECT asset, contract_address FROM network_assets WHERE network_id = $1`, [networkId]);
    for (const token of tokens.rows) {
      const outcome = await syncOneAsset(token.asset, address, walletId, token.contract_address, networkName, apiKey, client);
      results.push({ asset: token.asset, ...outcome });
    }

    for (const r of results) {
      await client.query(
        `INSERT INTO balance_sync_log (wallet_address_id, asset, onchain_balance, expected_balance, discrepancy_pct, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [walletAddressId, r.asset, r.onchainBalance, r.expectedBalance, r.discrepancyPct, r.status]
      );
    }

    const native = results.find(r => r.asset === nativeAsset);
    if (native && native.onchainBalance !== null) {
      await client.query(
        `UPDATE wallet_addresses SET last_known_balance = $1, last_sync_at = clock_timestamp() WHERE id = $2`,
        [native.onchainBalance, walletAddressId]
      );
    }

    return results;
  });
}

export async function syncAllWalletAddresses(): Promise<void> {
  const addresses = await pool.query(`SELECT id FROM wallet_addresses WHERE address IS NOT NULL`);
  for (const row of addresses.rows) {
    try {
      await syncWalletAddress(row.id);
    } catch (err) {
      console.error(`[walletSync] error sincronizando wallet_address ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.query(`DELETE FROM balance_sync_log WHERE checked_at < NOW() - INTERVAL '90 days'`);
}
