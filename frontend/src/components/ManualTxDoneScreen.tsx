import { X, CheckCircle } from 'lucide-react'
import { type FifoRunResult } from '../api/portfolio'
import { formatEur } from '../utils/format'

export function ManualTxDoneScreen({
  fifoStats, isEditMode, onClose, onAddAnother,
}: { fifoStats: FifoRunResult | null; isEditMode: boolean; onClose: () => void; onAddAnother?: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-lg">{isEditMode ? 'Transacción actualizada' : 'Transacción guardada'}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-500 hover:text-white transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center">
          <CheckCircle size={22} className="text-accent-green" />
        </div>
        <div>
          <p className="font-medium text-white mb-1">Guardada correctamente</p>
          <p className="text-sm text-gray-500">El motor FIFO ha recalculado todos los lotes</p>
        </div>

        {fifoStats && (
          <div className="grid grid-cols-2 gap-3 w-full max-w-xs mt-2">
            <div className="bg-background-tertiary rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-white mono">{fifoStats.lotsCreated}</p>
              <p className="text-xs text-gray-500 mt-0.5">Lotes creados</p>
            </div>
            <div className="bg-background-tertiary rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-white mono">{fifoStats.lotsConsumed}</p>
              <p className="text-xs text-gray-500 mt-0.5">Lotes consumidos</p>
            </div>
            {(fifoStats.totalGainEur > 0 || fifoStats.totalLossEur > 0) && (
              <>
                <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-accent-green mono">+{formatEur(fifoStats.totalGainEur)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Ganancias</p>
                </div>
                <div className="bg-accent-red/5 border border-accent-red/20 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-accent-red mono">-{formatEur(fifoStats.totalLossEur)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Pérdidas</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
        {onAddAnother ? (
          <button
            type="button"
            onClick={onAddAnother}
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            + Añadir otra transacción
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 bg-background-tertiary hover:bg-border rounded-lg text-sm font-medium transition-colors"
        >
          Cerrar
        </button>
      </div>
    </>
  )
}
