import { fetchWithTimeout } from '../walletSync/providers/types';
import { cabecerasCoinGecko, coinGeckoBaseUrl, PlanCoinGecko } from '../prices/coingeckoClient';
import { ServicioId } from './servicios';

// Comprobación de una clave contra su servicio (versión 1.0). Distingue una
// clave rechazada (no se guarda) de un servicio que no responde (se guarda con
// aviso): respuestas verificadas con una clave inválida contra cada API real.
//   Etherscan: status "0" y «Invalid API Key».  Blockfrost: 403.
//   PubFi/Subscan: 401.  CoinGecko: /ping con la cabecera del plan, 401.
export type Comprobacion = 'aceptada' | 'rechazada' | 'sin_respuesta';

// Dirección nula de Ethereum: la consulta de saldo solo sirve para autenticar.
const DIRECCION_NULA = '0x0000000000000000000000000000000000000000';

function porEstado(status: number): Comprobacion {
  if (status === 401 || status === 403) return 'rechazada';
  return status >= 200 && status < 300 ? 'aceptada' : 'sin_respuesta';
}

async function etherscan(clave: string): Promise<Comprobacion> {
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${DIRECCION_NULA}&tag=latest&apikey=${encodeURIComponent(clave)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return porEstado(res.status);
  const data = await res.json() as { status?: string; result?: unknown };
  if (data.status === '1') return 'aceptada';
  return /invalid api key|missing/i.test(String(data.result ?? '')) ? 'rechazada' : 'sin_respuesta';
}

async function blockfrost(clave: string): Promise<Comprobacion> {
  const res = await fetchWithTimeout('https://cardano-mainnet.blockfrost.io/api/v0/epochs/latest', { headers: { project_id: clave } });
  return porEstado(res.status);
}

async function subscan(clave: string): Promise<Comprobacion> {
  const res = await fetchWithTimeout('https://api.pubfi.ai/v1/gateway/subscan/assethub-polkadot/api/scan/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: '{}',
  });
  return porEstado(res.status);
}

async function coingecko(clave: string, plan: PlanCoinGecko): Promise<Comprobacion> {
  const res = await fetchWithTimeout(`${coinGeckoBaseUrl(plan)}/ping`, { headers: { Accept: 'application/json', ...cabecerasCoinGecko(clave, plan) } });
  return porEstado(res.status);
}

/** Prueba una clave contra su servicio; un fallo de red cuenta como «sin respuesta». */
export async function comprobarClave(servicio: ServicioId, clave: string, plan: PlanCoinGecko = 'demo'): Promise<Comprobacion> {
  try {
    if (servicio === 'etherscan') return await etherscan(clave);
    if (servicio === 'blockfrost') return await blockfrost(clave);
    if (servicio === 'subscan') return await subscan(clave);
    return await coingecko(clave, plan);
  } catch {
    return 'sin_respuesta';
  }
}
