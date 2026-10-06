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

// Solo para tests: aísla el estado del breaker entre casos (el Map es a
// nivel de módulo, y sin esto un test que abre el breaker contamina los
// siguientes en el mismo archivo).
export function resetCircuitBreakerState(): void {
  consecutiveFailures.clear();
}

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

// Qué activo sincronizar y con qué parámetros, resuelto por completo contra
// BD antes de tocar red — así `resolveOutcome` (la fase de red) no necesita
// ningún client de Postgres y puede ejecutarse con la conexión ya liberada.
interface AssetSyncPlan {
  asset: string;
  address: string;
  contractAddress: string | undefined;
  providerName: string;
  expectedBalance: number;
  // Si está presente, el activo ya tiene resultado final sin necesidad de
  // red (p. ej. token sin contract_address configurado) — ver buildPlans.
  skipOutcome?: Omit<SyncResult, 'asset'>;
}

async function buildPlans(
  client: PoolClient,
  walletId: string,
  address: string,
  networkId: string,
  networkName: string,
  nativeAsset: string
): Promise<AssetSyncPlan[]> {
  const plans: AssetSyncPlan[] = [{
    asset: nativeAsset,
    address,
    contractAddress: undefined,
    providerName: networkName,
    expectedBalance: await getExpectedBalance(nativeAsset, walletId, client),
  }];

  const tokens = await client.query(`SELECT asset, contract_address FROM network_assets WHERE network_id = $1`, [networkId]);
  for (const token of tokens.rows) {
    const expectedBalance = await getExpectedBalance(token.asset, walletId, client);
    if (!token.contract_address) {
      // Sin contract_address no hay forma de consultar el saldo de este
      // token — nunca se debe caer al saldo nativo por error (pasar
      // contractAddress=undefined a un provider es la señal de "activo
      // nativo", así que aquí hay que cortar explícitamente antes).
      plans.push({
        asset: token.asset, address, contractAddress: undefined, providerName: networkName, expectedBalance,
        skipOutcome: { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'sin contract_address configurado para este token — no se puede verificar' },
      });
      continue;
    }
    plans.push({ asset: token.asset, address, contractAddress: token.contract_address, providerName: networkName, expectedBalance });
  }
  return plans;
}

// Fase de red: circuit breaker + llamada al provider externo. No recibe ni
// toca ningún client de Postgres — se ejecuta con la conexión de BD ya
// liberada, para no mantenerla ocupada durante I/O externo (hasta 8s de
// timeout por llamada, ver providers/types.ts).
async function resolveOutcome(plan: AssetSyncPlan, apiKey: string | undefined): Promise<Omit<SyncResult, 'asset'>> {
  if (plan.skipOutcome) return plan.skipOutcome;

  const { providerName, expectedBalance } = plan;
  const failures = consecutiveFailures.get(providerName) ?? 0;
  if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
    // Se salta ESTE intento, pero resetea el contador para que el siguiente
    // vuelva a intentarlo de verdad — sin esto, un proveedor que se recupera
    // (ej. se configura la API key que faltaba) queda bloqueado para
    // siempre, porque solo un intento real puede resetear el contador a 0.
    consecutiveFailures.set(providerName, 0);
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'circuit breaker abierto (proveedor con fallos repetidos) — se reintentará en la próxima sincronización' };
  }

  const provider = getProviderForNetwork(providerName);
  if (!provider) {
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: 'sin proveedor registrado para esta red' };
  }
  if (provider.requiresApiKey && !apiKey) {
    // Corta antes de llamar al provider: nos ahorramos una petición de red
    // que ya sabemos que va a fallar (cada provider con requiresApiKey=true
    // se autoprotege igual internamente, esto es defensa en profundidad).
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: `falta API key para ${providerName}` };
  }

  const result = await provider.getBalance(plan.address, apiKey, plan.contractAddress);
  if (!result.ok) {
    consecutiveFailures.set(providerName, failures + 1);
    return { status: 'error', onchainBalance: null, expectedBalance, discrepancyPct: null, error: result.error };
  }
  consecutiveFailures.set(providerName, 0);

  const { status, discrepancyPct } = evaluate(result.balance, expectedBalance);
  return { status, onchainBalance: result.balance, expectedBalance, discrepancyPct };
}

async function persistResults(walletAddressId: string, nativeAsset: string, results: SyncResult[]): Promise<void> {
  await db.transaction(async client => {
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
  });
}

interface SyncPrep {
  plans: AssetSyncPlan[];
  apiKey: string | undefined;
  nativeAsset: string;
}

async function prepareSync(readClient: PoolClient, walletAddressId: string): Promise<SyncPrep | null> {
  const addrRes = await readClient.query(
    `SELECT wa.wallet_id, wa.address, wa.network_id, n.name AS network_name, n.native_asset
     FROM wallet_addresses wa JOIN networks n ON n.id = wa.network_id
     WHERE wa.id = $1`,
    [walletAddressId]
  );
  if (addrRes.rows.length === 0 || !addrRes.rows[0].address) return null;
  const { wallet_id: walletId, address, network_id: networkId, network_name: networkName, native_asset: nativeAsset } = addrRes.rows[0];

  const apiKey = await resolveApiKey(networkId, networkName, readClient);
  const plans = await buildPlans(readClient, walletId, address, networkId, networkName, nativeAsset);
  return { plans, apiKey, nativeAsset };
}

export async function syncWalletAddress(walletAddressId: string): Promise<SyncResult[]> {
  // Fase 1 (BD, conexión corta): resolver qué sincronizar. Se libera la
  // conexión del pool antes de la fase 2 para no mantenerla ocupada durante
  // las llamadas de red a providers externos, que pueden tardar varios
  // segundos — importante con un pool de solo 10 conexiones (ver
  // db/client.ts) si el usuario usa la app mientras corre la sincronización.
  const readClient = await pool.connect();
  let prep: SyncPrep | null;
  try {
    prep = await prepareSync(readClient, walletAddressId);
  } finally {
    readClient.release();
  }
  if (!prep) return [];

  // Fase 2 (red, sin BD): un provider por activo, secuencial.
  const results: SyncResult[] = [];
  for (const plan of prep.plans) {
    const outcome = await resolveOutcome(plan, prep.apiKey);
    results.push({ asset: plan.asset, ...outcome });
  }

  // Fase 3 (BD, transacción corta): persistir resultados.
  await persistResults(walletAddressId, prep.nativeAsset, results);
  return results;
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
