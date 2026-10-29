import type { FifoRunState, FifoSummary } from '../../hooks/useRunFifoStream'
import { formatEur, formatNumber } from '../../utils/format'

// Avance y resumen del FIFO en Datos (#454): barra mientras calcula y, al
// acabar, una tabla antes y después con la diferencia en texto.

const ROWS: ReadonlyArray<{ key: keyof FifoSummary; label: string; money?: boolean }> = [
  { key: 'lots', label: 'Lotes' },
  { key: 'openLots', label: 'Lotes abiertos' },
  { key: 'consumptions', label: 'Consumos' },
  { key: 'shortfalls', label: 'Faltantes' },
  { key: 'netGainEur', label: 'Plusvalía neta', money: true },
]

function fmt(v: number, money?: boolean, signed = false): string {
  const s = money ? formatEur(Math.abs(v)) : formatNumber(Math.abs(v), 0)
  if (!signed) return v < 0 ? `-${s}` : s
  return v === 0 ? 'Sin cambios' : `${v > 0 ? '+' : '-'}${s}`
}

export function FifoRunPanel({ state }: { state: FifoRunState }) {
  if (state.status === 'idle') return null
  if (state.status === 'error') return <p role="alert" className="text-xs text-negative-ink">{state.message}</p>
  if (state.status === 'running') {
    const pct = state.step === 'fifo' && state.total > 0 ? Math.round((state.done / state.total) * 100) : 0
    const label = state.step === 'precios' ? 'Preparando precios históricos...' : `Procesando ${formatNumber(state.done, 0)} de ${formatNumber(state.total, 0)} operaciones`
    return (
      <div className="space-y-1.5">
        <div role="progressbar" aria-label="Avance del FIFO" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={label}
          className="h-1.5 rounded-full bg-overlay/10 overflow-hidden">
          <div className={`h-full bg-brand-solid transition-[width] duration-300 ${state.step === 'precios' ? 'w-1/6 animate-pulse' : ''}`}
            style={state.step === 'fifo' ? { width: `${pct}%` } : undefined} />
        </div>
        <p role="status" className="text-xs text-fg-subtle">{label}</p>
      </div>
    )
  }
  const issues = [
    state.errors > 0 && `${formatNumber(state.errors, 0)} ${state.errors === 1 ? 'problema' : 'problemas'}`,
    state.warnings > 0 && `${formatNumber(state.warnings, 0)} ${state.warnings === 1 ? 'aviso' : 'avisos'}`,
  ].filter(Boolean).join(' y ')
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <caption className="sr-only">Estado FIFO antes y después de recalcular</caption>
        <thead>
          <tr className="text-xs text-fg-subtle border-b border-border">
            <th scope="col" className="text-left font-medium py-1.5">Resultado</th>
            <th scope="col" className="text-right font-medium py-1.5">Antes</th>
            <th scope="col" className="text-right font-medium py-1.5">Después</th>
            <th scope="col" className="text-right font-medium py-1.5">Cambio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {ROWS.map(r => (
            <tr key={r.key} data-fifo={r.key}>
              <th scope="row" className="text-left font-normal py-1.5">{r.label}</th>
              <td className="text-right mono tabular-nums py-1.5 text-fg-muted">{fmt(state.before[r.key], r.money)}</td>
              <td className="text-right mono tabular-nums py-1.5">{fmt(state.after[r.key], r.money)}</td>
              <td className={`text-right mono tabular-nums py-1.5 text-xs ${state.diff[r.key] === 0 ? 'text-fg-subtle' : 'text-fg'}`}>{fmt(state.diff[r.key], r.money, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {issues && <p className="text-xs text-warning-ink">{issues}. {state.errors + state.warnings === 1 ? 'Revísalo' : 'Revísalos'} en Fiscal o en el Historial.</p>}
    </div>
  )
}
