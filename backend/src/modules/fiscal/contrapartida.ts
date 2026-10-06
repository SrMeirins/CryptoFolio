// Solo moneda de curso legal. Las stablecoins (USDT/USDC/BUSD/DAI) NO lo son
// (criterio DGT reiterado): se clasifican como otra moneda virtual (V).
//
// Ámbito fiscal/AEAT (qué es legal tender para Hacienda) — NO confundir con
// el FIAT_ASSETS de modules/csv/parser.ts (ámbito distinto: qué cuenta como
// fiat al interpretar un CSV de Binance). Mismo nombre, propósito distinto;
// no fusionar ambas listas.
//
// activoRecibido llega siempre en mayúsculas: todo punto de escritura de
// transactions.asset/cost_asset normaliza con .toUpperCase() antes de
// persistir (parser.ts, bitvavoParser.ts, routes/transactions.ts) — sin
// necesidad de normalizar aquí también.
const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS']);

// Claves oficiales AEAT: D=Dinero, V=Valores/cripto, I=Inmueble, O=Otros/sin
// contrapartida. "I" nunca se devuelve — CryptoFolio no tiene dominio de
// inmuebles, solo cripto; se documenta por completitud del catálogo AEAT.
export function getContrapartidaClave(activoRecibido: string | null): { clave: string; descripcion: string } {
  if (!activoRecibido)                 return { clave: 'O', descripcion: 'Sin contrapartida directa (comision/perdida)' };
  if (FIAT_ASSETS.has(activoRecibido)) return { clave: 'D', descripcion: `Moneda de curso legal (${activoRecibido})` };
  return { clave: 'V', descripcion: `Otra moneda virtual (${activoRecibido})` };
}
