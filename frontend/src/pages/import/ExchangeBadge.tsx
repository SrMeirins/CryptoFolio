type ExchangeId = 'binance' | 'bitvavo'

// Distintivo propio de cada exchange (#318): color e inicial, sin logotipos de marca.
const DISTINTIVO: Record<ExchangeId, { color: string; texto: string; inicial: string }> = {
  binance: { color: '#F0B90B', texto: '#1E2026', inicial: 'B' },   // texto oscuro: el blanco sobre amarillo no contrasta
  bitvavo: { color: '#0051FF', texto: '#FFFFFF', inicial: 'b' },
}

export function ExchangeBadge({ exchange, size = 20 }: { exchange: string; size?: number }) {
  const d = DISTINTIVO[exchange as ExchangeId]
  if (!d) return null
  return (
    <span className="inline-grid place-items-center rounded-md font-bold shrink-0" aria-hidden="true"
      style={{ width: size, height: size, backgroundColor: d.color, color: d.texto, fontSize: size * 0.55 }}>{d.inicial}</span>
  )
}
