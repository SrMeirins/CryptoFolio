/** Moneda de visualización (#155): los importes se guardan en EUR; USD se convierte con USDT. */
export type Currency = 'EUR' | 'USD'

// Formatters cacheados por moneda y decimales: crear un Intl.NumberFormat es
// caro y estos formateadores se llaman en cada tick de precios.
const _moneyFormatters = new Map<string, Intl.NumberFormat>()
function moneyFmt(currency: Currency, decimals: number): Intl.NumberFormat {
  const key = `${currency}:${decimals}`
  let fmt = _moneyFormatters.get(key)
  if (!fmt) {
    // narrowSymbol: "$" en lugar de "US$" en es-ES.
    fmt = new Intl.NumberFormat('es-ES', {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    })
    _moneyFormatters.set(key, fmt)
  }
  return fmt
}

/** Importe con 2 decimales en la moneda indicada (p. ej. "1234,56 €", "-10,00 $"). */
export function formatMoney(value: number, currency: Currency = 'EUR'): string {
  return moneyFmt(currency, 2).format(value)
}

/** Importe sin decimales en la moneda indicada, para espacios reducidos (p. ej. "-203 $"). */
export function formatMoneyCompact(value: number, currency: Currency = 'EUR'): string {
  return moneyFmt(currency, 0).format(value)
}

export function formatEur(value: number): string {
  return formatMoney(value, 'EUR')
}

/**
 * Precio unitario con decimales adaptativos según magnitud.
 * Muestra suficientes decimales para que el movimiento de precio sea visible.
 *   ≥ 10.000 → 2 dec   (BTC: 65.432,12 €)
 *   ≥ 1.000  → 2 dec   (ETH: 3.241,50 €)
 *   ≥ 100    → 3 dec   (BNB: 412,345 €)
 *   ≥ 1      → 4 dec   (XRP: 2,3456 €)
 *   ≥ 0.1    → 5 dec   (HBAR: 0,12345 €)
 *   ≥ 0.01   → 6 dec
 *   < 0.01   → 8 dec   (LUNC: 0,00007123 €)
 */
/**
 * Precio unitario con decimales adaptativos según magnitud, en la moneda
 * indicada. Usa los formatters cacheados para evitar GC pressure en renders frecuentes.
 */
export function formatPrice(value: number, currency: Currency = 'EUR'): string {
  if (!isFinite(value) || value === 0) return moneyFmt(currency, 2).format(0)
  const abs = Math.abs(value)
  let d: number
  if (abs >= 1000)      d = 2
  else if (abs >= 100)  d = 3
  else if (abs >= 1)    d = 4
  else if (abs >= 0.1)  d = 5
  else if (abs >= 0.01) d = 6
  else                  d = 8
  return moneyFmt(currency, d).format(value)
}

/**
 * Cantidad con decimales adaptativos según magnitud (sin símbolo de
 * divisa, a diferencia de formatPrice). Acepta null/string porque los
 * campos numéricos de la API llegan como string (precisión decimal) y a
 * veces ausentes — antes esto se resolvía con reimplementaciones locales
 * en Dashboard.tsx y History.tsx, cada una con su propio redondeo y sin
 * `Math.abs` (esta función, antes de unificar, clasificaba mal la
 * magnitud de valores negativos: -5000 caía en el bucket de 8 decimales
 * en vez del de 2, al comparar `value >= 1000` directamente).
 */
export function formatAmount(value: number | string | null | undefined, decimals = 8): string {
  if (value === null || value === undefined || value === '') return '—'
  const v = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
  if (abs >= 1000)      return v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (abs >= 1)         return v.toLocaleString('es-ES', { maximumFractionDigits: 4 })
  return v.toLocaleString('es-ES', { maximumFractionDigits: decimals })
}

export function pnlColor(value: number): string {
  if (value > 0) return 'text-positive'
  if (value < 0) return 'text-negative'
  return 'text-fg-muted'
}

export function formatPct(value: number): string {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%'
}

/** Importe en EUR sin decimales, para espacios reducidos (p. ej. "-203 €"). */
export function formatEurCompact(value: number): string {
  return formatMoneyCompact(value, 'EUR')
}
