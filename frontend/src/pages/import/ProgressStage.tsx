import { useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import type { ProgressEvent } from './types'
import { PHASES, BANNER_STYLES, type BannerKind } from './progressStageHelpers'
import { PhaseBar } from './PhaseBar'
import { ImportLogPanel } from './ImportLogPanel'
import { ImportSummary } from './ImportSummary'

export function ProgressStage({ log, done, onGoToDashboard }: {
  log: ProgressEvent[]
  done: boolean
  onGoToDashboard: () => void
}) {
  const [showLog, setShowLog] = useState(false)

  const isError      = log.some(e => e.phase === 'error')
  const currentPhase = log.length > 0 ? log[log.length - 1].phase : 'importing'
  const phaseOrder   = PHASES.map(p => p.key)
  const currentIdx   = phaseOrder.indexOf(currentPhase as typeof phaseOrder[number])

  const latestImportingEvent = [...log].reverse().find(
    e => e.phase === 'importing' && e.total !== undefined && e.total > 0
  )
  const latestPricesEvent = [...log].reverse().find(
    e => e.phase === 'prices' && e.total !== undefined && e.total > 0
  )

  return (
    <div className="card space-y-6">
      <PhaseBar log={log} done={done} isError={isError} currentPhase={currentPhase} currentIdx={currentIdx} />

      {!done && !isError && (() => {
        const lastMsg = log.length > 0 ? log[log.length - 1].message : 'Iniciando...'
        const isRateLimit = lastMsg.startsWith('⏳') || lastMsg.includes('Rate limit') || lastMsg.includes('429')
        const isPrefetch  = lastMsg.startsWith('🔄')
        const kind: BannerKind = isRateLimit ? 'rateLimit' : isPrefetch ? 'prefetch' : 'normal'
        const styles = BANNER_STYLES[kind]
        return (
          <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${styles.container}`}>
            <RefreshCw size={14} className={`shrink-0 animate-spin ${styles.icon}`} />
            <span className={`text-sm truncate ${styles.text}`}>
              {lastMsg}
            </span>
            {latestImportingEvent && currentPhase === 'importing' && (
              <span className="ml-auto text-xs text-gray-500 font-mono shrink-0">
                {latestImportingEvent.progress}/{latestImportingEvent.total}
              </span>
            )}
            {latestPricesEvent && currentPhase === 'prices' && (
              <span className="ml-auto text-xs text-gray-500 font-mono shrink-0">
                {latestPricesEvent.progress}/{latestPricesEvent.total}
              </span>
            )}
          </div>
        )
      })()}

      {isError && (
        <div className="flex items-start gap-3 p-4 bg-accent-red/5 border border-accent-red/30 rounded-xl">
          <AlertTriangle size={16} className="text-accent-red shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-accent-red mb-1">Error durante la importación</p>
            <p className="text-xs text-gray-400">
              {log.find(e => e.phase === 'error')?.message ?? 'Error desconocido'}
            </p>
          </div>
        </div>
      )}

      {/* Log siempre visible mientras se importa, ocultable tras completar */}
      {(!done || showLog) && <ImportLogPanel log={log} done={done} />}

      {done && !isError && (
        <ImportSummary log={log} showLog={showLog} onToggleLog={() => setShowLog(v => !v)} onGoToDashboard={onGoToDashboard} />
      )}
    </div>
  )
}
