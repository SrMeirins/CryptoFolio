// Solo moneda de curso legal. Las stablecoins (USDT/USDC/BUSD/DAI) NO lo son
// (criterio DGT reiterado): se clasifican como otra moneda virtual (N).
//
// Ámbito fiscal/AEAT (qué es legal tender para Hacienda) — NO confundir con
// el FIAT_ASSETS de modules/csv/parser.ts (ámbito distinto: qué cuenta como
// fiat al interpretar un CSV de Binance). Mismo nombre, propósito distinto;
// no fusionar ambas listas.
//
// Los símbolos llegan siempre en mayúsculas: todo punto de escritura de
// transactions.asset/cost_asset normaliza con .toUpperCase() antes de
// persistir (parser.ts, bitvavoParser.ts, routes/transactions.ts).
const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS']);

// Tipo de contraprestación de la casilla 1800 (#531), con las claves del
// desplegable de Renta WEB según las guías de la campaña (Taxdown):
//   F  venta por dinero de curso legal
//   N  intercambio por otra moneda virtual (permuta, stablecoins incluidas)
//   O  intercambio por otro activo virtual (NFT); la app no tiene NFT, así
//      que no se devuelve, pero se documenta por completitud
//   B  entrega de cripto como pago de un bien o servicio: comisiones de
//      exchange y de red e intereses de margen pagados en cripto
// Donaciones y pérdidas no tienen contraprestación ni clave que encaje: van
// sin letra y marcadas para revisar.
export type ClaveContraprestacion = 'F' | 'N' | 'O' | 'B' | '';

export interface Contraprestacion {
  clave: ClaveContraprestacion;
  descripcion: string;
  /** Sin clave segura: el usuario debe revisarla antes de declarar. */
  revisar: boolean;
}

const FEE_OPS = new Set(['FEE', 'FEE_EXCHANGE', 'FEE_NETWORK']);
const MOVES = new Set(['WITHDRAW', 'TRANSFER_INTERNAL']);

export interface ConsumoFiscal {
  /** Tipo de la operación que consume el lote. */
  operationType: string;
  /** Activo del lote consumido (lo que se transmite). */
  activoTransmitido: string;
  /** Activo, coste y comisión de la operación. */
  txAsset: string | null;
  costAsset: string | null;
  feeAsset: string | null;
}

/** Qué se recibió a cambio del activo transmitido; null si nada (comisión, pérdida, donación). */
export function activoRecibido(c: ConsumoFiscal): string | null {
  if (esPagoDeServicio(c) || c.operationType === 'LOST' || c.operationType === 'GIFT_SENT') return null;
  // Permuta (comprar B con A): la operación es del activo B y se transmite A.
  if (c.txAsset && c.txAsset !== c.activoTransmitido) return c.txAsset;
  // Venta de A por B: B es el activo de coste.
  return c.costAsset || null;
}

/**
 * Comisiones (en una operación propia, o pagadas en un tercer activo dentro de
 * una compra o venta), comisión de red de un traspaso e intereses de margen.
 */
function esPagoDeServicio(c: ConsumoFiscal): boolean {
  if (FEE_OPS.has(c.operationType) || MOVES.has(c.operationType) || c.operationType === 'MARGIN_REPAY') return true;
  // Comisión en un tercer activo (BNB al vender XRP por EUR): se consume aparte.
  return c.feeAsset === c.activoTransmitido && c.txAsset !== c.activoTransmitido && c.costAsset !== c.activoTransmitido;
}

export function getContraprestacion(c: ConsumoFiscal): Contraprestacion {
  if (c.operationType === 'GIFT_SENT') {
    return { clave: '', descripcion: 'Donación: sin contraprestación, revisar con un asesor', revisar: true };
  }
  if (c.operationType === 'LOST') {
    return { clave: '', descripcion: 'Pérdida o robo: depende del motivo, revisar con un asesor', revisar: true };
  }
  if (esPagoDeServicio(c)) {
    return { clave: 'B', descripcion: 'Pago de un bien o servicio (B)', revisar: false };
  }
  const recibido = activoRecibido(c);
  if (!recibido) {
    return { clave: '', descripcion: 'Contraprestación desconocida, revisar', revisar: true };
  }
  if (FIAT_ASSETS.has(recibido)) {
    return { clave: 'F', descripcion: `Moneda de curso legal, ${recibido} (F)`, revisar: false };
  }
  return { clave: 'N', descripcion: `Otra moneda virtual, ${recibido} (N)`, revisar: false };
}
