import { useState } from 'react'
import { RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import { useRunFifo } from '../../hooks/useRunFifo'

export function AdvancedSection() {
  const [open, setOpen] = useState(false)
  const { running, result, run } = useRunFifo()

  return (
    <div className="card p-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
      >
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Opciones avanzadas</span>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recalcular FIFO manualmente</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Util si modificaste datos directamente en la DB o borraste un import
              </p>
            </div>
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
              {running ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>
          {result && (
            <p className={`text-xs ${result.startsWith('Error') ? 'text-accent-red' : 'text-accent-green'}`}>{result}</p>
          )}
        </div>
      )}
    </div>
  )
}
