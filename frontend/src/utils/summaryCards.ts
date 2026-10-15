import { formatMoney, type Currency } from './format'

// Línea secundaria de las tarjetas de resumen del Dashboard (#210). Funciones
// puras para que el texto sea el mismo en ambos temas y en EUR y USD.

const signed = (n: number, currency: Currency) => `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`

/** «13 activos en cartera». */
export function costSecondary(assetCount: number): string {
  return `${assetCount} ${assetCount === 1 ? 'activo' : 'activos'} en cartera`
}

/** «Hoy: ±X» con el P&L del día en vivo (la misma cifra que el calendario); null sin dato. */
export function todaySecondary(todayPnl: number | null, currency: Currency): string | null {
  return todayPnl === null ? null : `Hoy: ${signed(Math.round(todayPnl * 100) / 100, currency)}`
}

/** «Sobre X invertidos». */
export function returnSecondary(totalCost: number, currency: Currency): string {
  return `Sobre ${formatMoney(totalCost, currency)} invertidos`
}

/** «+X depositado» y «−Y retirado», en dos líneas. */
export function flowSecondary(deposited: number, withdrawn: number, currency: Currency): [string, string] {
  return [
    `+${formatMoney(Math.abs(deposited), currency)} depositado`,
    `−${formatMoney(Math.abs(withdrawn), currency)} retirado`,
  ]
}
