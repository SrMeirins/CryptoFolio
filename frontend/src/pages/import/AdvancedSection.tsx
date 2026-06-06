import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'

export function AdvancedSection() {
  const [open, setOpen]     = useState(false)
  const queryClient         = useQueryClient()
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  async function runFifo() {
    setRunning(true)
    setResult(null)
    try {
      const res  = await fetch('/api/fifo/run', { method: 'POST' })
      const data = await res.json()
      setResult(`FIFO recalculado: ${data.lotsCreated} lotes, G/P neto ${(data.totalGainEur + data.totalLossEur).toFixed(2)}`)
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
    } catch {
      setResult('Error al recalcular')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="card p-0">
      <button
        onClick={() => setOpen(!open)}
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
              onClick={runFifo}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
              {running ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>
          {result && <p className="text-xs text-accent-green">{result}</p>}
        </div>
      )}
    </div>
  )
}
