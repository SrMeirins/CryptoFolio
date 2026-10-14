import { formatEur } from '../../utils/format'
import type { YearOverview } from './types'

export function YearTabs({ years, activeYear, overview, currentYear, onSelect }: {
  years: number[]
  activeYear: number
  overview: YearOverview[]
  currentYear: number
  onSelect: (year: number) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap" role="tablist">
      {years.map(year => {
        const ov   = overview.find(o => o.year === year)
        const neto = ov?.netoPatrimonial ?? 0
        return (
          <button
            key={year}
            type="button"
            role="tab"
            aria-selected={activeYear === year}
            onClick={() => onSelect(year)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeYear === year
                ? 'bg-brand/20 border border-brand/40 text-fg'
                : 'bg-background-tertiary border border-border text-fg-muted hover:text-fg hover:border-fg-subtle'
            }`}
          >
            <span>{year}</span>
            {year === currentYear && (
              <span className="text-xs bg-brand/20 text-brand px-1.5 py-0.5 rounded-full">EN CURSO</span>
            )}
            {ov && (
              <span className={`text-xs mono font-bold ${neto >= 0 ? 'text-positive' : 'text-negative'}`}>
                {neto >= 0 ? '+' : ''}{formatEur(neto)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
