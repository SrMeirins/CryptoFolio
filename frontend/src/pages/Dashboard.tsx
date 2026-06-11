import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi, FifoLot, FiscalYear, FiatBalance } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { formatEur, pnlColor } from '../utils/format'
import { InfoTooltip } from '../components/InfoTooltip'
import { MetricCard, Change24h } from '../components/MetricCard'
import { OP_META } from '../constants/operations'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

const ALLOC_COLORS = [
  '#6366f1','#F0B90B','#00c896','#e74c3c','#8b5cf6',
  '#3b82f6','#f59e0b','#10b981','#ef4444','#a78bfa',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]
const FIAT_COLOR = '#10b981'

// ── TopMovers ────────────────────────────────────────────────────────────────
interface MoverItem { asset: string; pct: number; value: number; rank: number }

function MoverRow({ asset, pct, value, rank }: MoverItem) {
  const [imgOk, setImgOk] = useState(true)
  const isUp  = pct >= 0
  const color = isUp ? '#00c896' : '#e74c3c'

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:brightness-110"
      style={{ background: `${color}06` }}
    >
      <span className="text-[10px] text-gray-700 w-4 text-center font-mono shrink-0">{rank}</span>
      {imgOk ? (
        <img
          src={`https://assets.coincap.io/assets/icons/${asset.toLowerCase()}@2x.png`}
          alt={asset}
          className="w-8 h-8 rounded-full shrink-0"
          style={{ boxShadow: `0 0 0 2px ${color}30` }}
          onError={() => setImgOk(false)}
        />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: `${color}20`, color, boxShadow: `0 0 0 2px ${color}30` }}
        >
          {asset.slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight" style={{ color }}>{asset}</p>
        <p className="text-[10px] text-gray-600 font-mono leading-tight mt-0.5">{formatEur(value)}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className="text-[13px] font-bold font-mono px-2 py-0.5 rounded-lg"
          style={{ background: `${color}18`, color }}
        >
          {isUp ? '+' : ''}{pct.toFixed(2)}%
        </span>
        <div className="w-16 h-1 rounded-full overflow-hidden bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.abs(pct) * 2, 100)}%`, background: color, opacity: 0.7 }}
          />
        </div>
      </div>
    </div>
  )
}

