import { CheckCircle, ChevronDown, ArrowRight } from 'lucide-react'
import type { ProgressEvent } from './types'

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
          type="button"
          onClick={onToggleLog}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
        >
          <ChevronDown size={12} className={`transition-transform ${showLog ? 'rotate-180' : ''}`} />
          {showLog ? 'Ocultar' : 'Ver'} log técnico
        </button>
        <button
          type="button"
          onClick={onGoToDashboard}
          className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
        >
          Ver Dashboard
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
