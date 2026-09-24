import { BalanceProvider, BalanceResult, fetchWithTimeout, sleep } from './types';

const BASE_URL = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 1; // Ethereum mainnet
const DECIMALS_SELECTOR = '0x313ce567'; // decimals()
// Etherscan documenta 5 llamadas/seg en el plan gratuito, pero en pruebas
// reales contra una key recién creada el límite efectivo se comporta como un
// contador por segundo de reloj (no una ventana deslizante): con respuestas
// rápidas, 3-4 llamadas seguidas caían dentro del mismo segundo pese a dejar
// 300-400ms entre cada una. 600ms de margen (<2 llamadas/seg) da colchón real
// verificado, no solo el teórico. Consultar un token exige 2 llamadas
// (tokenbalance + eth_call decimals).
const THROTTLE_MS = 600;

// Forma parcial de las respuestas de la API v2 de Etherscan (proxy/account)
interface EtherscanResponse {
  status?: string;
  result?: string;
  message?: string;
}

// Ritmo global entre llamadas a Etherscan — no solo dentro de una consulta de
// token (tokenbalance + decimals), sino también ENTRE tokens distintos de la
// misma dirección (ej. LINK seguido de USDC): en producción el rate limit
// saltaba justo ahí, con llamadas de tokens diferentes sin ningún margen.
let nextCallAt = 0;

// Solo para tests: sin esto, el estado de ritmo persiste entre casos del
// mismo archivo y un test con fake timers puede dejar `nextCallAt` en un
// instante que no tiene sentido una vez se vuelve a tiempo real.
export function resetThrottleState(): void {
  nextCallAt = 0;
}

async function pacedFetch(url: string): Promise<Response> {
  const wait = nextCallAt - Date.now();
  if (wait > 0) await sleep(wait);
  nextCallAt = Date.now() + THROTTLE_MS;
  return fetchWithTimeout(url);
}

async function fetchDecimals(contractAddress: string, apiKey: string): Promise<number> {
  const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=proxy&action=eth_call&to=${contractAddress}&data=${DECIMALS_SELECTOR}&tag=latest&apikey=${apiKey}`;
  const res = await pacedFetch(url);
  const data = (await res.json()) as EtherscanResponse;
  return parseInt(data.result as string, 16);
}

export const etherscanProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey, contractAddress): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Ethereum (Etherscan)' };
    try {
      if (!contractAddress) {
        const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
        const res = await pacedFetch(url);
        const data = (await res.json()) as EtherscanResponse;
        if (data.status !== '1') return { ok: false, error: data.result ?? 'fallo de Etherscan' };
        return { ok: true, balance: Number(data.result) / 1e18 };
      }

      const url = `${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${apiKey}`;
      const res = await pacedFetch(url);
      const data = (await res.json()) as EtherscanResponse;
      if (data.status !== '1') return { ok: false, error: data.result ?? 'fallo de Etherscan' };
      const decimals = await fetchDecimals(contractAddress, apiKey);
      return { ok: true, balance: Number(data.result) / 10 ** decimals };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
