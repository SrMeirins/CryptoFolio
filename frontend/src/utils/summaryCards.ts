import { formatMoney, type Currency } from './format'

// Datos de la ayuda de las tarjetas de resumen del Dashboard (#210, #412).
// Funciones puras para que el texto sea el mismo en ambos temas y en EUR y USD.

/** «13 activos en cartera». */
export function costSecondary(assetCount: number): string {
  return `${assetCount} ${assetCount === 1 ? 'activo' : 'activos'} en cartera`
}

/** «Sobre X invertidos». */
export function returnSecondary(totalCost: number, currency: Currency): string {
  return `Sobre ${formatMoney(totalCost, currency)} invertidos`
}
