import { useState } from 'react'
import { TrendingUp, TrendingDown, ChevronDown, AlertTriangle } from 'lucide-react'
import { formatEur, formatAmount, formatPrice, pnlColor, formatPercent } from '../utils/format'
import { type SimulationResult } from '../api/portfolio'
import { T, alpha } from '../utils/colors'

// Resultado del simulador de venta (#279): importe bruto, comisión, coste y
// G/P; IRPF marginal sobre la base del ahorro del ejercicio (lo ya realizado y
// las pérdidas pendientes cuentan) y aviso de la regla de recompra.
export function SaleSimulatorResults({ result, loading }: {
  result:  SimulationResult
  loading: boolean
}) {
  const [showLots, setShowLots] = useState(false)

  const net = result.netGainLoss
  const isGain = net > 0.005
  const isLoss = net < -0.005
  const marginal = result.irpf.marginal
  const efectivo = isGain && marginal > 0 ? formatPercent((marginal / net) * 100, 1) : null
  const netoEnMano = result.netProceeds - Math.max(0, marginal)

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>

      {/* Métricas principales */}
      <div className={`rounded-xl border p-4 ${isGain ? 'bg-positive/5 border-positive/15' : isLoss ? 'bg-negative/5 border-negative/15' : 'bg-overlay/3 border-overlay/8'}`}>
        <div className="flex items-center gap-1.5 mb-4">
          {isGain
            ? <TrendingUp  size={14} className="text-positive" aria-hidden="true" />
            : isLoss
            ? <TrendingDown size={14} className="text-negative" aria-hidden="true" />
            : null}
          <span className="text-[11px] font-medium text-fg-muted uppercase tracking-wide">Resultado fiscal</span>
        </div>
        {/* 2×2: cada cifra tiene medio ancho del modal, también con importes de muchos dígitos */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4 tabular-nums">
          <div className="min-w-0">
            <dt className="text-xs text-fg-subtle mb-1 truncate">Importe bruto</dt>
            <dd className="text-base font-semibold mono break-words">{formatEur(result.totalProceeds)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-subtle mb-1 truncate">Comisión ({formatPercent(result.feePct, 2)})</dt>
            <dd className="text-base font-semibold mono text-fg-muted break-words">−{formatEur(result.totalFee)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-subtle mb-1 truncate">Coste de adquisición</dt>
            <dd className="text-base font-semibold mono break-words">{formatEur(result.totalCostBasis)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-subtle mb-1 truncate">Ganancia / pérdida</dt>
            <dd className={`text-base font-bold mono break-words ${pnlColor(net)}`}>{net >= 0 ? '+' : ''}{formatEur(net)}</dd>
          </div>
        </dl>
        {result.netProceeds > 0 && (
          <div className="h-1.5 rounded-full overflow-hidden bg-overlay/8 flex" aria-hidden="true">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (result.totalCostBasis / result.netProceeds) * 100).toFixed(1)}%`,
                backgroundColor: isLoss ? alpha(T.negative, 70) : alpha(T.brand, 60),
              }}
            />
          </div>
        )}
      </div>

      {/* Regla de recompra (art. 33.5 LIRPF) */}
      {result.recompra.aviso && (
        <div role="status" className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-warning/25 bg-warning/5">
          <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-fg-muted leading-relaxed">
            Has comprado {result.asset} en los últimos 2 meses ({result.recompra.comprasRecientes.join(', ')}).
            Por la regla de recompra, esta pérdida podría no computar hasta que vendas esos lotes; tampoco si vuelves a comprar en los 2 meses siguientes.
          </p>
        </div>
      )}

      {/* IRPF marginal */}
      {isGain && marginal > 0.005 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-warning/10">
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wide mb-1">IRPF de esta venta (estimado)</p>
            <div className="flex items-end gap-x-3 gap-y-1 flex-wrap">
              <span className="text-2xl font-bold mono text-warning break-all">{formatEur(marginal)}</span>
              {efectivo && (
                <span className="text-xs text-fg-subtle mb-0.5">
                  tipo efectivo <span className="text-warning font-medium">{efectivo}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle mt-1 break-words">
              Base del ahorro {result.irpf.year}: <span className="mono text-fg-muted">{formatEur(result.irpf.baseAntes)}</span> → <span className="mono text-fg-muted">{formatEur(result.irpf.baseDespues)}</span>
            </p>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-[11px] font-medium text-fg-subtle uppercase tracking-wide mb-2">Tramos que ocupa la venta</p>
            {/* Sin anchos fijos: rango y base a la izquierda (pueden encoger), cuota a la derecha */}
            {result.irpf.desglose.map((t, i) => (
              <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 tabular-nums">
                <span className="text-xs font-bold text-warning-ink bg-warning/15 px-1.5 py-0.5 rounded-lg mono">{t.tipo}%</span>
                <div className="min-w-0 text-xs leading-tight">
                  <p className="text-fg-subtle truncate">{formatEur(t.desde)} – {Number.isFinite(t.hasta) ? formatEur(t.hasta) : '…'}</p>
                  <p className="text-fg-muted mono break-words">base {formatEur(t.base)}</p>
                </div>
                <span className="text-xs text-warning font-medium mono text-right">{formatEur(t.cuota)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-2 mt-2 border-t border-warning/15">
              <span className="text-xs font-medium text-fg-muted">Neto en mano tras impuestos</span>
              <span className="text-xs font-semibold text-fg mono break-all">{formatEur(netoEnMano)}</span>
            </div>
          </div>
          <div className="px-4 pb-3">
            <p className="text-xs text-fg-subtle leading-relaxed">
              Estimación orientativa: tiene en cuenta lo ya realizado este año y las pérdidas pendientes de compensar, pero no otras rentas del ahorro ajenas a la app ni deducciones.
            </p>
          </div>
        </div>
      )}

      {/* Pérdida: compensación y ahorro de IRPF */}
      {isLoss && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-overlay/8 bg-overlay/3">
          <TrendingDown size={13} className="text-negative shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-fg-muted leading-relaxed">
            Pérdida de <span className="text-negative font-medium mono">{formatEur(Math.abs(net))}</span>.
            {marginal < -0.005
              ? <> Reduce el IRPF de {result.irpf.year} en unos <span className="text-positive font-medium mono">{formatEur(Math.abs(marginal))}</span> al compensar tus ganancias del año.</>
              : <> No hay ganancias este año que compensar: queda pendiente para los 4 ejercicios siguientes.</>}
          </p>
        </div>
      )}

      {/* Desglose lotes */}
      <div>
        <button
          type="button"
          onClick={() => setShowLots(s => !s)}
          aria-expanded={showLots}
          className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg transition-colors w-full"
        >
          <span className={`transition-transform duration-200 ${showLots ? 'rotate-180' : ''}`}>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
          <span>Lotes que se venden (FIFO)</span>
          <span className="text-fg-subtle">·</span>
          <span className="text-fg-subtle">{result.lotsConsumed.length} lote{result.lotsConsumed.length !== 1 ? 's' : ''}</span>
        </button>

        {showLots && (
          <div className="mt-3 rounded-xl border border-overlay/8 overflow-hidden">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-overlay/8 bg-overlay/3">
                  <th className="text-left px-3 py-2 font-medium text-fg-subtle">Fecha</th>
                  <th className="text-right px-3 py-2 font-medium text-fg-subtle">Cantidad</th>
                  <th className="text-right px-3 py-2 font-medium text-fg-subtle">Adq. €/ud</th>
                  <th className="text-right px-3 py-2 font-medium text-fg-subtle">G/P</th>
                </tr>
              </thead>
              <tbody>
                {result.lotsConsumed.map((lot, i) => (
                  <tr key={i} className={`border-b border-overlay/5 last:border-0 ${i % 2 === 1 ? 'bg-overlay/2' : ''}`}>
                    <td className="px-3 py-2 text-fg-muted mono">{lot.openedAt}</td>
                    <td className="px-3 py-2 text-right mono text-fg">
                      {formatAmount(lot.qtyConsumed)}
                      {lot.partial && <span className="text-fg-subtle" title="Se vende solo una parte del lote"> de {formatAmount(lot.qtyAvailable)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right mono text-fg-muted">{formatPrice(lot.pricePerUnit)}</td>
                    <td className={`px-3 py-2 text-right mono font-medium ${pnlColor(lot.gainLossEur)}`}>
                      {lot.gainLossEur >= 0 ? '+' : ''}{formatEur(lot.gainLossEur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
