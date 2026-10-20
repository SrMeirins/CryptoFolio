import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Clock, Hourglass, RefreshCw } from 'lucide-react'
import type { ProgressEvent } from './types'
import { ImportLogPanel } from './ImportLogPanel'
import { ImportResult } from './ImportResult'
import { buttonClasses, cardClasses } from '../../components/ui'
import { estadoProgreso, formatoDuracion } from './progreso'

// Importación en curso (#324): paso actual en lenguaje claro, barra global,
// tiempo transcurrido, cuenta atrás en las esperas y log técnico plegado.
export function ProgressStage({ log, done, inicio, onGoToDashboard, onReset, onVerHistorial, onIrFiscal }: {
  log: ProgressEvent[]
  done: boolean
  inicio: number
  onGoToDashboard: () => void
  onReset: () => void
  onVerHistorial: (importId: string) => void
  onIrFiscal: (year?: number) => void
}) {
  const [ahora, setAhora] = useState(() => Date.now())
  const [verLog, setVerLog] = useState(false)
  const estado = estadoProgreso(log, ahora)
  const enCurso = estado.fase !== 'done' && estado.fase !== 'error'

  // Reloj de 1 s solo mientras dura: tiempo transcurrido y cuenta atrás.
  useEffect(() => {
    if (!enCurso) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [enCurso])
  // Al terminar, el tiempo se congela en la llegada del último evento.
  const duracion = (enCurso ? ahora : (log.at(-1)?.t ?? ahora)) - inicio

  if (done && estado.fase === 'done') {
    return (
      <ImportResult resumen={[...log].reverse().find(e => e.phase === 'done')?.resumen} duracion={duracion} log={log}
        onGoToDashboard={onGoToDashboard} onReset={onReset} onVerHistorial={onVerHistorial} onIrFiscal={onIrFiscal} />
    )
  }

  const error = log.find(e => e.phase === 'error')
  return (
    <div className={cardClasses('md', 'space-y-5')}>
      {/* Paso actual */}
      <div className="flex items-start gap-4">
        <span className={`grid place-items-center size-11 rounded-2xl shrink-0 ${error ? 'bg-negative/10 text-negative' : estado.espera !== null ? 'bg-warning/10 text-warning' : 'bg-brand/10 text-brand'}`} aria-hidden="true">
          {error ? <AlertTriangle size={20} /> : estado.espera !== null ? <Hourglass size={20} /> : <RefreshCw size={20} className="animate-spin motion-reduce:animate-none" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-fg" aria-live="polite">{estado.titulo}</p>
          <p className="text-xs text-fg-subtle mt-0.5">
            {estado.espera !== null
              ? <>Límite de peticiones de CoinGecko: reanuda en <span className="mono text-warning font-medium">{estado.espera} s</span>. No hace falta hacer nada.</>
              : error ? 'Revisa el detalle y vuelve a intentarlo.'
                : estado.detalle ?? 'Preparando…'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold mono tabular-nums text-fg">{estado.porcentaje} %</p>
          <p className="text-[11px] text-fg-subtle inline-flex items-center gap-1"><Clock size={10} aria-hidden="true" />{formatoDuracion(duracion)}</p>
        </div>
      </div>

      <div className="h-2 bg-background-tertiary rounded-full overflow-hidden" role="progressbar" aria-label="Progreso de la importación"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={estado.porcentaje}>
        <div className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${error ? 'bg-negative' : 'bg-brand-solid'}`} style={{ width: `${estado.porcentaje}%` }} />
      </div>

      {/* Fases */}
      <ol className="grid grid-cols-3 gap-2" aria-label="Fases de la importación">
        {estado.fases.map((f, i) => (
          <li key={f.key} aria-current={f.estado === 'actual' ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
              f.estado === 'hecha' ? 'border-positive/30 bg-positive/5 text-positive'
                : f.estado === 'actual' ? 'border-brand/40 bg-brand/5 text-brand'
                  : f.estado === 'error' ? 'border-negative/40 bg-negative/5 text-negative'
                    : 'border-border text-fg-subtle'}`}>
            <span className="grid place-items-center size-5 rounded-full bg-current/10 shrink-0" aria-hidden="true">
              {f.estado === 'hecha' ? <Check size={11} /> : f.estado === 'error' ? <AlertTriangle size={11} /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
            </span>
            <span className="font-medium">{f.label}</span>
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="flex items-start gap-3 p-4 bg-negative/5 border border-negative/30 rounded-xl">
          <AlertTriangle size={16} className="text-negative shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-negative">Error durante la importación</p>
            <p className="text-xs text-fg-muted">{error.message}</p>
            <button type="button" onClick={onReset} className={buttonClasses('secondary', 'sm')}>Empezar de nuevo</button>
          </div>
        </div>
      )}

      {/* Detalle técnico, plegado salvo si hay error */}
      <div>
        <button type="button" onClick={() => setVerLog(v => !v)} aria-expanded={verLog || !!error}
          className="text-xs text-fg-subtle hover:text-fg flex items-center gap-1.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 rounded">
          <ChevronDown size={12} className={`transition-transform ${verLog || error ? 'rotate-180' : ''}`} aria-hidden="true" />
          {verLog || error ? 'Ocultar detalles técnicos' : 'Ver detalles técnicos'}
        </button>
        {(verLog || !!error) && <div className="mt-2"><ImportLogPanel log={log} done={!enCurso} /></div>}
      </div>
    </div>
  )
}
