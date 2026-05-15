export function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatAmount(value: number): string {
  if (value >= 1000) return value.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString('es-ES', { maximumFractionDigits: 4 })
  return value.toLocaleString('es-ES', { maximumFractionDigits: 6 })
}

export function pnlColor(value: number): string {
  if (value > 0) return 'text-accent-green'
  if (value < 0) return 'text-accent-red'
  return 'text-gray-400'
}

export function formatPct(value: number): string {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%'
}
