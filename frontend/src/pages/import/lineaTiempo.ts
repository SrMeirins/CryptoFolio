import type { CoberturaExchange, HuecoCobertura } from './types'
import { finEscala } from './coberturaVista'

// Línea de tiempo de todas las importaciones (#328, #332): un carril por exchange
// sobre una escala común (de la primera transacción de cualquiera a hoy), los
// archivos nuevos del lote y la actividad mensual sumada. Lógica pura; fechas
// «YYYY-MM-DD» en UTC.

export type ExchangeId = 'binance' | 'bitvavo'

export interface Carril {
  exchange: ExchangeId
  tramos: { desde: string; hasta: string; transacciones: number }[]
  huecos: HuecoCobertura[]
  pendiente: HuecoCobertura | null
}

export interface MesLinea { mes: string; total: number; porExchange: Partial<Record<ExchangeId, number>>; nivel: number }

export interface LineaCombinada {
  inicio: string
  fin: string
  carriles: Carril[]
  nuevos: { desde: string; hasta: string; exchange: ExchangeId; archivo: string }[]
  meses: MesLinea[]
}

const ORDEN: Record<ExchangeId, number> = { binance: 0, bitvavo: 1 }

export function lineaCombinada(cs: readonly CoberturaExchange[]): LineaCombinada | null {
  if (cs.length === 0) return null
  const inicio = cs.map(c => c.desde).sort()[0]
  const fin = cs.map(finEscala).sort().at(-1)!

  const carriles: Carril[] = [...cs].sort((a, b) => ORDEN[a.exchange] - ORDEN[b.exchange]).map(c => ({
    exchange: c.exchange,
    tramos: c.tramos.map(t => ({ desde: t.desde, hasta: t.hasta, transacciones: t.transacciones })),
    huecos: c.huecos,
    pendiente: c.pendiente,
  }))

  const nuevos = cs.flatMap(c => c.tramos.flatMap(t => t.importaciones.filter(i => i.nuevo)
    .map(i => ({ desde: i.desde, hasta: i.hasta, exchange: c.exchange, archivo: i.archivo }))))

  // Actividad mensual sumando exchanges, con el desglose para el tooltip.
  const porMes = new Map<string, Partial<Record<ExchangeId, number>>>()
  for (const c of cs) for (const m of c.meses) porMes.set(m.mes, { ...porMes.get(m.mes), [c.exchange]: m.n })
  const max = Math.max(1, ...[...porMes.values()].map(v => (v.binance ?? 0) + (v.bitvavo ?? 0)))
  const meses: MesLinea[] = []
  let [y, m] = [Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7))]
  const [yf, mf] = [Number(fin.slice(0, 4)), Number(fin.slice(5, 7))]
  while (y < yf || (y === yf && m <= mf)) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    const porExchange = porMes.get(mes) ?? {}
    const total = (porExchange.binance ?? 0) + (porExchange.bitvavo ?? 0)
    meses.push({ mes, total, porExchange, nivel: total === 0 ? 0 : Math.max(1, Math.ceil((total / max) * 4)) })
    if (++m > 12) { m = 1; y++ }
  }

  return { inicio, fin, carriles, nuevos, meses }
}
