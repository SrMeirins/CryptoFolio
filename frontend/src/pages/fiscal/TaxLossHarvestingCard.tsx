import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Leaf, TrendingDown, Zap, ArrowRight, Loader2 } from 'lucide-react'
import { formatEur, formatAmount, formatPrice, pnlColor } from '../../utils/format'
import { usePricesStore } from '../../store/pricesStore'
import { SaleSimulatorModal } from '../../components/SaleSimulatorModal'

// ── IRPF tramos 2024 (inline, igual que en SaleSimulatorModal) ─────────────
const TRAMOS = [
  { desde: 0,      hasta: 6000,     tipo: 19 },
  { desde: 6000,   hasta: 50000,    tipo: 21 },
  { desde: 50000,  hasta: 200000,   tipo: 23 },
  { desde: 200000, hasta: 300000,   tipo: 27 },
  { desde: 300000, hasta: Infinity, tipo: 28 },
]
function calcIrpf(base: number): number {
  if (base <= 0) return 0
  let tax = 0, restante = base, desde = 0
  for (const t of TRAMOS) {
    const tramo = Math.min(restante, t.hasta - desde)
    if (tramo <= 0) break
    tax += tramo * t.tipo / 100
    restante -= tramo
    desde = t.hasta
    if (restante <= 0) break
  }
  return tax
}

interface RawCandidate { asset: string; qty: number; cost_basis: number; avg_cost_price: number }

interface EnrichedCandidate {
  asset:         string
  qty:           number
  costBasis:     number
  avgCostPrice:  number
  currentPrice:  number
  currentValue:  number
  unrealizedPnl: number
  irpfSaving:    number
}

interface Props {
  year:       number
  ganancias:  number
  perdidas:   number
  neto:       number
}

