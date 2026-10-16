import { formatPercent } from '../utils/format'

// Celdas comunes de la tabla de posiciones (#271).

/** P&L % como pastilla con signo, no solo color. */
export function PnlPill({ pct }: { pct: number }) {
  const tone = pct > 0.005 ? 'bg-positive/10 text-positive' : pct < -0.005 ? 'bg-negative/10 text-negative' : 'bg-overlay/6 text-fg-muted'
  return <span className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] leading-none font-semibold ${tone}`}>{formatPercent(pct, 2, true)}</span>
}

/** «% cartera» con barra de peso. */
export function WeightCell({ pct, tone = 'bg-brand/60' }: { pct: number | null; tone?: string }) {
  if (pct === null) return <span className="text-fg-subtle text-xs">—</span>
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs mono text-fg-muted">{formatPercent(pct, 1)}</span>
      <div className="w-16 h-1.5 bg-background-tertiary rounded-full overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}
