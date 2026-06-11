import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, FiatBalance, FifoLot } from '../api/portfolio'
import { AssetTable } from '../components/AssetTable'
import { SaleSimulatorModal } from '../components/SaleSimulatorModal'
import { usePricesStore } from '../store/pricesStore'
import { formatEur } from '../utils/format'
import { InfoTooltip } from '../components/InfoTooltip'
import { MetricCard } from '../components/MetricCard'
import { RefreshCw, Wallet, Search, X, ChevronDown } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

// ── Cálculo de totales globales ────────────────────────────────────────────
function usePortfolioTotals(lots: FifoLot[], fiatBalances: FiatBalance[]) {
  const prices = usePricesStore(s => s.prices)

  let totalValue  = 0
  let totalCost   = 0
  let assetsTotal = 0
  let pricesMissing = 0

  const cryptoByAsset = new Map<string, { qty: number; cost: number }>()
  for (const lot of lots) {
    const prev = cryptoByAsset.get(lot.asset) ?? { qty: 0, cost: 0 }
    cryptoByAsset.set(lot.asset, {
      qty:  prev.qty  + parseFloat(lot.quantity),
      cost: prev.cost + parseFloat(lot.cost_basis_eur),
    })
  }

  for (const [asset, { qty, cost }] of cryptoByAsset) {
    assetsTotal++
    totalCost += cost
    const price = prices[asset] ?? 0
    if (price > 0) totalValue += qty * price
    else pricesMissing++
  }

  for (const b of fiatBalances) {
    const bal = parseFloat(b.balance)
    if (bal > 0) totalValue += bal
  }

  const pnl    = totalValue - totalCost
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0

  return { totalValue, totalCost, pnl, pnlPct, assetsTotal, pricesMissing }
}


// ── AllocationDonut ────────────────────────────────────────────────────────
const DONUT_COLORS = [
  '#6366f1','#F0B90B','#00c896','#e74c3c','#8b5cf6',
  '#3b82f6','#f59e0b','#10b981','#ef4444','#a78bfa',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]

