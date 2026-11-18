import type { PriceCloses } from '../api/prices'
import type { Currency } from './format'
import { dayMs } from './chartAxes'
import type { PuntoVentana } from './evolucionVentana'

// Comparar la evolución con BTC o ETH (#510) y exportar sus datos. La
// referencia responde a «¿qué tendrías si lo mismo, con los mismos depósitos
// y retiradas y en las mismas fechas, hubiera estado en BTC o ETH?»: parte
// del mismo punto que la cartera en lo visible (su valor, su P&L y su %) y
// cada depósito o retirada posterior compra o vende la referencia a su
// precio de ese día. El % usa el mismo denominador que la curva de la
// cartera (máximo capital aportado). Precios en la moneda de visualización
// (en USD, con el tipo de cada día). Funciones puras.

export type Referencia = 'BTC' | 'ETH'
export const REFERENCIAS: readonly Referencia[] = ['BTC', 'ETH']

/** Precio diario de la referencia en la moneda elegida (en USD, con el cierre de USDT de ese día). */
export function preciosDiarios(closes: PriceCloses | undefined, ref: Referencia, currency: Currency): Map<number, number> {
  const out = new Map<number, number>()
  if (!closes) return out
  const usdt = new Map((closes.closes.USDT ?? []).map(c => [c.date, c.price]))
  for (const c of closes.closes[ref] ?? []) {
    if (!(c.price > 0)) continue
    if (currency === 'EUR') { out.set(dayMs(c.date), c.price); continue }
    const rate = usdt.get(c.date)
    if (rate && rate > 0) out.set(dayMs(c.date), c.price / rate)
  }
  return out
}

/** Precio intradía por instante a partir de la serie del backend (ya en la moneda pedida). */
export function preciosIntradia(xs: readonly number[], precios: readonly (number | null)[] | undefined): Map<number, number> {
  const out = new Map<number, number>()
  xs.forEach((x, i) => { const p = precios?.[i]; if (p && p > 0) out.set(x, p) })
  return out
}

export interface ValoresReferencia { pct: number; value: number; pnl: number }
export type PuntoConReferencia = PuntoVentana & { ref: ValoresReferencia | null }

/**
 * Añade la referencia a los puntos visibles. Base: el primer punto con
 * posiciones y con precio de la referencia, donde ambas curvas coinciden.
 * Los flujos de un día sin precio se aplican al siguiente con precio.
 */
export function conReferencia(puntos: readonly PuntoVentana[], precios: ReadonlyMap<number, number> | null): PuntoConReferencia[] {
  if (!precios || precios.size === 0) return puntos.map(p => ({ ...p, ref: null }))
  const ib = puntos.findIndex(p => !p.vacio && precios.has(p.x))
  if (ib === -1) return puntos.map(p => ({ ...p, ref: null }))
  const base = puntos[ib]
  let unidades = base.value / (precios.get(base.x) as number)
  let flujos = 0       // depósitos menos retiradas desde la base
  let pendiente = 0    // flujos de días sin precio, a aplicar en el siguiente con precio
  return puntos.map((p, i) => {
    if (i < ib) return { ...p, ref: null }
    if (i === ib) return { ...p, ref: { value: base.value, pnl: base.pnl, pct: base.pct } }
    const flujo = p.deposit - p.withdrawal
    flujos += flujo
    const precio = precios.get(p.x)
    if (precio === undefined) { pendiente += flujo; return { ...p, ref: null } }
    unidades += (flujo + pendiente) / precio
    pendiente = 0
    const value = unidades * precio
    const pnl = base.pnl + (value - base.value - flujos)
    return { ...p, ref: { value, pnl, pct: p.capital > 0 ? (pnl / p.capital) * 100 : 0 } }
  })
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Coma decimal y sin «-0,00» (lo que redondea a cero sale como 0). */
const num = (n: number, dec: number) => (Math.abs(n) < 0.5 * 10 ** -dec ? 0 : n).toFixed(dec).replace('.', ',')
const fecha = (x: number, intraday: boolean) => (intraday ? new Date(x).toISOString() : new Date(x).toISOString().slice(0, 10))

/**
 * CSV de lo visible para una hoja de cálculo en castellano: punto y coma,
 * coma decimal, UTF-8 con BOM y fecha ISO. Los días sin posiciones salen con
 * el valor a 0 y el resto de columnas vacías.
 */
export function csvEvolucion(puntos: readonly PuntoConReferencia[], { intraday, referencia, currency }: {
  intraday: boolean
  referencia: Referencia | null
  currency: Currency
}): string {
  const cab = [intraday ? 'Fecha y hora (UTC)' : 'Fecha', `Valor (${currency})`, `Aportado (${currency})`, `P&L (${currency})`, 'Rentabilidad (%)']
  if (referencia) cab.push(`${referencia}: valor equivalente (${currency})`, `${referencia}: rentabilidad (%)`)
  const filas = puntos.map(p => {
    const celdas = [fecha(p.x, intraday), num(p.value, 2)]
    if (p.vacio) celdas.push('', '', '')
    else celdas.push(num(p.aportado, 2), num(p.pnl, 2), num(p.pct, 4))
    if (referencia) celdas.push(p.ref ? num(p.ref.value, 2) : '', p.ref ? num(p.ref.pct, 4) : '')
    return celdas.join(';')
  })
  return '﻿' + [cab.join(';'), ...filas].join('\r\n') + '\r\n'
}
