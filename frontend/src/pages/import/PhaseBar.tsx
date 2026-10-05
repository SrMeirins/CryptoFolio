import { RefreshCw } from 'lucide-react'
import type { ProgressEvent } from './types'
import { PHASES, PHASE_STATUS_STYLES, type PhaseStatus } from './progressStageHelpers'

export function PhaseBar({ log, done, isError, currentPhase, currentIdx }: {
  log: ProgressEvent[]
  done: boolean
  isError: boolean
  currentPhase: ProgressEvent['phase']
  currentIdx: number
}) {
  const phaseOrder = PHASES.map(p => p.key)

  const latestImportingEvent = [...log].reverse().find(
    e => e.phase === 'importing' && e.total !== undefined && e.total > 0
  )
  const latestPricesEvent = [...log].reverse().find(
    e => e.phase === 'prices' && e.total !== undefined && e.total > 0
  )

  return (
    <div className="grid grid-cols-4 gap-2">
      {PHASES.map(phase => {
        const idx       = phaseOrder.indexOf(phase.key)
        const isDone    = done ? true : idx < currentIdx
        const isCurrent = !done && phase.key === currentPhase
        const Icon      = phase.icon

        const status: PhaseStatus = isError && isCurrent ? 'error' : isDone ? 'done' : isCurrent ? 'current' : 'pending'
        const styles = PHASE_STATUS_STYLES[status]

        let barStyle: React.CSSProperties | undefined
        let barWidth = 'w-0'
        if (status === 'error' || status === 'done') {
          barWidth = 'w-full'
        } else if (status === 'current') {
          if (phase.key === 'importing' && latestImportingEvent) {
            const pct = Math.min(100, Math.round((latestImportingEvent.progress! / latestImportingEvent.total!) * 100))
            barWidth = ''
            barStyle = { width: `${pct}%` }
          } else if (phase.key === 'prices' && latestPricesEvent) {
            const pct = Math.min(100, Math.round((latestPricesEvent.progress! / latestPricesEvent.total!) * 100))
            barWidth = ''
            barStyle = { width: `${pct}%` }
          } else {
            barWidth = 'w-1/2 animate-pulse'
          }
        }

        return (
          <div
            key={phase.key}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${styles.border}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${styles.iconBg}`}>
              {status === 'current'
                ? <RefreshCw size={15} className="text-accent-blue animate-spin" />
                : <Icon size={15} className={styles.iconColor} />
              }
            </div>
            <span className={`text-xs font-medium text-center leading-tight ${styles.text}`}>
              {phase.label}
            </span>
            <div className="w-full h-0.5 rounded-full overflow-hidden bg-background-tertiary">
              <div className={`h-full rounded-full transition-all duration-300 ${styles.bar} ${barWidth}`} style={barStyle} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
