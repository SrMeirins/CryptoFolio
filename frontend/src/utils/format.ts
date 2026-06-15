export function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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
// Instancias cacheadas de Intl.NumberFormat — evita crear nuevos objetos en cada render
const _priceFormatters = new Map<number, Intl.NumberFormat>()
function _getPriceFmt(decimals: number): Intl.NumberFormat {
  if (!_priceFormatters.has(decimals)) {
    _priceFormatters.set(decimals, new Intl.NumberFormat('es-ES', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }))
  }
  return _priceFormatters.get(decimals)!
}

/**
 * Precio unitario con decimales adaptativos según magnitud.
 * Usa formatters cacheados para evitar GC pressure en renders frecuentes.
 */
export function formatPrice(value: number): string {
  if (!isFinite(value) || value === 0) return '0,00 €'
  const abs = Math.abs(value)
  let d: number
  if (abs >= 1000)      d = 2
  else if (abs >= 100)  d = 3
  else if (abs >= 1)    d = 4
  else if (abs >= 0.1)  d = 5
  else if (abs >= 0.01) d = 6
  else                  d = 8
  return _getPriceFmt(d).format(value)
}

export function formatAmount(value: number): string {
  if (value >= 1000) return value.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString('es-ES', { maximumFractionDigits: 4 })
  return value.toLocaleString('es-ES', { maximumFractionDigits: 8 })
}

export function pnlColor(value: number): string {
  if (value > 0) return 'text-accent-green'
  if (value < 0) return 'text-accent-red'
  return 'text-gray-400'
}

export function formatPct(value: number): string {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%'
}
