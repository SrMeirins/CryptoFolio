import { formatEur } from '../../../utils/format'
import { fiscalTypeLabel } from '../../../utils/fiscalTable'
import type { CanalOperacion, FiscalEvent } from '../types'

// Canal y comisión de una permuta (#543). El canal explica por qué dos
// permutas parecidas difieren en comisiones: una orden trae su comisión
// explícita; Convert y saldos pequeños la llevan dentro del cambio. La
// comisión de una compra va al coste de lo recibido y no es gasto de su fila.

export type ConComision = Pick<FiscalEvent, 'comisionCompraEur' | 'esConvert' | 'activoRecibido' | 'canal' | 'tipo'>

export const EPS_COMISION = 0.005

interface InfoCanal { corto: string; titulo: string; texto: string }

export const CANALES: Record<CanalOperacion, InfoCanal> = {
  orden: {
    corto: 'Orden',
    titulo: 'Orden de mercado',
    texto: 'Orden de mercado: compra o venta en el libro de órdenes. Binance cobra la comisión aparte, una línea por cada ejecución, así que su importe es exacto.',
  },
  convert: {
    corto: 'Convert',
    titulo: 'Binance Convert',
    texto: 'Binance Convert: la comisión va incluida en el tipo de cambio y Binance no la desglosa, así que no hay un importe aparte que declarar.',
  },
  saldos: {
    corto: 'Saldos a BNB',
    titulo: 'Saldos pequeños a BNB',
    texto: 'Conversión de saldos pequeños a BNB: la comisión va incluida en el cambio y Binance no la desglosa.',
  },
  liquidacion: {
    corto: 'Liquidación',
    titulo: 'Liquidación de margen',
    texto: 'Liquidación de margen: Binance vendió el activo para cubrir la deuda; su comisión de liquidación figura como comisión aparte.',
  },
}

/** Canal de una permuta, o null si no es permuta o no se sabe el canal. */
export function canalDePermuta(op: Pick<FiscalEvent, 'canal' | 'esConvert' | 'tipo' | 'activoRecibido'>): CanalOperacion | null {
  // Sin activo recibido es una comisión pagada en BNB dentro de la orden, no una permuta.
  if (!op.activoRecibido || fiscalTypeLabel(op.tipo, op.activoRecibido).tone !== 'swap') return null
  return op.canal ?? (op.esConvert ? 'convert' : null)
}

/** Comisión de la compra al coste de lo recibido, o null si no hay. */
export function textoComision(op: ConComision): string | null {
  const c = op.comisionCompraEur ?? 0
  if (c < EPS_COMISION) return null
  return `Comisión de la compra: ${formatEur(c)}. Se suma al coste del ${op.activoRecibido ?? 'activo'} recibido y se deduce como gasto de adquisición cuando lo vendas; no es gasto de esta fila.`
}

/** Canal y comisión juntos, para el detalle, la tarjeta y el icono de la densidad compacta. */
export function textoNota(op: ConComision): string | null {
  const canal = canalDePermuta(op)
  const partes = [canal ? CANALES[canal].texto : null, textoComision(op)].filter((t): t is string => !!t)
  return partes.length > 0 ? partes.join(' ') : null
}
