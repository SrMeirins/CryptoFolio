import type { RendimientoEvent } from '../pages/fiscal/types'
import { claveDe, type ClaveTipo } from './rendimientos'

// Panel de ingresos pasivos del Dashboard (#518): staking, intereses,
// minería, airdrops y cashback de los rendimientos de Fiscal (#544), en € al
// recibirlos. Totales del año en curso y de los últimos 12 meses, serie de
// los 12 meses por tipo y desglose por activo o por wallet. Funciones puras.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const pad = (n: number) => String(n).padStart(2, '0')
const vacio = (): Record<ClaveTipo, number> => ({ staking: 0, intereses: 0, mineria: 0, airdrop: 0, cashback: 0 })

export interface MesSerie { ym: string; label: string; anio: number; total: number; porTipo: Record<ClaveTipo, number>; acumulado: number }

/** Primer día de la ventana de 12 meses que termina en el mes de hoy. */
export function inicioDoceMeses(today: string): string {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const idx = y * 12 + (m - 1) - 11
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`
}

/** Rendimientos de los últimos 12 meses (hasta hoy). */
export function ultimosDoceMeses(rends: readonly RendimientoEvent[], today: string): RendimientoEvent[] {
  const desde = inicioDoceMeses(today)
  return rends.filter(r => r.fecha >= desde && r.fecha <= today)
}

/** Totales del año en curso y de los últimos 12 meses, con el número de cobros. */
export function totalesIngresos(rends: readonly RendimientoEvent[], today: string) {
  const anio = today.slice(0, 4)
  const delAnio = rends.filter(r => r.fecha.startsWith(anio) && r.fecha <= today)
  const doce = ultimosDoceMeses(rends, today)
  const suma = (xs: readonly RendimientoEvent[]) => Math.round(xs.reduce((s, r) => s + r.valorEur, 0) * 100) / 100
  return { anio: suma(delAnio), nAnio: delAnio.length, doceMeses: suma(doce), nDoce: doce.length }
}

/** Serie de los 12 meses hasta el actual, por tipo (meses sin cobros a 0). */
export function serieDoceMeses(rends: readonly RendimientoEvent[], today: string): MesSerie[] {
  const desde = inicioDoceMeses(today)
  const y0 = Number(desde.slice(0, 4))
  const m0 = Number(desde.slice(5, 7)) - 1
  const filas: MesSerie[] = Array.from({ length: 12 }, (_, i) => {
    const idx = y0 * 12 + m0 + i
    const anio = Math.floor(idx / 12)
    const mes = idx % 12
    return { ym: `${anio}-${pad(mes + 1)}`, label: MESES_CORTOS[mes], anio, total: 0, porTipo: vacio(), acumulado: 0 }
  })
  const porYm = new Map(filas.map(f => [f.ym, f]))
  for (const r of ultimosDoceMeses(rends, today)) {
    const f = porYm.get(r.fecha.slice(0, 7))
    if (!f) continue
    f.porTipo[claveDe(r)] += r.valorEur
    f.total += r.valorEur
  }
  // Acumulado de la ventana mes a mes, para la línea del gráfico.
  let acumulado = 0
  for (const f of filas) { acumulado += f.total; f.acumulado = Math.round(acumulado * 100) / 100 }
  return filas
}

export interface FilaDesglose {
  clave: string
  total: number
  n: number
  /** Fracción del mayor (ancho de la barra) y parte del total de los 12 meses. */
  fraccion: number
  parte: number
  /** Importe por tipo, para repartir la barra con los colores del gráfico. */
  porTipo: Record<ClaveTipo, number>
  miembros: string[]
}


/** Desglose por activo o por wallet: los `max` mayores y el resto en «Otros», con su fracción del mayor. */
export function desgloseIngresos(rends: readonly RendimientoEvent[], por: 'activo' | 'wallet', max = 5): FilaDesglose[] {
  const grupos = new Map<string, { total: number; n: number; porTipo: Record<ClaveTipo, number> }>()
  for (const r of rends) {
    const k = por === 'activo' ? r.activo : r.wallet
    const g = grupos.get(k) ?? { total: 0, n: 0, porTipo: vacio() }
    g.total += r.valorEur
    g.n++
    g.porTipo[claveDe(r)] += r.valorEur
    grupos.set(k, g)
  }
  // A igualdad de importe, por nombre: el orden no depende del de llegada.
  const orden = [...grupos.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
  const visibles = orden.length <= max + 1 ? orden : orden.slice(0, max)
  const resto = orden.slice(visibles.length)
  const filas = visibles.map(([clave, g]) => ({ clave, total: g.total, n: g.n, porTipo: g.porTipo, miembros: [clave] }))
  if (resto.length) {
    const porTipo = vacio()
    for (const [, g] of resto) for (const t of Object.keys(porTipo) as ClaveTipo[]) porTipo[t] += g.porTipo[t]
    filas.push({ clave: 'Otros', total: resto.reduce((s, [, g]) => s + g.total, 0), n: resto.reduce((s, [, g]) => s + g.n, 0), porTipo, miembros: resto.map(([k]) => k) })
  }
  const mayor = Math.max(0, ...filas.map(f => f.total))
  const suma = filas.reduce((s, f) => s + f.total, 0)
  return filas.map(f => ({ ...f, total: Math.round(f.total * 100) / 100, fraccion: mayor > 0 ? f.total / mayor : 0, parte: suma > 0 ? f.total / suma : 0 }))
}
