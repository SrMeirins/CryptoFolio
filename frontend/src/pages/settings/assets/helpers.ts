export const SOURCE_META: Record<string, { label: string; color: string }> = {
  eur_direct: { label: 'EUR directo', color: '#00c896' },
  usdt_proxy: { label: 'Vía USDT',    color: '#6366f1' },
  btc_proxy:  { label: 'Vía BTC',     color: '#f59e0b' },
  coingecko:  { label: 'CoinGecko',   color: '#8b5cf6' },
  fiat:       { label: 'Estable',      color: '#6b7280' },
  unknown:    { label: 'Sin precio',   color: '#e74c3c' },
}

export function fmtPrice(p: number): string {
  if (p >= 10000)   return `€${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (p >= 1)       return `€${p.toFixed(4)}`
  if (p >= 0.001)   return `€${p.toFixed(6)}`
  if (p >= 0.00001) return `€${p.toFixed(8)}`
  return `€${p.toExponential(4)}`
}

export type SortKey = 'name' | 'price' | 'source'
export type SortDir = 'asc' | 'desc'

// Compartido por AssetEditPanel y AddAssetDialog — antes declarado por
// duplicado e idéntico en ambos.
export const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"