function TopMovers({ lots }: { lots: FifoLot[] }) {
  const prices = usePricesStore(s => s.prices)

  const { top, bottom } = useMemo(() => {
    const byAsset = new Map<string, { qty: number; cost: number }>()
    for (const lot of lots) {
      const prev = byAsset.get(lot.asset) ?? { qty: 0, cost: 0 }
      byAsset.set(lot.asset, {
        qty:  prev.qty  + parseFloat(lot.quantity),
        cost: prev.cost + parseFloat(lot.cost_basis_eur),
      })
    }

    const items: Omit<MoverItem, 'rank'>[] = []
    for (const [asset, { qty, cost }] of byAsset) {
      const price = prices[asset]
      if (!price || qty < 0.000001 || cost <= 0) continue
      const avg = cost / qty
      items.push({ asset, pct: ((price - avg) / avg) * 100, value: qty * price })
    }

    const sorted = [...items].sort((a, b) => b.pct - a.pct)
    return {
      top:    sorted.slice(0, 3).map((item, i) => ({ ...item, rank: i + 1 })),
      bottom: sorted.length >= 2 ? sorted.slice(-3).reverse().map((item, i) => ({ ...item, rank: i + 1 })) : [],
    }
  }, [lots, prices])

  if (top.length === 0) return null

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-border">
        <div>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-green shrink-0" style={{ boxShadow: '0 0 6px #00c896' }} />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-green/80">Mejores</span>
          </div>
          <div className="divide-y divide-border/30">
            {top.map(item => <MoverRow key={item.asset} {...item} />)}
          </div>
        </div>
        <div>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-red shrink-0" style={{ boxShadow: '0 0 6px #e74c3c' }} />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-accent-red/80">Peores</span>
          </div>
          <div className="divide-y divide-border/30">
            {bottom.map(item => <MoverRow key={item.asset} {...item} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Actividad reciente ───────────────────────────────────────────────────────
function relativeDate(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'ahora mismo'
  if (mins  < 60)  return `hace ${mins} min`
  if (hours < 24)  return `hace ${hours} h`
  if (days  < 7)   return `hace ${days} día${days > 1 ? 's' : ''}`
  return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function fmtAmount(n: string | null): string {
  if (!n) return '—'
  const v = parseFloat(n)
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (Math.abs(v) >= 1)    return v.toFixed(4)
  return v.toFixed(6)
}

function RecentActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: () => portfolioApi.getTransactions({ limit: '8', offset: '0' }),
    refetchInterval: 60_000,
  })

  const txs = data?.transactions ?? []

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold">Actividad reciente</h3>
        <Link to="/history" className="text-xs text-accent-blue hover:underline">Ver todo →</Link>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border/40">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-16 h-6 skeleton rounded-lg" />
              <div className="flex-1 h-4 skeleton rounded" />
              <div className="w-16 h-4 skeleton rounded" />
            </div>
          ))}
        </div>
      ) : txs.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-600">
          Sin transacciones aún
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {txs.map(tx => {
            const meta = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: '#6b7280', rowBg: 'transparent' }
            const isIncome = ['STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','CASHBACK','AIRDROP','FORK'].includes(tx.operation_type)
            const isSell   = ['SELL','SELL_FIAT','SELL_CRYPTO'].includes(tx.operation_type)
            const isBuy    = ['BUY','BUY_FIAT','BUY_CRYPTO'].includes(tx.operation_type)
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 px-5 py-3 transition-all hover:brightness-105"
                style={{ background: meta.rowBg }}
              >
                {/* Badge operación */}
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 min-w-[76px] text-center border"
                  style={{
                    backgroundColor: `${meta.color}15`,
                    color: meta.color,
                    borderColor: `${meta.color}30`,
                  }}
                >
                  {meta.label}
                </span>

                {/* Activo + wallet */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{tx.asset}</span>
                    {tx.wallet_name && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0"
                        style={{ backgroundColor: `${tx.wallet_color}18`, color: tx.wallet_color }}
                      >
                        {tx.wallet_name}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs font-mono mt-0.5 ${
                    isBuy ? 'text-accent-green/80' : isSell ? 'text-accent-red/80' : isIncome ? 'text-violet-400/80' : 'text-gray-500'
                  }`}>
                    {isBuy ? '+' : isSell ? '−' : ''}{fmtAmount(tx.amount)}
                  </p>
                </div>

                {/* Fecha */}
                <span className="text-[11px] text-gray-600 shrink-0 tabular-nums">{relativeDate(tx.timestamp)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── PortfolioHistoryChart ────────────────────────────────────────────────────
const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1A' },
  { key: 'all', label: 'Todo' },
]

function fmtChartDate(dateStr: string, period: string): string {
  const d = new Date(dateStr)
  if (period === '1m')  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  if (period === '3m')  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

function PortfolioHistoryChart({ currentValue }: { currentValue?: number }) {
  const [period, setPeriod] = useState('1y')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['portfolio-history', period],
    queryFn: () => portfolioApi.getPortfolioHistory(period),
    staleTime: 5 * 60_000,
    // Solo reintenta si hay pocos puntos (primera carga sin caché)
    refetchInterval: (query) => {
      const d = query.state.data as { points: {date:string;value:number}[]; refreshing: boolean } | undefined
      return (d?.refreshing && (d?.points?.length ?? 0) < 5) ? 30_000 : false
    },
  })

  const points = data?.points ?? []

  const { minVal, maxVal, eurChange, isPositive } = useMemo(() => {
    if (points.length < 2) return { minVal: 0, maxVal: 0, eurChange: 0, isPositive: true }
    const last = currentValue ?? points[points.length - 1].value
    const vals = [...points.map(p => p.value)]
    if (currentValue != null) vals[vals.length - 1] = currentValue
    const minVal    = Math.min(...vals)
    const maxVal    = Math.max(...vals)
    const first     = points[0].value
    const eurChange = last - first
    return { minVal, maxVal, eurChange, isPositive: eurChange >= 0 }
  }, [points, currentValue])

  const color = isPositive ? '#00c896' : '#e74c3c'

  const today = new Date().toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  const chartData = points.map((p, i) => ({
    date: i === points.length - 1 ? today : fmtChartDate(p.date, period),
    value: i === points.length - 1 && currentValue != null ? currentValue : p.value,
  }))

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] text-gray-600 font-medium uppercase tracking-widest">Evolución del portfolio</h3>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
                period === p.key
                  ? 'bg-white/10 text-white'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Variación del periodo + estado de actualización */}
      <div className="flex items-center gap-3 mb-4">
        {points.length >= 2 && (
          <p className={`text-xs font-mono ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
            {isPositive ? '▲' : '▼'} {eurChange >= 0 ? '+' : ''}{formatEur(eurChange)} en el periodo
          </p>
        )}
        {data?.refreshing && !isLoading && points.length < 5 && (
          <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <span className="w-2.5 h-2.5 border border-gray-600 border-t-gray-400 rounded-full animate-spin" />
            Cargando histórico…
          </span>
        )}
      </div>

      {/* Gráfico */}
      <div className="h-52 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
              <span className="text-xs text-gray-600">Cargando…</span>
            </div>
          </div>
        )}

        {!isLoading && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-gray-600">Sin datos para este periodo</p>
          </div>
        )}

        {points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#4b5563' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minVal * 0.97, maxVal * 1.02]}
                tick={{ fontSize: 10, fill: '#4b5563' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatEur(v)}
                width={72}
              />
              <RechartsTooltip
                contentStyle={{
                  background: '#0f1117',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                formatter={(v: number) => [formatEur(v), 'Valor']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill="url(#histGradient)"
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── AllocationChart ──────────────────────────────────────────────────────────
function AllocationChart({ lots, fiatBalances }: { lots: FifoLot[]; fiatBalances: FiatBalance[] }) {
  const prices  = usePricesStore((s) => s.prices)
  const [hovered, setHovered] = useState<string | null>(null)

  const data = useMemo(() => {
    const fiatByAsset = fiatBalances.reduce((acc, b) => {
      acc[b.asset] = (acc[b.asset] ?? 0) + parseFloat(b.balance)
      return acc
    }, {} as Record<string, number>)

    const cryptoMap = new Map<string, number>()
    for (const lot of lots) {
      const val = parseFloat(lot.quantity) * (prices[lot.asset] ?? 0)
      if (val > 0) cryptoMap.set(lot.asset, (cryptoMap.get(lot.asset) ?? 0) + val)
    }

    const items = [
      ...Array.from(cryptoMap.entries()).map(([name, value]) => ({ name, value, isFiat: false })),
      ...Object.entries(fiatByAsset).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, isFiat: true })),
    ].sort((a, b) => b.value - a.value)

    const total = items.reduce((s, d) => s + d.value, 0)
    return { items, total }
  }, [lots, fiatBalances, prices])

  const { items, total } = data
  const top = items.slice(0, 10)

  if (total === 0) return null

  const hasHover = hovered !== null

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5">
      <h3 className="text-[11px] text-gray-600 font-medium uppercase tracking-widest mb-4">Distribución</h3>

      {/* Barra apilada interactiva */}
      <div className="flex h-5 rounded-xl overflow-hidden gap-px mb-2">
        {top.map((d, i) => {
          const color   = d.isFiat ? FIAT_COLOR : ALLOC_COLORS[i % ALLOC_COLORS.length]
          const isHover = hovered === d.name
          const dimmed  = hasHover && !isHover
          return (
            <div
              key={d.name}
              className="transition-all duration-150 cursor-pointer"
              style={{
                width: `${(d.value / total) * 100}%`,
                background: color,
                minWidth: '4px',
                opacity: dimmed ? 0.2 : 1,
                filter: isHover ? `brightness(1.25) drop-shadow(0 0 5px ${color}88)` : 'none',
              }}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}
        {items.length > 10 && (
          <div className="flex-1 bg-white/5" style={{ minWidth: '2px' }} />
        )}
      </div>

      {/* Panel de detalle en hover — altura fija para evitar saltos */}
      <div className="h-10 mb-3 flex items-center">
        {hovered && (() => {
          const idx  = top.findIndex(d => d.name === hovered)
          const item = top[idx]
          if (!item) return null
          const color = item.isFiat ? FIAT_COLOR : ALLOC_COLORS[idx % ALLOC_COLORS.length]
          const pct   = (item.value / total) * 100
          return (
            <div
              className="w-full px-4 py-2 rounded-xl border flex items-center justify-between transition-all duration-150"
              style={{ borderColor: `${color}40`, background: `${color}0d` }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-sm font-semibold" style={{ color }}>{item.name}</span>
                {item.isFiat && <span className="text-[10px] text-gray-500">cash</span>}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500 font-mono">{pct.toFixed(2)}%</span>
                <span className="text-sm font-semibold font-mono text-white">{formatEur(item.value)}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Lista ranked */}
      <div className="space-y-1.5">
        {top.map((d, i) => {
          const pct     = (d.value / total) * 100
          const color   = d.isFiat ? FIAT_COLOR : ALLOC_COLORS[i % ALLOC_COLORS.length]
          const isHover = hovered === d.name
          const dimmed  = hasHover && !isHover
          return (
            <div
              key={d.name}
              className="flex items-center gap-3 px-2 py-1.5 rounded-lg transition-all duration-150 cursor-default"
              style={{
                background: isHover ? `${color}12` : 'transparent',
                opacity: dimmed ? 0.35 : 1,
              }}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="text-[10px] text-gray-700 w-3 text-right shrink-0">{i + 1}</span>
              <div className="flex items-center gap-1.5 w-16 shrink-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs font-medium truncate" style={{ color: isHover ? color : (d.isFiat ? color : 'rgb(209 213 219)') }}>
                  {d.name}
                </span>
              </div>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: color, opacity: isHover ? 1 : 0.5 }}
                />
              </div>
              <span className="text-[11px] text-gray-500 font-mono w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
              <span className="text-[11px] text-gray-400 font-mono w-20 text-right shrink-0">{formatEur(d.value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── FiscalCard ───────────────────────────────────────────────────────────────
function FiscalCard({ data }: { data: FiscalYear[] }) {
  const currentYear = new Date().getFullYear()
  const current = data.find((d) => d.fiscal_year === currentYear) ?? data[data.length - 1]
  if (!current) return null

  const gainLoss = parseFloat(current.total_gain_loss_eur)
  const gains    = parseFloat(current.total_gains_eur)
  const losses   = parseFloat(current.total_losses_eur)
  const ops      = parseInt(current.num_operations as unknown as string, 10)
  const isPos    = gainLoss >= 0
  const accentColor = isPos ? '#10b981' : '#ef4444'

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-widest text-gray-600 uppercase">Fiscal</span>
          <span className="text-[11px] font-bold text-white bg-white/6 border border-white/10 px-2 py-0.5 rounded-md">
            {current.fiscal_year}
          </span>
        </div>
        <Link to="/fiscal" className="text-xs text-accent-blue hover:underline">Detalle →</Link>
      </div>

      {/* Métrica principal — centrada */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-5 gap-1">
        <p className="text-[10px] text-gray-600 font-medium uppercase tracking-widest">G/P neto realizado</p>
        <p className={`font-['JetBrains_Mono',monospace] text-[1.7rem] font-bold tracking-tight leading-none ${isPos ? 'text-accent-green' : 'text-accent-red'}`}>
          {isPos ? '+' : ''}{formatEur(gainLoss)}
        </p>
        <div
          className="mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ background: `${accentColor}15`, color: accentColor }}
        >
          {ops} operacion{ops !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Desglose */}
      <div className="mx-3 mb-3 rounded-xl bg-white/[0.03] border border-white/5 divide-y divide-white/5">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-gray-500">Ganancias</span>
          <span className="font-['JetBrains_Mono',monospace] text-[11px] font-semibold text-accent-green">+{formatEur(gains)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-gray-500">Pérdidas</span>
          <span className="font-['JetBrains_Mono',monospace] text-[11px] font-semibold text-accent-red">{formatEur(losses)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export function Dashboard() {
  const prices = usePricesStore((s) => s.prices)
  const connected = usePricesStore((s) => s.connected)
  const lastUpdate = usePricesStore((s) => s.lastUpdate)

  const { data: lots = [], isLoading: lotsLoading } = useQuery({
    queryKey: ['fifo-lots'],
    queryFn: portfolioApi.getLots,
    refetchInterval: 60_000,
  })

  const { data: fiscal = [] } = useQuery({
    queryKey: ['fiscal-summary'],
    queryFn: portfolioApi.getFiscalSummary,
  })

  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
    refetchInterval: 60_000,
  })

  const { data: eurFlow } = useQuery({
    queryKey: ['eur-flow'],
    queryFn: portfolioApi.getEurFlow,
  })

  const { data: ydayData, isLoading: ydayLoading } = useQuery({
    queryKey: ['yesterday-prices'],
    queryFn: portfolioApi.getYesterdayPrices,
    staleTime: 10 * 60_000,
  })

  const totalFiat = fiatBalances.reduce((s, b) => s + parseFloat(b.balance), 0)

  const cryptoValue = lots.reduce((sum, lot) => {
    const price = prices[lot.asset] ?? 0
    return sum + parseFloat(lot.quantity) * price
  }, 0)
  const totalValue = cryptoValue + totalFiat
  const hasPrices = Object.keys(prices).length > 0

  const totalCost = lots.reduce((sum, lot) => sum + parseFloat(lot.cost_basis_eur), 0)
  const totalPnl = cryptoValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const change24h = useMemo((): Change24h | null => {
    if (!ydayData?.prices || !lots.length || !hasPrices) return null
    const yday = ydayData.prices
    let todayCovered = 0, ydayCovered = 0
    for (const lot of lots) {
      const qty      = parseFloat(lot.quantity)
      const today    = prices[lot.asset]
      const yesterday = yday[lot.asset]
      if (!today || !yesterday) continue
      todayCovered += qty * today
      ydayCovered  += qty * yesterday
    }
    if (cryptoValue > 0 && todayCovered / cryptoValue < 0.8) return null
    const total24hToday = todayCovered + totalFiat
    const total24hYday  = ydayCovered  + totalFiat
    const delta    = total24hToday - total24hYday
    const deltaPct = total24hYday > 0 ? (delta / total24hYday) * 100 : 0
    return {
      eur:      (delta >= 0 ? '+' : '') + formatEur(delta),
      pct:      (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(2) + '%',
      positive: delta >= 0,
    }
  }, [ydayData, lots, prices, cryptoValue, totalFiat, hasPrices])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString('es-ES')}` : 'Cargando precios...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-green animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-500">{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Valor actual"
          value={hasPrices ? formatEur(totalValue) : '—'}
          rawValue={hasPrices ? totalValue : undefined}
          format={formatEur}
          loading={lotsLoading}
          change24h={hasPrices ? change24h : null}
          change24hLoading={ydayLoading}
          tooltip={
            <>
              <p>Valoración total de la cartera a precio de mercado en tiempo real: cripto + saldos en efectivo.</p>
              <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1.5 text-[10px]">
                <div className="flex justify-between text-gray-400">
                  <span>Cripto</span>
                  <span className="mono text-gray-200">{formatEur(cryptoValue)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Cash / Fiat</span>
                  <span className="mono text-gray-200">{formatEur(totalFiat)}</span>
                </div>
              </div>
            </>
          }
        />

        <MetricCard
          label="Coste de adquisición"
          value={formatEur(totalCost)}
          rawValue={totalCost}
          format={formatEur}
          loading={lotsLoading}
          tooltip={
            <>
              <p>Importe total pagado para adquirir los activos que <span className="text-white">aún mantienes en cartera</span>, según el método FIFO.</p>
              <p>Cada venta reduce este valor en proporción al lote consumido.</p>
            </>
          }
        />

        <MetricCard
          label="P&L no realizado"
          value={hasPrices ? (totalPnl >= 0 ? '+' : '') + formatEur(totalPnl) : '—'}
          rawValue={hasPrices ? totalPnl : undefined}
          format={v => (v >= 0 ? '+' : '') + formatEur(v)}
          positive={hasPrices ? totalPnl >= 0 : undefined}
          loading={lotsLoading}
          tooltip={
            <>
              <p>Diferencia entre la valoración actual y el coste FIFO de las posiciones abiertas.</p>
              <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
                Valor actual − Coste de adquisición
              </p>
              <p className="text-gray-500">No tiene impacto fiscal hasta que se materialice con una venta.</p>
            </>
          }
        />

        <MetricCard
          label="Rentabilidad"
          value={hasPrices ? (totalPnlPct >= 0 ? '+' : '') + totalPnlPct.toFixed(2) + '%' : '—'}
          rawValue={hasPrices ? totalPnlPct : undefined}
          format={v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'}
          positive={hasPrices ? totalPnlPct >= 0 : undefined}
          loading={lotsLoading}
          tooltip={
            <>
              <p>Rendimiento porcentual sobre el capital invertido en las posiciones actuales.</p>
              <p className="font-mono text-[10px] bg-white/5 px-2.5 py-1.5 rounded-lg text-gray-400">
                (Valor − Coste) ÷ Coste × 100
              </p>
            </>
          }
        />

        {eurFlow && (
          <MetricCard
            label="EUR neto en cripto"
            value={formatEur(eurFlow.netFromBank)}
            rawValue={eurFlow.netFromBank}
            format={formatEur}
            loading={lotsLoading}
            tooltip={
              <>
                <p>Capital real comprometido en cripto: euros ingresados al exchange desde tu banco, menos lo retirado.</p>
                <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1.5 text-[10px]">
                  <div className="flex justify-between text-gray-400">
                    <span>Depósitos al exchange</span>
                    <span className="mono text-gray-200">{formatEur(eurFlow.deposited)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Retiradas al banco</span>
                    <span className="mono text-gray-200">− {formatEur(eurFlow.withdrawn)}</span>
                  </div>
                </div>
              </>
            }
          />
        )}
      </div>

      {/* Top movers */}
      <TopMovers lots={lots} />

      {/* Gráfico histórico */}
      <PortfolioHistoryChart currentValue={hasPrices ? cryptoValue : undefined} />

      {/* Distribución + Fiscal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AllocationChart lots={lots} fiatBalances={fiatBalances} />
        </div>
        <FiscalCard data={fiscal} />
      </div>

      {/* Actividad reciente */}
      <RecentActivity />

    </div>
  )
}
