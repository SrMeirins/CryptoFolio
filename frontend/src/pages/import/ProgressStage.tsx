import { useState, useRef, useEffect } from 'react'
import { FileText, HardDrive, CheckCircle, RefreshCw, AlertTriangle, ChevronDown, ArrowRight } from 'lucide-react'
import type { ProgressEvent } from './types'

export function ProgressStage({ log, done, onGoToDashboard }: {
  log: ProgressEvent[]
  done: boolean
  onGoToDashboard: () => void
}) {
  const [showLog, setShowLog] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!done && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log, done])

  const PHASES = [
    { key: 'importing', label: 'Importando',   icon: FileText    },
    { key: 'prices',    label: 'Precios hist.', icon: RefreshCw   },
    { key: 'fifo',      label: 'Cálculo FIFO',  icon: HardDrive   },
    { key: 'done',      label: 'Completado',    icon: CheckCircle },
  ] as const

  const isError      = log.some(e => e.phase === 'error')
  const currentPhase = log.length > 0 ? log[log.length - 1].phase : 'importing'
  const phaseOrder   = PHASES.map(p => p.key)
  const currentIdx   = phaseOrder.indexOf(currentPhase as typeof phaseOrder[number])

  const latestPricesEvent = [...log].reverse().find(
    e => e.phase === 'prices' && e.total !== undefined && e.total > 0
  )

  const latestImportingEvent = [...log].reverse().find(
    e => e.phase === 'importing' && e.total !== undefined && e.total > 0
  )

  const importLine = log.find(e => e.message.includes('transacciones nuevas'))
  const fifoLine   = log.find(e => e.message.includes('lotes') && e.message.includes('consumos'))
  const gpLine     = log.find(e => e.message.includes('G/P neto'))

  return (
    <div className="card space-y-6">
      <div className="grid grid-cols-4 gap-2">
        {PHASES.map((phase) => {
          const idx       = phaseOrder.indexOf(phase.key)
          const isDone    = done ? true : idx < currentIdx
          const isCurrent = !done && phase.key === currentPhase
          const Icon      = phase.icon

          let barStyle: React.CSSProperties | undefined
          let barClass = 'h-full rounded-full transition-all duration-300 '

          if (isError && isCurrent) {
            barClass += 'bg-accent-red w-full'
          } else if (isDone) {
            barClass += 'bg-accent-green w-full'
          } else if (isCurrent) {
            if (phase.key === 'importing' && latestImportingEvent) {
              const pct = Math.min(100, Math.round((latestImportingEvent.progress! / latestImportingEvent.total!) * 100))
              barClass += 'bg-accent-blue'
              barStyle = { width: `${pct}%` }
            } else if (phase.key === 'prices' && latestPricesEvent) {
              const pct = Math.min(100, Math.round((latestPricesEvent.progress! / latestPricesEvent.total!) * 100))
              barClass += 'bg-accent-blue'
              barStyle = { width: `${pct}%` }
            } else {
              barClass += 'bg-accent-blue w-1/2 animate-pulse'
            }
          } else {
            barClass += 'w-0'
          }

          return (
            <div
              key={phase.key}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                isError && isCurrent ? 'border-accent-red/40 bg-accent-red/5' :
                isDone   ? 'border-accent-green/30 bg-accent-green/5' :
                isCurrent ? 'border-accent-blue/40 bg-accent-blue/5' :
                'border-border bg-background-tertiary/30'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isError && isCurrent ? 'bg-accent-red/15' :
                isDone   ? 'bg-accent-green/15' :
                isCurrent ? 'bg-accent-blue/15' :
                'bg-background-tertiary'
              }`}>
                {isCurrent && !isError
                  ? <RefreshCw size={15} className="text-accent-blue animate-spin" />
                  : <Icon size={15} className={
                      isError && isCurrent ? 'text-accent-red' :
                      isDone ? 'text-accent-green' :
                      isCurrent ? 'text-accent-blue' : 'text-gray-600'
                    } />
                }
              </div>
              <span className={`text-xs font-medium text-center leading-tight ${
                isError && isCurrent ? 'text-accent-red' :
                isDone ? 'text-accent-green' :
                isCurrent ? 'text-accent-blue' : 'text-gray-600'
              }`}>
                {phase.label}
              </span>
              <div className="w-full h-0.5 rounded-full overflow-hidden bg-background-tertiary">
                <div className={barClass} style={barStyle} />
              </div>
            </div>
          )
        })}
      </div>

      {!done && !isError && (
        <div className="flex items-center gap-3 p-3 bg-background-tertiary rounded-xl">
          <RefreshCw size={14} className="text-accent-blue animate-spin shrink-0" />
          <span className="text-sm text-gray-300 truncate">
            {log.length > 0 ? log[log.length - 1].message : 'Iniciando...'}
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
      )}

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
      {(!done || showLog) && (
        <div
          ref={logRef}
          className="bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto"
        >
          {log.length === 0 && (
            <span className="text-gray-600">Esperando inicio...</span>
          )}
          {log.map((event, absIdx) => ({ event, absIdx })).slice(-300).map(({ event, absIdx }) => {
            const isNoPrice    = event.phase === 'prices' && event.message.startsWith('—')
            const isOkPrice    = event.phase === 'prices' && event.message.startsWith('✓')
            const isFifoWarn   = event.phase === 'fifo' && event.message.includes('⚠')
            const isImportProgress = event.phase === 'importing' && event.progress !== undefined
            const color =
              event.phase === 'error'   ? 'text-accent-red'    :
              event.phase === 'done'    ? 'text-accent-green'  :
              isFifoWarn                ? 'text-yellow-500'    :
              event.phase === 'fifo'    ? 'text-accent-blue'   :
              isNoPrice                 ? 'text-yellow-600'    :
              isOkPrice                 ? 'text-gray-500'      :
              event.phase === 'prices'  ? 'text-gray-400'      :
              isImportProgress          ? 'text-gray-500'      :
              'text-gray-300'
            return (
              <div key={absIdx} className={color}>
                {event.progress !== undefined && event.total !== undefined
                  ? `[${event.progress}/${event.total}] ${event.message}`
                  : event.message
                }
              </div>
            )
          })}
          {!done && <div className="text-accent-blue animate-pulse">▍</div>}
        </div>
      )}

      {done && !isError && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-accent-green" />
            <span className="font-semibold text-accent-green">Importación completada</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {importLine && (
              <div className="bg-background-tertiary rounded-xl p-3 text-center">
                <p className="text-xl font-bold mono text-white">
                  {importLine.message.match(/(\d+) transacciones/)?.[1] ?? '—'}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">Transacciones nuevas</p>
              </div>
            )}
            {fifoLine && (
              <>
                <div className="bg-background-tertiary rounded-xl p-3 text-center">
                  <p className="text-xl font-bold mono text-white">
                    {fifoLine.message.match(/(\d+) lotes/)?.[1] ?? '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Lotes FIFO</p>
                </div>
                <div className="bg-background-tertiary rounded-xl p-3 text-center">
                  <p className="text-xl font-bold mono text-white">
                    {fifoLine.message.match(/(\d+) consumos/)?.[1] ?? '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Consumos</p>
                </div>
              </>
            )}
          </div>

          {gpLine && (
            <div className={`flex items-center justify-between p-3 rounded-xl border ${
              (gpLine.message.includes('+') && !gpLine.message.startsWith('G/P neto: -'))
                ? 'bg-accent-green/5 border-accent-green/20'
                : 'bg-accent-red/5 border-accent-red/20'
            }`}>
              <span className="text-sm text-gray-400">G/P neto acumulado</span>
              <span className={`font-bold mono ${gpLine.message.includes('+') ? 'text-accent-green' : 'text-accent-red'}`}>
                {gpLine.message.replace('G/P neto: ', '')}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setShowLog(v => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <ChevronDown size={12} className={`transition-transform ${showLog ? 'rotate-180' : ''}`} />
              {showLog ? 'Ocultar' : 'Ver'} log técnico
            </button>
            <button
              onClick={onGoToDashboard}
              className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
            >
              Ver Dashboard
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
