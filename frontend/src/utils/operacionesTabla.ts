import type { FiscalEvent } from '../pages/fiscal/types'
import { fiscalTypeLabel } from './fiscalTable'

// Tabla de Operaciones (#543): una fila por operación con sus lotes FIFO,
// las operaciones sin efecto fiscal aparte y las microoperaciones del mismo
// día y activo agrupadas. Una operación tiene la misma forma que un evento
// (sus importes son la suma de sus lotes), así que los filtros, el orden y
// los avisos de fiscalOperations.ts sirven igual. Funciones puras.

export interface Operacion extends FiscalEvent {
  /** Lotes FIFO que consumió, en orden de compra. */
  lotes: FiscalEvent[]
}

const EPS = 0.005

/**
 * Agrupa los eventos (uno por lote) en operaciones, en el orden de aparición.
 * Una operación es una transacción y un activo entregado: una compra con
 * comisión en BNB consume en la misma transacción lo pagado y el BNB, que son
 * dos operaciones distintas (#543).
 */
export function agruparOperaciones(events: readonly FiscalEvent[]): Operacion[] {
  const porTx = new Map<string, FiscalEvent[]>()
  for (const e of events) {
    const k = `${e.txId}|${e.activoTransmitido}`
    const l = porTx.get(k)
    if (l) l.push(e)
    else porTx.set(k, [e])
  }
  return [...porTx.values()].map(lotes => {
    const [p] = lotes
    const suma = (k: 'cantidadTransmitida' | 'valorTransmisionEur' | 'gastosTransmisionEur' | 'valorAdquisicionEur' | 'gastosAdquisicionEur' | 'gananciaPerdidaEur' | 'comisionCompraEur') =>
      lotes.reduce((t, e) => t + (e[k] ?? 0), 0)
    return {
      ...p,
      eventId: `${p.txId}|${p.activoTransmitido}`,
      cantidadTransmitida: suma('cantidadTransmitida'),
      valorTransmisionEur: suma('valorTransmisionEur'),
      gastosTransmisionEur: suma('gastosTransmisionEur'),
      valorAdquisicionEur: suma('valorAdquisicionEur'),
      gastosAdquisicionEur: suma('gastosAdquisicionEur'),
      gananciaPerdidaEur: suma('gananciaPerdidaEur'),
      comisionCompraEur: suma('comisionCompraEur'),
      contrapartidaRevisar: lotes.some(e => e.contrapartidaRevisar),
      posiblePerdidaDiferida: lotes.some(e => e.posiblePerdidaDiferida),
      lostSinMotivo: lotes.some(e => e.lostSinMotivo),
      permutaWrapStaking: lotes.some(e => e.permutaWrapStaking),
      lotes: [...lotes].sort((a, b) => (a.fechaAdquisicion ?? '').localeCompare(b.fechaAdquisicion ?? '')),
    }
  })
}

/** Sin efecto fiscal: ni ganancia o pérdida ni valor de transmisión. No se declara. */
export function sinEfecto(o: Pick<FiscalEvent, 'gananciaPerdidaEur' | 'valorTransmisionEur'>): boolean {
  return Math.abs(o.gananciaPerdidaEur ?? 0) < EPS && Math.abs(o.valorTransmisionEur) < EPS
}

/** «BTC por EUR», «ETH por USDC»; sin contrapartida, el destino según el tipo («BNB en comisión»). */
export function parTexto(o: Pick<FiscalEvent, 'activoTransmitido' | 'activoRecibido' | 'tipo'>): string {
  if (o.activoRecibido) return `${o.activoTransmitido} por ${o.activoRecibido}`
  const tone = fiscalTypeLabel(o.tipo, o.activoRecibido).tone
  return tone === 'fee' ? `${o.activoTransmitido} en comisión` : tone === 'margin' ? `${o.activoTransmitido} en margen` : o.activoTransmitido
}

export interface GrupoMicro {
  clave: string
  fecha: string
  activo: string
  operaciones: Operacion[]
  valorTransmisionEur: number
  gastosTransmisionEur: number
  valorAdquisicionEur: number
  gastosAdquisicionEur: number
  gananciaPerdidaEur: number
}

export type FilaTabla = { tipo: 'operacion'; op: Operacion } | { tipo: 'micro'; grupo: GrupoMicro }

/** Umbral de las microoperaciones: valor de transmisión por debajo de 1 €. */
export const UMBRAL_MICRO = 1

/**
 * Filas de la tabla: cada operación, salvo las microoperaciones del mismo día
 * y activo (dos o más), que se agrupan en una fila con sus totales. Mantiene
 * el orden: el grupo ocupa el lugar de su primera operación.
 */
export function filasTabla(ops: readonly Operacion[], umbral = UMBRAL_MICRO): FilaTabla[] {
  const micro = (o: Operacion) => o.valorTransmisionEur < umbral
  const claveDe = (o: Operacion) => `${o.fecha}|${o.activoTransmitido}`
  const cuenta = new Map<string, number>()
  for (const o of ops) if (micro(o)) cuenta.set(claveDe(o), (cuenta.get(claveDe(o)) ?? 0) + 1)
  const grupos = new Map<string, GrupoMicro>()
  const filas: FilaTabla[] = []
  for (const o of ops) {
    const k = claveDe(o)
    if (!micro(o) || (cuenta.get(k) ?? 0) < 2) { filas.push({ tipo: 'operacion', op: o }); continue }
    let g = grupos.get(k)
    if (!g) {
      g = { clave: `micro-${k}`, fecha: o.fecha, activo: o.activoTransmitido, operaciones: [],
        valorTransmisionEur: 0, gastosTransmisionEur: 0, valorAdquisicionEur: 0, gastosAdquisicionEur: 0, gananciaPerdidaEur: 0 }
      grupos.set(k, g)
      filas.push({ tipo: 'micro', grupo: g })
    }
    g.operaciones.push(o)
    g.valorTransmisionEur += o.valorTransmisionEur
    g.gastosTransmisionEur += o.gastosTransmisionEur
    g.valorAdquisicionEur += o.valorAdquisicionEur
    g.gastosAdquisicionEur += o.gastosAdquisicionEur
    g.gananciaPerdidaEur += o.gananciaPerdidaEur ?? 0
  }
  return filas
}

/** Si hay gastos de transmisión y de adquisición en alguna operación: si no, su columna no se muestra. */
export function hayGastos(ops: readonly Operacion[]): { gastosTransmision: boolean; gastosAdquisicion: boolean } {
  return { gastosTransmision: ops.some(o => o.gastosTransmisionEur > EPS), gastosAdquisicion: ops.some(o => o.gastosAdquisicionEur > EPS) }
}

/** Tira de la tabla: ganancias, pérdidas y pérdidas diferidas por recompra de lo que se ve. */
export function resumenTabla(ops: readonly Operacion[]): { ganancias: number; perdidas: number; neto: number; diferidas: number; nDiferidas: number } {
  let ganancias = 0, perdidas = 0, diferidas = 0, nDiferidas = 0
  for (const o of ops) {
    const gp = o.gananciaPerdidaEur ?? 0
    if (gp > 0) ganancias += gp
    else perdidas += gp
    if (o.posiblePerdidaDiferida && gp < 0) { diferidas += gp; nDiferidas++ }
  }
  return { ganancias, perdidas, neto: ganancias + perdidas, diferidas, nDiferidas }
}
