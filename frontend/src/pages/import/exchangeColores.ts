type ExchangeId = 'binance' | 'bitvavo'

// Distintivo propio de cada exchange (#318): color e inicial, sin logotipos de marca.
export const DISTINTIVO: Record<ExchangeId, { color: string; texto: string; inicial: string }> = {
  binance: { color: '#F0B90B', texto: '#1E2026', inicial: 'B' },   // texto oscuro: el blanco sobre amarillo no contrasta
  bitvavo: { color: '#0051FF', texto: '#FFFFFF', inicial: 'b' },
}

