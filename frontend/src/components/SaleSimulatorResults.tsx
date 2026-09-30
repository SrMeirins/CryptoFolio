import { useState } from 'react'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { formatEur, formatAmount, formatPrice, pnlColor } from '../utils/format'
import { type TramoDesglose } from '../pages/fiscal/helpers'
import { type SimulationResult } from '../api/portfolio'

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
      <div className={`rounded-2xl border p-4 ${isGain ? 'bg-accent-green/5 border-accent-green/15' : isLoss ? 'bg-accent-red/5 border-accent-red/15' : 'bg-white/3 border-white/8'}`}>
        <div className="flex items-center gap-1.5 mb-4">
          {isGain
            ? <TrendingUp  size={14} className="text-accent-green" />
            : isLoss
            ? <TrendingDown size={14} className="text-accent-red" />
            : null}
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Resultado fiscal</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Ingresos brutos</p>
            <p className="text-base font-semibold mono">{formatEur(result.totalProceeds)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Coste adquisición</p>
            <p className="text-base font-semibold mono">{formatEur(result.totalCostBasis)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Ganancia / Pérdida</p>
            <p className={`text-base font-bold mono ${pnlColor(net)}`}>
              {net >= 0 ? '+' : ''}{formatEur(net)}
            </p>
          </div>
        </div>
        {result.totalProceeds > 0 && (
          <div className="h-1.5 rounded-full overflow-hidden bg-white/8 flex">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (result.totalCostBasis / result.totalProceeds) * 100).toFixed(1)}%`,
                backgroundColor: isLoss ? 'rgb(239 68 68 / 0.7)' : 'rgb(99 102 241 / 0.6)',
              }}
            />
          </div>
        )}
      </div>

      {/* IRPF desglose */}
      {isGain && tramosDesglose.length > 0 && (
        <div className="rounded-2xl border border-accent-amber/20 bg-accent-amber/5 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-accent-amber/10">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Retención IRPF estimada</p>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-bold mono text-accent-amber">{formatEur(irpfFrontend)}</span>
              {efectivo && (
                <span className="text-xs text-gray-500 mb-0.5">
                  tipo efectivo <span className="text-accent-amber font-medium">{efectivo}%</span>
                </span>
              )}
            </div>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Desglose por tramos</p>
            {tramosDesglose.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[10px] font-bold text-accent-amber bg-accent-amber/15 px-1.5 py-0.5 rounded-md mono">{t.tipo}%</span>
                  <span className="text-[10px] text-gray-500 truncate">{t.tramo}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-gray-400 mono">{formatEur(t.base)}</span>
                  <span className="text-[10px] text-accent-amber font-medium mono w-16 text-right">{formatEur(t.cuota)}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-accent-amber/15">
              <span className="text-[10px] font-medium text-gray-400">Neto tras impuestos</span>
              <span className="text-[10px] font-semibold text-white mono">{formatEur(result.totalProceeds - irpfFrontend)}</span>
            </div>
          </div>
          <div className="px-4 pb-3">
            <p className="text-[9px] text-gray-600 leading-relaxed">Estimación orientativa. Sin considerar otras rentas del ejercicio ni deducciones aplicables.</p>
          </div>
        </div>
      )}

      {/* Nota pérdida */}
      {isLoss && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-white/8 bg-white/3">
          <TrendingDown size={13} className="text-accent-red shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Pérdida de <span className="text-accent-red font-medium mono">{formatEur(Math.abs(net))}</span>.
            Puede compensar ganancias del mismo ejercicio o de los 4 siguientes.
          </p>
        </div>
      )}

      {/* Desglose lotes */}
      <div>
        <button
          type="button"
          onClick={() => setShowLots(s => !s)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors w-full"
        >
          <span className={`transition-transform duration-200 ${showLots ? 'rotate-180' : ''}`}>
            <ChevronDown size={13} />
          </span>
          <span>Desglose FIFO</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-600">{result.lotsConsumed.length} lote{result.lotsConsumed.length !== 1 ? 's' : ''}</span>
        </button>

        {showLots && (
          <div className="mt-3 rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Wallet</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Cantidad</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Adq. €/ud</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">G/P</th>
                </tr>
              </thead>
              <tbody>
                {result.lotsConsumed.map((lot, i) => (
                  <tr key={i} className={`border-b border-white/5 last:border-0 ${i % 2 === 1 ? 'bg-white/2' : ''}`}>
                    <td className="px-3 py-2 text-gray-400 mono">{lot.openedAt}</td>
                    <td className="px-3 py-2 text-gray-400">{lot.walletName}</td>
                    <td className="px-3 py-2 text-right mono text-gray-300">{formatAmount(lot.qtyConsumed)}</td>
                    <td className="px-3 py-2 text-right mono text-gray-400">{formatPrice(lot.pricePerUnit)}</td>
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
