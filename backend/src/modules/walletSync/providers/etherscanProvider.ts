import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 1; // Ethereum mainnet
const DECIMALS_SELECTOR = '0x313ce567'; // decimals()

async function fetchDecimals(contractAddress: string, apiKey: string): Promise<number> {
  const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=proxy&action=eth_call&to=${contractAddress}&data=${DECIMALS_SELECTOR}&tag=latest&apikey=${apiKey}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  return parseInt(data.result, 16);
}

export const etherscanProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey, contractAddress): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Ethereum (Etherscan)' };
    try {
      if (!contractAddress) {
        const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
        const res = await fetchWithTimeout(url);
        const data = await res.json();
        if (data.status !== '1') return { ok: false, error: data.result ?? 'fallo de Etherscan' };
        return { ok: true, balance: Number(data.result) / 1e18 };
      }

      const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${apiKey}`;
      const res = await fetchWithTimeout(url);
      const data = await res.json();
      if (data.status !== '1') return { ok: false, error: data.result ?? 'fallo de Etherscan' };
      const decimals = await fetchDecimals(contractAddress, apiKey);
      return { ok: true, balance: Number(data.result) / 10 ** decimals };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
