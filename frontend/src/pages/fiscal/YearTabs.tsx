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
                ? 'bg-accent-blue/20 border border-accent-blue/40 text-white'
                : 'bg-background-tertiary border border-border text-gray-400 hover:text-white hover:border-gray-500'
            }`}
          >
            <span>{year}</span>
            {year === currentYear && (
              <span className="text-[10px] bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded-full">EN CURSO</span>
            )}
            {ov && (
              <span className={`text-[10px] font-mono font-bold ${neto >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {neto >= 0 ? '+' : ''}{formatEur(neto)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
