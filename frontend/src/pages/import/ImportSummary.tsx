import { CheckCircle, ChevronDown, ArrowRight } from 'lucide-react'
import type { ProgressEvent } from './types'
import { buttonClasses } from '../../components/ui'

export function ImportSummary({ log, showLog, onToggleLog, onGoToDashboard }: {
  log: ProgressEvent[]
  showLog: boolean
  onToggleLog: () => void
  onGoToDashboard: () => void
}) {
  const importLine = log.find(e => e.message.includes('transacciones nuevas'))
  const fifoLine   = log.find(e => e.message.includes('lotes') && e.message.includes('consumos'))
  const gpLine     = log.find(e => e.message.includes('G/P neto'))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle size={18} className="text-positive" />
        <span className="font-semibold text-positive">Importación completada</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {importLine && (
          <div className="bg-background-tertiary rounded-xl p-3 text-center">
            <p className="text-xl font-bold mono text-fg">
              {importLine.message.match(/(\d+) transacciones/)?.[1] ?? '—'}
            </p>
            <p className="text-xs text-fg-subtle mt-0.5">Transacciones nuevas</p>
          </div>
        )}
        {fifoLine && (
          <>
            <div className="bg-background-tertiary rounded-xl p-3 text-center">
              <p className="text-xl font-bold mono text-fg">
                {fifoLine.message.match(/(\d+) lotes/)?.[1] ?? '—'}
              </p>
              <p className="text-xs text-fg-subtle mt-0.5">Lotes FIFO</p>
            </div>
            <div className="bg-background-tertiary rounded-xl p-3 text-center">
              <p className="text-xl font-bold mono text-fg">
                {fifoLine.message.match(/(\d+) consumos/)?.[1] ?? '—'}
              </p>
              <p className="text-xs text-fg-subtle mt-0.5">Consumos</p>
            </div>
          </>
        )}
      </div>

      {gpLine && (
        <div className={`flex items-center justify-between p-3 rounded-xl border ${
          (gpLine.message.includes('+') && !gpLine.message.startsWith('G/P neto: -'))
            ? 'bg-positive/5 border-positive/20'
            : 'bg-negative/5 border-negative/20'
        }`}>
          <span className="text-sm text-fg-muted">G/P neto acumulado</span>
          <span className={`font-bold mono ${gpLine.message.includes('+') ? 'text-positive' : 'text-negative'}`}>
            {gpLine.message.replace('G/P neto: ', '')}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onToggleLog}
          className="text-xs text-fg-subtle hover:text-fg transition-colors flex items-center gap-1.5"
        >
          <ChevronDown size={12} className={`transition-transform ${showLog ? 'rotate-180' : ''}`} />
          {showLog ? 'Ocultar' : 'Ver'} log técnico
        </button>
        <button
          type="button"
          onClick={onGoToDashboard}
          className={buttonClasses('primary', 'lg', 'flex')}
        >
          Ver Dashboard
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
