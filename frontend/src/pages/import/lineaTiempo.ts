import type { CoberturaExchange } from './types'
import { finEscala } from './coberturaVista'

// Línea de tiempo única de todas las importaciones (#328): en cada periodo,
// qué exchanges tienen datos (solo Binance, solo Bitvavo, ambos o ninguno).
// Lógica pura; fechas «YYYY-MM-DD» en UTC.

export type ExchangeId = 'binance' | 'bitvavo'
export type Zona = ExchangeId | 'ambos' | 'ninguno'

export interface TramoLinea {
  desde: string
  hasta: string
  zona: Zona
  /** «Sin datos» posterior al último dato de todos los exchanges: pendiente de importar. */
  pendiente: boolean
  dias: number
}

export interface MesLinea { mes: string; total: number; porExchange: Partial<Record<ExchangeId, number>>; nivel: number }

export interface LineaCombinada {
  inicio: string
  fin: string
  tramos: TramoLinea[]
  nuevos: { desde: string; hasta: string; exchange: ExchangeId; archivo: string }[]
  meses: MesLinea[]
  exchanges: ExchangeId[]
}

const DIA = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const dia = (t: number) => new Date(t).toISOString().slice(0, 10)

export function lineaCombinada(cs: readonly CoberturaExchange[]): LineaCombinada | null {
  if (cs.length === 0) return null
  const inicio = cs.map(c => c.desde).sort()[0]
  const fin = cs.map(finEscala).sort().at(-1)!
  const ultimoDato = cs.map(c => c.hasta).sort().at(-1)!

  // Puntos de corte: inicio y fin (exclusivo) de cada tramo importado.
  const cortes = new Set<number>([ms(inicio), ms(fin) + DIA])
  for (const c of cs) for (const t of c.tramos) { cortes.add(ms(t.desde)); cortes.add(ms(t.hasta) + DIA) }
  const puntos = [...cortes].filter(p => p >= ms(inicio) && p <= ms(fin) + DIA).sort((a, b) => a - b)

  const tramos: TramoLinea[] = []
  for (let i = 0; i < puntos.length - 1; i++) {
    const d = dia(puntos[i])
    const con = cs.filter(c => c.tramos.some(t => t.desde <= d && t.hasta >= d)).map(c => c.exchange)
    const zona: Zona = con.length === 0 ? 'ninguno' : con.length > 1 ? 'ambos' : con[0]
    const pendiente = zona === 'ninguno' && d > ultimoDato
    const hasta = dia(puntos[i + 1] - DIA)
    const prev = tramos.at(-1)
    if (prev && prev.zona === zona && prev.pendiente === pendiente) {
      prev.hasta = hasta
      prev.dias = Math.round((ms(hasta) - ms(prev.desde)) / DIA) + 1
    } else {
      tramos.push({ desde: d, hasta, zona, pendiente, dias: Math.round((ms(hasta) - ms(d)) / DIA) + 1 })
    }
  }

  const nuevos = cs.flatMap(c => c.tramos.flatMap(t => t.importaciones.filter(i => i.nuevo)
    .map(i => ({ desde: i.desde, hasta: i.hasta, exchange: c.exchange, archivo: i.archivo }))))

  // Actividad mensual sumando exchanges, con el desglose para el tooltip.
  const porMes = new Map<string, Partial<Record<ExchangeId, number>>>()
  for (const c of cs) for (const m of c.meses) porMes.set(m.mes, { ...porMes.get(m.mes), [c.exchange]: m.n })
  const totales = [...porMes.values()].map(v => (v.binance ?? 0) + (v.bitvavo ?? 0))
  const max = Math.max(1, ...totales)
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

  return { inicio, fin, tramos, nuevos, meses, exchanges: cs.map(c => c.exchange) }
}