function AllocationDonut({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const prices = usePricesStore(s => s.prices)

  const [hovered, setHovered] = useState<string | null>(null)

  type DonutItem = { name: string; value: number; pct: number }
  const { total, items } = useMemo<{ total: number; items: DonutItem[] }>(() => {
    const byAsset = new Map<string, number>()
    for (const lot of lots) {
      const price = prices[lot.asset] ?? 0
      if (price === 0) continue
      byAsset.set(lot.asset, (byAsset.get(lot.asset) ?? 0) + parseFloat(lot.quantity) * price)
    }
    for (const b of fiatBalances) {
      const val = parseFloat(b.balance)
      if (val > 0) byAsset.set(b.asset, (byAsset.get(b.asset) ?? 0) + val)
    }
    const total = [...byAsset.values()].reduce((s, v) => s + v, 0)
    if (total === 0) return { total: 0, items: [] }
    const sorted = [...byAsset.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 8)
    const restVal = sorted.slice(8).reduce((s, [, v]) => s + v, 0)
    return {
      total,
      items: [
        ...top.map(([name, value]) => ({ name, value, pct: (value / total) * 100 })),
        ...(restVal > 0 ? [{ name: 'Otros', value: restVal, pct: (restVal / total) * 100 }] : []),
      ],
    }
  }, [lots, fiatBalances, prices])

  if (total === 0) return null

  const hoveredEntry = items.find(d => d.name === hovered)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: DonutItem }[] }) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-gray-950/95 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
        <p className="font-semibold text-white mono mb-0.5">{d.name}</p>
        <p className="text-gray-300">{formatEur(d.value)}</p>
        <p className="text-gray-500">{d.pct.toFixed(1)}% del portfolio</p>
      </div>
    )
  }

  return (
    <div className="bg-background-card border border-border rounded-2xl p-6 space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Distribución del portfolio</h3>
          <p className="text-xs text-gray-600 mt-0.5">{items.length} activos · actualización cada 5 s</p>
        </div>
        <p className="text-xl font-semibold mono text-white">{formatEur(total)}</p>
      </div>

      <div className="flex items-center gap-8">
        {/* Donut más grande */}
        <div className="relative shrink-0" style={{ width: 240, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={items}
                cx="50%" cy="50%"
                innerRadius={78} outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                onMouseEnter={(_, __, e) => setHovered((e.target as SVGElement).closest('[name]')?.getAttribute('name') ?? null)}
                onMouseLeave={() => setHovered(null)}
              >
                {items.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                    opacity={hovered && hovered !== entry.name ? 0.25 : 1}
                    style={{ transition: 'opacity 0.2s', cursor: 'default', outline: 'none' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
            {hoveredEntry ? (
              <>
                <p className="text-base font-bold text-white mono tracking-tight">{hoveredEntry.name}</p>
                <p className="text-2xl font-semibold mono text-white">{hoveredEntry.pct.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mono">{formatEur(hoveredEntry.value)}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest">portfolio</p>
                <p className="text-lg font-bold mono text-white leading-tight">{formatEur(total)}</p>
              </>
            )}
          </div>
        </div>

        {/* Leyenda — lista vertical con barra de proporción */}
        <div className="flex-1 space-y-2 min-w-0">
          {items.map((entry, i) => {
            const color = DONUT_COLORS[i % DONUT_COLORS.length]
            const isActive = !hovered || hovered === entry.name
            return (
              <div
                key={entry.name}
                className="cursor-default"
                style={{ opacity: isActive ? 1 : 0.3, transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHovered(entry.name)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-gray-200 truncate">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-gray-500 mono">{formatEur(entry.value)}</span>
                    <span className="text-xs font-semibold mono w-10 text-right" style={{ color }}>{entry.pct.toFixed(1)}%</span>
                  </div>
                </div>
                {/* Barra proporcional */}
                <div className="h-0.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${entry.pct}%`, backgroundColor: color, opacity: 0.6 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── WalletSections ── una sección por cada wallet real ─────────────────────
function WalletSections({ lots, fiatBalances, onSimulate }: { lots: FifoLot[]; fiatBalances: FiatBalance[]; onSimulate: (asset: string, qty: number, price: number) => void }) {
  // Coleccionar wallets únicas en orden: frías primero, exchanges al final
  const walletOrder: string[] = []
  const seen = new Set<string>()

  // 1. Wallets frías
  for (const lot of lots) {
    if (lot.wallet_kind !== 'exchange' && !seen.has(lot.wallet_id)) {
      walletOrder.push(lot.wallet_id)
      seen.add(lot.wallet_id)
    }
  }
  // 2. Exchanges
  for (const lot of lots) {
    if (lot.wallet_kind === 'exchange' && !seen.has(lot.wallet_id)) {
      walletOrder.push(lot.wallet_id)
      seen.add(lot.wallet_id)
    }
  }
  // 3. Wallets que solo tienen fiat (sin lotes cripto)
  for (const b of fiatBalances) {
    if (!seen.has(b.wallet_id)) {
      walletOrder.push(b.wallet_id)
      seen.add(b.wallet_id)
    }
  }

  const groups = walletOrder.map(wid => {
    const wLots = lots.filter(l => l.wallet_id === wid)
    const wFiat = fiatBalances.filter(b => b.wallet_id === wid)
    const ref   = wLots[0] ?? { wallet_name: wFiat[0]?.wallet_name, wallet_color: wFiat[0]?.wallet_color, wallet_kind: wFiat[0]?.wallet_kind }
    return {
      key:   wid,
      name:  ref.wallet_name  as string,
      color: ref.wallet_color as string,
      kind:  ref.wallet_kind  as string,
      lots:  wLots,
      fiats: wFiat,
      assetCount: new Set(wLots.map(l => l.asset)).size,
    }
  })

  const KIND_LABEL: Record<string, string> = {
    exchange: 'Exchange',
    hardware: 'Hardware',
    cold:     'Frío',
    hot:      'Caliente',
  }

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <div key={g.key} className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: g.color }}>
              {g.name}
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium uppercase tracking-wide text-gray-600 border-gray-700/60">
              {KIND_LABEL[g.kind] ?? g.kind}
            </span>
            {g.assetCount > 0 && (
              <span className="text-xs text-gray-600">
                {g.assetCount} activo{g.assetCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <AssetTable lots={g.lots} fiatBalances={g.fiats} onSimulate={onSimulate} />
        </div>
      ))}
    </div>
  )
}

export function Portfolio() {
  const prices = usePricesStore(s => s.prices)

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
  })
  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
  })
  const { data: eurFlow } = useQuery({
    queryKey: ['eur-flow'],
    queryFn: portfolioApi.getEurFlow,
  })

  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [simulator, setSimulator] = useState<{ asset: string; qty: number; price: number } | null>(null)

  // Filtrar lots y fiatBalances por búsqueda
  const q = search.trim().toUpperCase()
  const filteredLots  = q ? lots.filter(l => l.asset.includes(q)) : lots
  const filteredFiats = q ? fiatBalances.filter(b => b.asset.includes(q)) : fiatBalances

  const { totalValue, totalCost, pnl, pnlPct, assetsTotal, pricesMissing } =
    usePortfolioTotals(lots, fiatBalances)   // totales siempre sobre todo el portfolio

  const hasPrices = Object.keys(prices).length > 0

  return (
    <>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Cabecera */}
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          {!isLoading && assetsTotal > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {assetsTotal} activo{assetsTotal !== 1 ? 's' : ''}
              {pricesMissing > 0 && (
                <span className="text-accent-amber ml-2">· {pricesMissing} sin precio</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          {/* Buscador */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar activo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-background-card border border-border rounded-xl pl-8 pr-8 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors w-44 uppercase mono"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {!hasPrices && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              <RefreshCw size={12} className="animate-spin" />
              Cargando precios...
            </div>
          )}
        </div>
      </div>

      {/* Totales globales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">

        <MetricCard
          label="Valor actual"
          value={hasPrices ? formatEur(totalValue) : '—'}
          loading={isLoading}
          tooltip={
            <>
              <p>Valoración de mercado de la cartera en tiempo real, calculada multiplicando la cantidad de cada activo por su cotización actual en Binance.</p>
              {pricesMissing > 0
                ? <p className="text-accent-amber/90">⚠ {pricesMissing} activo{pricesMissing > 1 ? 's no tienen' : ' no tiene'} precio configurado y no {pricesMissing > 1 ? 'se incluyen' : 'se incluye'} en este total.</p>
                : <p className="text-gray-500">Los precios se actualizan automáticamente cada 60 s vía WebSocket.</p>
              }
            </>
          }
        />

        <MetricCard
          label="Coste de adquisición"
          value={formatEur(totalCost)}
          loading={isLoading}
          tooltip={
            <>
              <p>Importe total pagado para adquirir los activos que <span className="text-white">aún mantienes en cartera</span>, según el método FIFO (First In, First Out).</p>
              <p>Cada venta reduce este valor en proporción al lote consumido. No refleja lo invertido históricamente, sino únicamente el coste de las posiciones abiertas.</p>
            </>
          }
        />

        <MetricCard
          label="P&L no realizado"
          value={hasPrices ? (pnl >= 0 ? '+' : '') + formatEur(pnl) : '—'}
          positive={hasPrices ? pnl >= 0 : undefined}
          loading={isLoading}
          tooltip={
            <>
              <p>Diferencia entre la valoración actual de la cartera y su coste de adquisición FIFO. Refleja el resultado <span className="text-white">latente</span> de las posiciones abiertas.</p>
              <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
                Valor actual − Coste de adquisición
              </p>
              <p className="text-gray-500">Este beneficio o pérdida no es definitivo hasta que se materialice con una venta. No tiene impacto fiscal hasta entonces.</p>
            </>
          }
        />

        <MetricCard
          label="Rentabilidad"
          value={hasPrices ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
          positive={hasPrices ? pnlPct >= 0 : undefined}
          loading={isLoading}
          tooltip={
            <>
              <p>Rendimiento porcentual de la cartera sobre el capital invertido en las posiciones actuales.</p>
              <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
                (Valor actual − Coste) ÷ Coste × 100
              </p>
              <p className="text-gray-500">No incluye beneficios ya realizados en ventas anteriores.</p>
            </>
          }
        />

        {eurFlow && (
          <MetricCard
            label="EUR neto en cripto"
            value={formatEur(eurFlow.netFromBank)}
            loading={isLoading}
            tooltip={
              <>
                <p>Capital neto comprometido en el mercado cripto: total ingresado al exchange desde tu cuenta bancaria, descontando lo que ya has recuperado.</p>
                <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1.5 text-[10px]">
                  <div className="flex justify-between text-gray-400">
                    <span>Depósitos al exchange</span>
                    <span className="mono text-gray-200">{formatEur(eurFlow.deposited)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Retiradas al banco</span>
                    <span className="mono text-gray-200">− {formatEur(eurFlow.withdrawn)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold">
                    <span className="text-white">Capital neto</span>
                    <span className="mono text-white">{formatEur(eurFlow.netFromBank)}</span>
                  </div>
                </div>
                <p className="text-gray-500">Del total neto, {formatEur(eurFlow.eurSpentBuying)} se han convertido en criptoactivos.</p>
              </>
            }
          />
        )}

      </div>

      {/* Gráfico de distribución — solo con precios disponibles */}
      {hasPrices && !isLoading && lots.length > 0 && (
        <AllocationDonut lots={lots} fiatBalances={fiatBalances} />
      )}

      {/* Secciones por wallet — agrupación dinámica */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Cargando lotes FIFO...
        </div>
      ) : (
        <>
          {lots.length === 0 && fiatBalances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Wallet size={32} className="text-gray-700" />
              <p className="text-gray-500 text-sm">Sin activos en portfolio</p>
              <p className="text-gray-600 text-xs">Importa tu CSV de Binance para empezar</p>
            </div>
          ) : filteredLots.length === 0 && filteredFiats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <Search size={22} className="text-gray-700" />
              <p className="text-gray-500 text-sm">Sin resultados para <span className="mono text-white">"{search}"</span></p>
              <button onClick={() => setSearch('')} className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <WalletSections lots={filteredLots} fiatBalances={filteredFiats} onSimulate={(asset, qty, price) => setSimulator({ asset, qty, price })} />
          )}
        </>
      )}
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
