import { FIAT_NO_LOT } from '../fifo/constants';

// Icono de las monedas fiat (#246): la bandera de su país, desde flagcdn.com
// (Flagpedia, dominio público). Se descarga por el mismo canal seguro que los
// logos de CoinGecko. La lista de monedas es fija, así que la descarga no
// revela qué monedas tiene el usuario.

export const FLAG_HOST = 'flagcdn.com';

/** Monedas fiat con bandera. */
export const FIAT_ICON_SYMBOLS: readonly string[] = [...FIAT_NO_LOT].sort();

/**
 * País de la bandera de una moneda: las dos primeras letras del código
 * ISO 4217 son el código ISO 3166 del país (USD → us, GBP → gb). El euro usa
 * la bandera de la UE; los códigos supranacionales (X..) no tienen bandera.
 */
export function fiatFlagCountry(code: string): string | null {
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (code === 'EUR') return 'eu';
  if (code.startsWith('X')) return null;
  return code.slice(0, 2).toLowerCase();
}

/** URL de la bandera (80 px de alto: nítida a 2x en los tamaños de la app), o null. */
export function fiatFlagUrl(code: string): string | null {
  const country = fiatFlagCountry(code);
  return country ? `https://${FLAG_HOST}/h80/${country}.png` : null;
}
