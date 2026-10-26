import { formatPercent } from './format'
import type { PnlPeriod } from './pnlChart'
import { zonedFormat } from './zonedFormat'
import { timezoneLabel } from './timezoneLabel'

// Subtítulos con contexto de páginas y paneles (#232). Funciones puras.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const DAY_LONG = () => zonedFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
const MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const SHORT_DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const clean = (s: string) => s.replace('.', '')

/** «Resumen de tu cartera · 13 activos · jueves 15 oct». */
export function dashboardSubtitle(assetCount: number, now: Date): string {
  const parts = ['Resumen de tu cartera']
  if (assetCount > 0) parts.push(plural(assetCount, 'activo', 'activos'))
  parts.push(clean(DAY_LONG().format(now).replace(',', '')))
  return parts.join(' · ')
}

/** «13 activos en 4 wallets». */
export function portfolioSubtitle(assetCount: number, walletCount: number): string {
  if (assetCount === 0) return 'Sin activos en cartera'
  return `${plural(assetCount, 'activo', 'activos')} en ${plural(walletCount, 'wallet', 'wallets')}`
}

const PERIOD_TEXT: Partial<Record<PnlPeriod, string>> = {
  '24H': 'Últimas 24 horas · cada 15 min', '7D': 'Últimos 7 días', '30D': 'Últimos 30 días', '90D': 'Últimos 90 días',
  '180D': 'Últimos 180 días', '1A': 'Último año', YTD: 'Este año',
}

/** «Todo · desde feb 2022», «Últimos 30 días», «1 sept – 10 sept». */
export function evolutionSubtitle(period: PnlPeriod, firstX: number | null, range: { from: string; to: string } | null): string {
  if (period === 'Rango' && range?.from) {
    const f = clean(SHORT_DAY.format(new Date(`${range.from}T00:00:00Z`)))
    const t = clean(SHORT_DAY.format(new Date(`${(range.to || range.from)}T00:00:00Z`)))
    return f === t ? f : `${f} – ${t}`
  }
  if (period === 'Todo') return firstX === null ? 'Todo el historial' : `Todo · desde ${clean(MONTH_YEAR.format(new Date(firstX)))}`
  return PERIOD_TEXT[period] ?? ''
}

/** «13 activos · XRP 40 %» o, por wallet, «2 wallets · Ledger 60 %». */
export function allocationSubtitle(items: ReadonlyArray<{ name: string; value: number }>, total: number, unit: 'asset' | 'wallet' = 'asset'): string {
  if (items.length === 0 || total <= 0) return 'Sin activos con valor'
  const top = items.reduce((a, b) => (b.value > a.value ? b : a))
  const count = unit === 'asset' ? plural(items.length, 'activo', 'activos') : plural(items.length, 'wallet', 'wallets')
  return `${count} · ${top.name} ${formatPercent((top.value / total) * 100, 0)}`
}

/** «Ejercicio 2026 · 45 operaciones». */
export function fiscalSubtitle(year: number, operations: number): string {
  return `Ejercicio ${year} · ${plural(operations, 'operación', 'operaciones')}`
}

/** «Últimas 8 operaciones». */
export function activitySubtitle(count: number): string {
  return count === 0 ? 'Sin operaciones todavía' : count === 1 ? 'Última operación' : `Últimas ${count} operaciones`
}

/** «13 activos · precios en vivo» o, en Total, «13 activos · sobre el precio medio de compra». */
export function moversSubtitle(mode: '24h' | 'total', assetCount: number): string {
  return `${plural(assetCount, 'activo', 'activos')} · ${mode === '24h' ? 'variación en 24 h, en vivo' : 'sobre el precio medio de compra'}`
}

/** «Octubre de 2026 · hora de Madrid» o, en la vista anual, «2026 · 12 meses». */
export function calendarSubtitle(view: 'month' | 'year', monthText: string, year: number): string {
  return view === 'month' ? `${monthText} · día natural, ${timezoneLabel()}` : `${year} · resumen por meses`
}
