import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SimulationResult } from '../../api/portfolio'
import { formatEur, formatPercent, formatPrice } from '../../utils/format'
import { cascada } from '../../utils/simuladorResumen'
import { StatStrip, type StatStripCell } from '../ui'

// «Qué recibes» del simulador (#529): cascada en color neutro (importe, menos
// comisión, menos IRPF, igual a neto en mano) que suma exactamente lo que se
// ve; el cálculo del IRPF por tramos se despliega bajo su línea. Debajo, una
// tira con lo que no está en la cascada: resultado fiscal, tipo efectivo y
// break-even. Ninguna cifra se repite.

const eur = (c: number) => formatEur(c / 100)

export function QueRecibes({ result, breakEven, loading }: { result: SimulationResult; breakEven: number | null; loading: boolean }) {
  const [verTramos, setVerTramos] = useState(false)
  const c = cascada(result)
  const marginal = result.irpf.marginal
  const efectivo = result.netGainLoss > 0.005 && marginal > 0 ? (marginal / result.netGainLoss) * 100 : null
  const tira: StatStripCell[] = [
    {
      key: 'resultado', label: 'Resultado fiscal',
      tone: result.netGainLoss > 0.005 ? 'positive' : result.netGainLoss < -0.005 ? 'negative' : undefined,
      value: `${result.netGainLoss >= 0 ? '+' : ''}${formatEur(result.netGainLoss)}`,
      sub: 'Importe menos comisión y coste',
    },
    { key: 'efectivo', label: 'Tipo efectivo', value: efectivo !== null ? formatPercent(efectivo, 1) : '—', sub: 'IRPF sobre la ganancia' },
    { key: 'be', label: 'Break-even', value: breakEven !== null ? formatPrice(breakEven) : '—', sub: 'Ni gana ni pierde' },
  ]

  return (
    // Mientras se recalcula, aviso con texto en lugar de atenuar (la opacidad bajaría el contraste).
    <section aria-labelledby="sim-que-recibes" aria-busy={loading} className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="sim-que-recibes" className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Qué recibes</h3>
        {loading && <span className="text-[11px] text-fg-muted" role="status">Recalculando...</span>}
      </div>
      <ul className="space-y-1.5 tabular-nums" data-testid="cascada" aria-label="De lo que vendes a lo que recibes">
        {c.lineas.map(l => (
          <li key={l.key}>
            <div className={`flex items-baseline justify-between gap-3 ${l.op === '=' ? 'border-t border-border pt-2 mt-1' : ''}`}>
              <span className={l.op === '=' ? 'text-sm font-semibold text-fg' : 'text-xs text-fg-muted'}>
                {l.op === '-' && <span aria-hidden="true" className="mono mr-1">-</span>}
                {l.op === '=' && <span aria-hidden="true" className="mono mr-1">=</span>}
                {l.op === '-' && <span className="sr-only">Menos </span>}
                {l.label}
              </span>
              <span className={`mono ${l.op === '=' ? 'text-2xl font-bold text-fg' : 'text-sm text-fg'}`} data-cents={l.cents}>
                {l.op === '-' && l.cents > 0 ? '-' : ''}{eur(l.cents)}
              </span>
            </div>
            {l.key === 'irpf' && result.irpf.desglose.length > 0 && marginal > 0.005 && (
              <div className="mt-1">
                <button type="button" onClick={() => setVerTramos(v => !v)} aria-expanded={verTramos}
                  className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                  <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${verTramos ? 'rotate-180' : ''}`} />
                  Ver el cálculo por tramos
                </button>
                {verTramos && (
                  <div className="mt-1.5 rounded-lg bg-overlay/3 px-3 py-2 space-y-1.5 text-[11px]">
                    <p className="text-fg-subtle">
                      Base del ahorro de {result.irpf.year}: de <span className="mono text-fg-muted">{formatEur(result.irpf.baseAntes)}</span> a <span className="mono text-fg-muted">{formatEur(result.irpf.baseDespues)}</span> con esta venta.
                    </p>
                    {result.irpf.desglose.map((t, i) => (
                      <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 mono">
                        <span className="font-semibold text-fg">{t.tipo} %</span>
                        <span className="text-fg-subtle truncate">sobre {formatEur(t.base)} (tramo de {formatEur(t.desde)} a {Number.isFinite(t.hasta) ? formatEur(t.hasta) : 'en adelante'})</span>
                        <span className="text-fg">{formatEur(t.cuota)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {c.ahorroIrpf !== null && (
        <p className="text-[11px] text-fg-muted">
          Con pérdida, esta venta reduce el IRPF de {result.irpf.year} en unos <span className="mono text-positive-ink">{formatEur(c.ahorroIrpf)}</span> al compensar tus ganancias del año. No suma al neto: se nota al declarar.
        </p>
      )}
      <StatStrip cells={tira} label="Resultado de la venta" columnas={3} />
    </section>
  )
}
