import { useQuery } from '@tanstack/react-query'
import { portfolioApi, FifoLot, FiscalYear } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { StatCard } from '../components/StatCard'
import { AssetTable } from '../components/AssetTable'
import { formatEur, pnlColor } from '../utils/format'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#a855f7']

function PortfolioDonut({ lots, prices }: { lots: FifoLot[]; prices: Record<string, number> }) {
  const data = lots
    .map((l) => ({
      name: l.asset,
      value: parseFloat(l.quantity) * (prices[l.asset] ?? 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="card">
      <h3 className="font-medium text-sm mb-4">Distribución del portfolio</h3>
      <div className="flex gap-4 items-center">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 8 }}
              formatter={(v: number) => [formatEur(v), '']}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {data.slice(0, 8).map((d, i) => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-gray-300">{d.name}</span>
              </div>
              <div className="text-right">
                <span className="mono text-gray-400">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FiscalCard({ data }: { data: FiscalYear[] }) {
  const currentYear = new Date().getFullYear()
  const current = data.find((d) => d.fiscal_year === currentYear) ?? data[data.length - 1]
  if (!current) return null

  const gainLoss = parseFloat(current.total_gain_loss_eur)

  return (
    <div className="card">
      <h3 className="font-medium text-sm mb-3">Fiscal {current.fiscal_year}</h3>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">G/P neto</span>
          <span className={`mono font-semibold ${pnlColor(gainLoss)}`}>
            {gainLoss >= 0 ? '+' : ''}{formatEur(gainLoss)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Ganancias</span>
          <span className="mono text-accent-green">+{formatEur(parseFloat(current.total_gains_eur))}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Pérdidas</span>
          <span className="mono text-accent-red">{formatEur(parseFloat(current.total_losses_eur))}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Operaciones</span>
          <span className="mono text-gray-300">{current.num_operations}</span>
        </div>
      </div>
    </div>
  )
}

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

  const totalValue = lots.reduce((sum, lot) => {
    const price = prices[lot.asset] ?? 0
    return sum + parseFloat(lot.quantity) * price
  }, 0)

  const totalCost = lots.reduce((sum, lot) => sum + parseFloat(lot.cost_basis_eur), 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const binanceLots = lots.filter((l) => l.wallet_kind === 'exchange')
  const tangemLots = lots.filter((l) => l.wallet_kind !== 'exchange')
  const binanceValue = binanceLots.reduce((s, l) => s + parseFloat(l.quantity) * (prices[l.asset] ?? 0), 0)
  const tangemValue = tangemLots.reduce((s, l) => s + parseFloat(l.quantity) * (prices[l.asset] ?? 0), 0)

  if (lotsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Cargando portfolio...</div>
      </div>
    )
  }

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

      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Valor total"
          value={formatEur(totalValue)}
          sub={`Coste: ${formatEur(totalCost)}`}
          trend={totalPnl >= 0 ? 'up' : 'down'}
          large
        />
        <StatCard
          label="P&L total"
          value={(totalPnl >= 0 ? '+' : '') + formatEur(totalPnl)}
          sub={(totalPnlPct >= 0 ? '+' : '') + totalPnlPct.toFixed(2) + '%'}
          trend={totalPnl >= 0 ? 'up' : 'down'}
        />
        <StatCard
          label="Binance"
          value={formatEur(binanceValue)}
          sub={`${binanceLots.length} activos`}
          trend="neutral"
        />
        <StatCard
          label="Tangem"
          value={formatEur(tangemValue)}
          sub={`${tangemLots.length} activos`}
          trend="neutral"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PortfolioDonut lots={lots} prices={prices} />
        </div>
        <FiscalCard data={fiscal} />
      </div>

      {/* Tabla de activos */}
      <AssetTable lots={lots} />
    </div>
  )
}
