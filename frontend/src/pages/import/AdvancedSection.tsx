import { useState } from 'react'
import { RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import { useRunFifo } from '../../hooks/useRunFifo'
import { cardClasses, Button } from '../../components/ui'

export function AdvancedSection() {
  const [open, setOpen] = useState(false)
  const { running, result, run } = useRunFifo()

  return (
    <div className={cardClasses('none')}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-background-tertiary/50 transition-colors"
      >
        <span className="text-xs text-fg-subtle font-medium uppercase tracking-wider">Opciones avanzadas</span>
        {open ? <ChevronUp size={14} className="text-fg-subtle" /> : <ChevronDown size={14} className="text-fg-subtle" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recalcular FIFO manualmente</p>
              <p className="text-xs text-fg-subtle mt-0.5">
                Util si modificaste datos directamente en la DB o borraste un import
              </p>
            </div>
            <Button variant="ghost" onClick={run} loading={running} icon={<RefreshCw size={13} aria-hidden="true" />}
              className="px-4 py-2 bg-background-tertiary hover:bg-border text-xs text-fg hover:text-fg">
              {running ? 'Calculando...' : 'Recalcular'}
            </Button>
          </div>
          {result && (
            <p className={`text-xs ${result.startsWith('Error') ? 'text-negative' : 'text-positive'}`}>{result}</p>
          )}
        </div>
      )}
    </div>
  )
}
