import { DISTINTIVO } from './exchangeColores'

export function ExchangeBadge({ exchange, size = 20 }: { exchange: string; size?: number }) {
  const d = DISTINTIVO[exchange as keyof typeof DISTINTIVO]
  if (!d) return null
  return (
    <span className="inline-grid place-items-center rounded-md font-bold shrink-0" aria-hidden="true"
      style={{ width: size, height: size, backgroundColor: d.color, color: d.texto, fontSize: size * 0.55 }}>{d.inicial}</span>
  )
}