export function TaxLossHarvestingCard({ year, ganancias, perdidas, neto }: Props) {
  const prices  = usePricesStore(s => s.prices)
  const [simulator, setSimulator] = useState<{ asset: string; qty: number; price: number } | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => { const t = setTimeout(() => setVisible(true), 80); return () => clearTimeout(t) }, [])

  const { data, isLoading } = useQuery<{ year: number; candidates: RawCandidate[] }>({
    queryKey: ['tax-loss-candidates', year],
    queryFn: () => fetch(`/api/fiscal/${year}/tax-loss-candidates`).then(r => r.json()),
    staleTime: 2 * 60_000,
  })

  const irpfActual = calcIrpf(Math.max(0, neto))

  // Enriquecer candidatos con precios en vivo y calcular P&L latente
  const enriched = useMemo<EnrichedCandidate[]>(() => {
    if (!data?.candidates) return []
    return data.candidates
      .map(c => {
        const currentPrice  = prices[c.asset] ?? 0
        const currentValue  = c.qty * currentPrice
        const unrealizedPnl = currentPrice > 0 ? currentValue - c.cost_basis : 0
        // Ahorro: cuánto IRPF nos evitamos si realizamos esta pérdida
        const netoPostVenta = neto + unrealizedPnl
        const irpfPost      = calcIrpf(Math.max(0, netoPostVenta))
        const irpfSaving    = irpfActual - irpfPost
        return { ...c, costBasis: c.cost_basis, avgCostPrice: c.avg_cost_price, currentPrice, currentValue, unrealizedPnl, irpfSaving }
      })
      .filter(c => c.currentPrice > 0 && c.unrealizedPnl < -0.5)
      .sort((a, b) => a.unrealizedPnl - b.unrealizedPnl)
  }, [data, prices, neto, irpfActual])

  // Ahorro total si se realizaran TODAS las pérdidas latentes
  const totalUnrealizedLoss  = enriched.reduce((s, c) => s + c.unrealizedPnl, 0)
  const totalPotentialSaving = enriched.reduce((s, c) => s + c.irpfSaving, 0)
  const hayGanancias         = neto > 0.5

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/8 bg-[#0a0d14] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Leaf size={15} className="text-emerald-400" />
          <span className="text-sm font-semibold">Tax Loss Harvesting</span>
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white/4 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!enriched.length) {
    return (
      <div className="rounded-2xl border border-white/8 bg-[#0a0d14] p-6">
        <div className="flex items-center gap-2 mb-2">
          <Leaf size={15} className="text-emerald-400" />
          <span className="text-sm font-semibold">Tax Loss Harvesting</span>
        </div>
        <p className="text-xs text-gray-500">No hay activos con pérdida latente actualmente.</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl border border-white/8 bg-[#0a0d14] overflow-hidden">

        {/* Header con gradiente verde esmeralda */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Leaf size={14} className="text-emerald-400" />
                <span className="text-[11px] font-semibold text-emerald-400 tracking-widest uppercase">Tax Loss Harvesting</span>
                <span className="flex items-center gap-1 text-[9px] text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Precios en tiempo real
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Optimiza tu factura fiscal {year} vendiendo activos con pérdida latente para compensar ganancias
              </p>
            </div>
          </div>

          {/* Pills de contexto fiscal */}
          <div className="relative flex items-center gap-2 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8">
              <span className="text-[10px] text-gray-500">Ganancias</span>
              <span className="text-[11px] font-semibold mono text-emerald-400">+{formatEur(ganancias)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8">
              <span className="text-[10px] text-gray-500">Pérdidas</span>
              <span className="text-[11px] font-semibold mono text-red-400">{formatEur(perdidas)}</span>
            </div>
            <ArrowRight size={12} className="text-gray-600" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${neto > 0 ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-white/5 border-white/8'}`}>
              <span className="text-[10px] text-gray-500">Neto declarable</span>
              <span className={`text-[11px] font-bold mono ${pnlColor(neto)}`}>{neto >= 0 ? '+' : ''}{formatEur(neto)}</span>
            </div>
            {irpfActual > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                <span className="text-[10px] text-gray-500">IRPF estimado</span>
                <span className="text-[11px] font-semibold mono text-amber-400">{formatEur(irpfActual)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Oportunidad total — solo si hay ganancias que compensar */}
        {hayGanancias && totalPotentialSaving > 0.01 && (
          <div className="px-5 py-4 border-b border-white/8 bg-gradient-to-r from-emerald-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Ahorro máximo potencial IRPF</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold mono text-emerald-400" style={{ textShadow: '0 0 24px rgb(52 211 153 / 0.4)' }}>
                    {formatEur(totalPotentialSaving)}
                  </span>
                  <span className="text-xs text-gray-500 mb-1">compensando {formatEur(Math.abs(totalUnrealizedLoss))} de pérdidas latentes</span>
                </div>
              </div>
              <Zap size={28} className="text-emerald-400/30" />
            </div>
          </div>
        )}

        {!hayGanancias && (
          <div className="px-5 py-3 border-b border-white/8 bg-white/2">
            <p className="text-[11px] text-gray-500">
              Tu saldo fiscal neto es negativo. Realizando estas pérdidas las acumulas para compensar ganancias de los próximos 4 ejercicios.
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              Total acumulable: <span className="font-semibold text-red-400 mono">{formatEur(Math.abs(totalUnrealizedLoss))}</span>
            </p>
          </div>
        )}

        {/* Tabla de candidatos */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/6 bg-white/2">
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Activo</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Posición</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Precio actual</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Coste medio</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">P/L latente</th>
                {hayGanancias && (
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Ahorro IRPF</th>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {enriched.map((c, i) => {
                const pct = ((c.unrealizedPnl / c.costBasis) * 100).toFixed(1)
                return (
                  <tr
                    key={c.asset}
                    className={`
                      border-b border-white/4 last:border-0
                      transition-all duration-300 ease-out
                      hover:bg-white/3 group cursor-default
                      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
                    `}
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    {/* Activo */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                          <TrendingDown size={12} className="text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{c.asset}</p>
                          <p className="text-[10px] text-gray-600 mono">{formatAmount(c.qty)} uds</p>
                        </div>
                      </div>
                    </td>

                    {/* Posición (valor actual) */}
                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm font-medium mono">{formatEur(c.currentValue)}</p>
                      <p className="text-[10px] text-gray-600 mono">coste {formatEur(c.costBasis)}</p>
                    </td>

                    {/* Precio actual */}
                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm mono">{formatPrice(c.currentPrice)}</p>
                    </td>

                    {/* Coste medio */}
                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm mono text-gray-400">{formatPrice(c.avgCostPrice)}</p>
                    </td>

                    {/* P/L latente */}
                    <td className="px-4 py-3.5 text-right">
                      <p className="text-sm font-semibold mono text-red-400">{formatEur(c.unrealizedPnl)}</p>
                      <p className="text-[10px] text-red-500/70 mono">{pct}%</p>
                    </td>

                    {/* Ahorro IRPF */}
                    {hayGanancias && (
                      <td className="px-4 py-3.5 text-right">
                        {c.irpfSaving > 0.01 ? (
                          <p className="text-sm font-semibold mono text-emerald-400">
                            {formatEur(c.irpfSaving)}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-600">—</p>
                        )}
                      </td>
                    )}

                    {/* Acción */}
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => setSimulator({ asset: c.asset, qty: c.qty, price: c.currentPrice })}
                        className="
                          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium
                          bg-white/5 border border-white/10 text-gray-400
                          hover:bg-accent-blue/15 hover:border-accent-blue/40 hover:text-accent-blue
                          active:scale-95 transition-all duration-150
                          opacity-0 group-hover:opacity-100
                        "
                      >
                        Simular <ArrowRight size={10} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer resumen */}
        <div className="px-5 py-3 border-t border-white/6 bg-white/1 flex items-center justify-between gap-4">
          <p className="text-[11px] text-gray-600">
            {enriched.length} activo{enriched.length !== 1 ? 's' : ''} con pérdida latente ·{' '}
            {formatEur(Math.abs(totalUnrealizedLoss))} en total
          </p>
          {hayGanancias && totalPotentialSaving > 0.01 && (
            <p className="text-[11px] text-gray-500 shrink-0">
              Ahorro máximo: <span className="font-semibold text-emerald-400 mono">{formatEur(totalPotentialSaving)}</span>
            </p>
          )}
        </div>

      </div>

      {simulator && (
        <SaleSimulatorModal
          asset={simulator.asset}
          totalQty={simulator.qty}
          currentPrice={simulator.price}
          onClose={() => setSimulator(null)}
        />
      )}
    </>
  )
}
