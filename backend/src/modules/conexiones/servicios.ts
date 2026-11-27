// Servicios externos con clave de API (versión 1.0), para Ajustes, Conexiones.
// Las tres primeras verifican el saldo on-chain de una red; CoinGecko da los
// precios. La variable de entorno es la alternativa de Docker: la clave
// guardada en Ajustes tiene prioridad.

export type ServicioId = 'etherscan' | 'blockfrost' | 'subscan' | 'coingecko';

export interface Servicio {
  id: ServicioId;
  nombre: string;
  /** Red de la tabla networks cuya verificación usa la clave (null en CoinGecko). */
  red: string | null;
  variableEntorno: string;
  /** Dónde conseguir una clave gratuita. */
  enlace: string;
}

export const SERVICIOS: readonly Servicio[] = [
  { id: 'etherscan', nombre: 'Etherscan', red: 'Ethereum', variableEntorno: 'ETHERSCAN_API_KEY', enlace: 'https://etherscan.io/myapikey' },
  { id: 'blockfrost', nombre: 'Blockfrost', red: 'Cardano', variableEntorno: 'BLOCKFROST_API_KEY', enlace: 'https://blockfrost.io' },
  { id: 'subscan', nombre: 'Subscan (PubFi)', red: 'Polkadot Asset Hub', variableEntorno: 'SUBSCAN_API_KEY', enlace: 'https://pubfi.ai/products/subscan-api' },
  { id: 'coingecko', nombre: 'CoinGecko', red: null, variableEntorno: 'COINGECKO_API_KEY', enlace: 'https://www.coingecko.com/en/api/pricing' },
];

export const SERVICIO_IDS = SERVICIOS.map(s => s.id) as [ServicioId, ...ServicioId[]];

export function servicioPorId(id: ServicioId): Servicio {
  return SERVICIOS.find(s => s.id === id)!;
}
