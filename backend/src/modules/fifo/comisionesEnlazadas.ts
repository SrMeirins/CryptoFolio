import { getHistoricalPriceEur } from '../prices/binance';
import type { Transaction } from './constants';

/**
 * Valor en EUR de las comisiones de una orden pagadas en otra moneda (#543),
 * al precio del momento de la operación. Es gasto de la compra (se suma al
 * coste) o de la venta (se resta de lo obtenido); el activo de la comisión se
 * consume aparte, en su propia fila FEE_EXCHANGE, con el mismo precio.
 */
export async function valorComisionesEnlazadas(tx: Pick<Transaction, 'comisiones_enlazadas' | 'timestamp'>): Promise<number> {
  let total = 0;
  for (const c of tx.comisiones_enlazadas ?? []) {
    if (!(c.amount > 0)) continue;
    total += c.amount * await getHistoricalPriceEur(c.asset, tx.timestamp);
  }
  return total;
}
