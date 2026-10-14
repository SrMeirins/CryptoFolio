import { useState } from 'react'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { formatEur, formatAmount, formatPrice, pnlColor } from '../utils/format'
import { type TramoDesglose } from '../utils/tramosIrpf'
import { type SimulationResult } from '../api/portfolio'
import { T, alpha } from '../utils/colors'

export function SaleSimulatorResults({ result, loading, net, tramosDesglose }: {
  result:         SimulationResult
  loading:        boolean
  net:            number
  tramosDesglose: TramoDesglose[]
}) {
  const [showLots, setShowLots] = useState(false)

  const isGain = net > 0.005
  const isLoss = net < -0.005

  const irpfFrontend = tramosDesglose.reduce((s, t) => s + t.cuota, 0)
  const efectivo = isGain && irpfFrontend > 0
    ? (irpfFrontend / net * 100).toFixed(1)
    : null

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>

      {/* Métricas principales */}
      <div className={`rounded-xl border p-4 ${isGain ? 'bg-positive/5 border-positive/15' : isLoss ? 'bg-negative/5 border-negative/15' : 'bg-overlay/3 border-overlay/8'}`}>
        <div className="flex items-center gap-1.5 mb-4">
          {isGain
            ? <TrendingUp  size={14} className="text-positive" />
            : isLoss
            ? <TrendingDown size={14} className="text-negative" />
            : null}
          <span className="text-[11px] font-medium text-fg-muted uppercase tracking-wide">Resultado fiscal</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-xs text-fg-subtle mb-1">Ingresos brutos</p>
            <p className="text-base font-semibold mono">{formatEur(result.totalProceeds)}</p>
          </div>
          <div>
            <p className="text-xs text-fg-subtle mb-1">Coste adquisición</p>
            <p className="text-base font-semibold mono">{formatEur(result.totalCostBasis)}</p>
          </div>
          <div>
            <p className="text-xs text-fg-subtle mb-1">Ganancia / Pérdida</p>
            <p className={`text-base font-bold mono ${pnlColor(net)}`}>
              {net >= 0 ? '+' : ''}{formatEur(net)}
            </p>
          </div>
        </div>
        {result.totalProceeds > 0 && (
          <div className="h-1.5 rounded-full overflow-hidden bg-overlay/8 flex">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (result.totalCostBasis / result.totalProceeds) * 100).toFixed(1)}%`,
                backgroundColor: isLoss ? alpha(T.negative, 70) : alpha(T.brand, 60),
              }}
            />
          </div>
        )}
      </div>

      {/* IRPF desglose */}
      {isGain && tramosDesglose.length > 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-warning/10">
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wide mb-1">Retención IRPF estimada</p>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-bold mono text-warning">{formatEur(irpfFrontend)}</span>
              {efectivo && (
                <span className="text-xs text-fg-subtle mb-0.5">
                  tipo efectivo <span className="text-warning font-medium">{efectivo}%</span>
                </span>
              )}
            </div>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-[11px] font-medium text-fg-subtle uppercase tracking-wide mb-2">Desglose por tramos</p>
            {tramosDesglose.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-xs font-bold text-warning bg-warning/15 px-1.5 py-0.5 rounded-lg mono">{t.tipo}%</span>
                  <span className="text-xs text-fg-subtle truncate">{t.tramo}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-fg-muted mono">{formatEur(t.base)}</span>
                  <span className="text-xs text-warning font-medium mono w-16 text-right">{formatEur(t.cuota)}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-warning/15">
              <span className="text-xs font-medium text-fg-muted">Neto tras impuestos</span>
              <span className="text-xs font-semibold text-fg mono">{formatEur(result.totalProceeds - irpfFrontend)}</span>
            </div>
          </div>
          <div className="px-4 pb-3">
            <p className="text-xs text-fg-subtle leading-relaxed">Estimación orientativa. Sin considerar otras rentas del ejercicio ni deducciones aplicables.</p>
          </div>
        </div>
      )}

      {/* Nota pérdida */}
      {isLoss && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-overlay/8 bg-overlay/3">
          <TrendingDown size={13} className="text-negative shrink-0 mt-0.5" />
          <p className="text-xs text-fg-muted leading-relaxed">
            Pérdida de <span className="text-negative font-medium mono">{formatEur(Math.abs(net))}</span>.
            Puede compensar ganancias del mismo ejercicio o de los 4 siguientes.
          </p>
        </div>
      )}

      {/* Desglose lotes */}
      <div>
        <button
          type="button"
          onClick={() => setShowLots(s => !s)}
          className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg transition-colors w-full"
        >
          <span className={`transition-transform duration-200 ${showLots ? 'rotate-180' : ''}`}>
            <ChevronDown size={13} />
          </span>
          <span>Desglose FIFO</span>
          <span className="text-fg-subtle">·</span>
          <span className="text-fg-subtle">{result.lotsConsumed.length} lote{result.lotsConsumed.length !== 1 ? 's' : ''}</span>
        </button>

        {showLots && (
          <div className="mt-3 rounded-xl border border-overlay/8 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-overlay/8 bg-overlay/3">
                  <th className="text-left px-3 py-2 font-medium text-fg-subtle">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-subtle">Wallet</th>
                  <th className="text-right px-3 py-2 font-medium text-fg-subtle">Cantidad</th>
                  <th className="text-right px-3 py-2 font-medium text-fg-subtle">Adq. €/ud</th>
                  <th className="text-right px-3 py-2 font-medium text-fg-subtle">G/P</th>
                </tr>
              </thead>
              <tbody>
                {result.lotsConsumed.map((lot, i) => (
                  <tr key={i} className={`border-b border-overlay/5 last:border-0 ${i % 2 === 1 ? 'bg-overlay/2' : ''}`}>
                    <td className="px-3 py-2 text-fg-muted mono">{lot.openedAt}</td>
                    <td className="px-3 py-2 text-fg-muted">{lot.walletName}</td>
                    <td className="px-3 py-2 text-right mono text-fg">{formatAmount(lot.qtyConsumed)}</td>
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
