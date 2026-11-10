/** Moneda de visualización (#155): los importes se guardan en EUR; USD se convierte con USDT. */
export type Currency = 'EUR' | 'USD'

// Modo privacidad (#254): con él activo, importes y cantidades se sustituyen
// por «••••» en el propio texto (no se leen con lector de pantalla ni al
// copiar). Precios de mercado y porcentajes siguen visibles. El estado lo fija
// el store de privacidad; la app se vuelve a pintar al cambiarlo.
export const HIDDEN_AMOUNT = '••••'
const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: '€', USD: '$' }
let amountsHidden = false

export function setAmountsHidden(hidden: boolean): void {
  amountsHidden = hidden
}

export function amountsAreHidden(): boolean {
  return amountsHidden
}

const hiddenMoney = (currency: Currency) => `${HIDDEN_AMOUNT} ${CURRENCY_SYMBOL[currency]}`

// Formatters cacheados por moneda y decimales: crear un Intl.NumberFormat es
// caro y estos formateadores se llaman en cada tick de precios.
//
// Separador de miles siempre (#210): es-ES por defecto no agrupa los números de
// cuatro cifras ("8981,02 €" junto a "10.931,61 €"); useGrouping 'always'
// (Intl.NumberFormat v3, tipos de ES2023.Intl) los agrupa todos.
const esFormat = (options: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('es-ES', { ...options, useGrouping: 'always' })

const _moneyFormatters = new Map<string, Intl.NumberFormat>()
function moneyFmt(currency: Currency, decimals: number): Intl.NumberFormat {
  const key = `${currency}:${decimals}`
  let fmt = _moneyFormatters.get(key)
  if (!fmt) {
    // narrowSymbol: "$" en lugar de "US$" en es-ES.
    fmt = esFormat({
      style: 'currency', currency, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    })
    _moneyFormatters.set(key, fmt)
  }
  return fmt
}

// Precios muy pequeños (#337): con cifras significativas en vez de decimales
// fijos (0,0000094963 € y no 0,00000949 € ni 9.4963e-6).
const _significantMoney = new Map<Currency, Intl.NumberFormat>()
function significantMoneyFmt(currency: Currency): Intl.NumberFormat {
  let fmt = _significantMoney.get(currency)
  if (!fmt) {
    fmt = esFormat({ style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumSignificantDigits: 5 })
    _significantMoney.set(currency, fmt)
  }
  return fmt
}

const _numberFormatters = new Map<string, Intl.NumberFormat>()

// Importes diminutos y cero con signo (#489): un valor que redondea a cero se
// muestra sin signo («0,00 €», nunca «-0,00 €»); si no es cero pero no llega al
// mínimo visible, «< 0,01 €» o, en negativo, «-< 0,01 €» (el signo delante),
// para no confundirlo con cero. Lo mismo en porcentajes y cantidades.

/** Por debajo de esto es ruido de coma flotante de las sumas, no un importe: cuenta como cero. */
const RUIDO = 1e-9

/** Mínimo visible con `decimals` decimales: 0,01 con 2, 1 con 0. */
const minimo = (decimals: number) => 10 ** -decimals

/** Redondea a cero lo que con esos decimales no se ve, sin dejar -0. */
function sinCeroNegativo(value: number, decimals: number): number {
  return Math.abs(value) < minimo(decimals) / 2 ? 0 : value // también quita el -0
}

/** «< 0,01 €» / «-< 0,01 €» si el valor no es cero pero redondea a cero; null si no aplica. */
function bajoMinimo(value: number, decimals: number, format: (v: number) => string): string | null {
  if (!Number.isFinite(value) || Math.abs(value) < RUIDO || Math.abs(value) >= minimo(decimals) / 2) return null
  return `${value < 0 ? '-' : ''}< ${format(minimo(decimals))}`
}

/**
 * Número en formato español con separador de miles siempre y coma decimal
 * (p. ej. "1.234,5"). `maxDecimals` y `minDecimals` acotan los decimales.
 */
export function formatNumber(value: number, maxDecimals = 2, minDecimals = 0): string {
  const key = `${minDecimals}:${maxDecimals}`
  let fmt = _numberFormatters.get(key)
  if (!fmt) {
    fmt = esFormat({ minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals })
    _numberFormatters.set(key, fmt)
  }
  return fmt.format(sinCeroNegativo(value, maxDecimals))
}

/** Porcentaje con coma decimal y decimales fijos (p. ej. "-17,84%"); `signed` añade "+" a los positivos. */
export function formatPercent(value: number, decimals = 2, signed = false): string {
  const tiny = bajoMinimo(value, decimals, v => `${formatNumber(v, decimals, decimals)}%`)
  if (tiny) return signed && value > 0 ? `+${tiny}` : tiny
  return `${signed && value > 0 ? '+' : ''}${formatNumber(value, decimals, decimals)}%`
}

/** Importe con 2 decimales en la moneda indicada (p. ej. "1.234,56 €", "-10,00 $"). */
export function formatMoney(value: number, currency: Currency = 'EUR'): string {
  if (amountsHidden) return hiddenMoney(currency)
  const fmt = moneyFmt(currency, 2)
  return bajoMinimo(value, 2, v => fmt.format(v)) ?? fmt.format(sinCeroNegativo(value, 2))
}

/** Importe sin decimales en la moneda indicada, para espacios reducidos (p. ej. "-203 $"). */
export function formatMoneyCompact(value: number, currency: Currency = 'EUR'): string {
  if (amountsHidden) return hiddenMoney(currency)
  const fmt = moneyFmt(currency, 0)
  return bajoMinimo(value, 0, v => fmt.format(v)) ?? fmt.format(sinCeroNegativo(value, 0))
}

/**
 * Importe exacto para trazabilidad (#489, antes preciseEur del detalle de
 * Historial): por debajo de 0,01 con 2 cifras significativas («0,004 €») en
 * lugar de «< 0,01 €».
 */
export function formatMoneyPrecise(value: number, currency: Currency = 'EUR'): string {
  if (amountsHidden) return hiddenMoney(currency)
  if (value !== 0 && Number.isFinite(value) && Math.abs(value) < 0.01) {
    return esFormat({ style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumSignificantDigits: 2 }).format(value)
  }
  return formatMoney(value, currency)
}

export function formatEur(value: number): string {
  return formatMoney(value, 'EUR')
}

/**
 * Importe en euros con signo explícito («+12,00 €», «-3,40 €»). Por debajo de
 * medio céntimo es «0,00 €», sin signo: antes salía «-< 0,01 €» o «+< 0,01 €»
 * en resultados que se compensan casi del todo (#541).
 */
export function formatEurSigned(value: number): string {
  if (Math.abs(value) < 0.005) return formatEur(0)
  return `${value > 0 ? '+' : ''}${formatEur(value)}`
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
  else if (abs >= 0.0001) d = 8
  else return significantMoneyFmt(currency).format(value)
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
  if (amountsHidden) return HIDDEN_AMOUNT
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return formatNumber(v, 0)
  if (abs >= 1000)      return formatNumber(v, 2)
  if (abs >= 1)         return formatNumber(v, 4)
  return formatNumber(v, decimals)
}

/** Color de un resultado; por debajo de medio céntimo, neutro: se muestra como 0,00 (#541). */
export function pnlColor(value: number): string {
  if (value >= 0.005) return 'text-positive'
  if (value <= -0.005) return 'text-negative'
  return 'text-fg-muted'
}

export function formatPct(value: number): string {
  const tiny = bajoMinimo(value, 2, v => `${formatNumber(v, 2, 2)}%`)
  if (tiny) return value > 0 ? `+${tiny}` : tiny
  const v = sinCeroNegativo(value, 2)
  return (v >= 0 ? '+' : '') + formatNumber(v, 2, 2) + '%'
}

/** Importe en EUR sin decimales, para espacios reducidos (p. ej. "-203 €"). */
export function formatEurCompact(value: number): string {
  return formatMoneyCompact(value, 'EUR')
}

/** Número con hasta `digits` cifras significativas (precios muy pequeños, #337). */
export function formatSignificant(value: number, digits = 5): string {
  return esFormat({ maximumSignificantDigits: digits }).format(value)
}
