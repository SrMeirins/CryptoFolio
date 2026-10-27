import { BUY_TYPES, FEE_TYPES, FIAT_ASSETS, SELL_TYPES } from './operationGroups';

// Papel de cada consumo FIFO en el detalle (#405), a partir del tipo de la
// operación que consume y de su efecto fiscal, sin guardarlo en la base de
// datos. Un retiro o una transferencia mueven el lote sin efecto fiscal
// (traslado) y, si pagan la red con el mismo activo, esa parte es una
// disposición con ganancia o pérdida (comisión de red). Igual en la devolución
// de margen: el principal no tiene efecto y el exceso son intereses.

export const CONSUMPTION_ROLES = [
  'traslado', 'comision_red', 'venta', 'permuta', 'comision', 'perdida', 'donacion',
  'devolucion_margen', 'intereses_margen', 'otro',
] as const;
export type ConsumptionRole = typeof CONSUMPTION_ROLES[number];

const MOVES = new Set(['WITHDRAW', 'TRANSFER_INTERNAL', 'STAKING_LOCK', 'STAKING_UNLOCK', 'LAUNCHPOOL_LOCK', 'LAUNCHPOOL_UNLOCK']);
const has = (list: readonly string[], v: string) => list.includes(v);

export function consumptionRole(operationType: string, asset: string | null, fiscalEvent: string): ConsumptionRole {
  const fiscal = fiscalEvent !== 'NONE';
  if (MOVES.has(operationType)) return fiscal ? 'comision_red' : 'traslado';
  if (operationType === 'MARGIN_REPAY') return fiscal ? 'intereses_margen' : 'devolucion_margen';
  if (has(SELL_TYPES, operationType)) return 'venta';
  // Comprar fiat entregando cripto es una venta; comprar cripto con cripto, una permuta.
  if (has(BUY_TYPES, operationType)) return asset && has(FIAT_ASSETS, asset) ? 'venta' : 'permuta';
  if (has(FEE_TYPES, operationType)) return 'comision';
  if (operationType === 'LOST') return 'perdida';
  if (operationType === 'GIFT_SENT') return 'donacion';
  return 'otro';
}
