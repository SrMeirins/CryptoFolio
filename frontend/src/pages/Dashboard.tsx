import { useQuery } from '@tanstack/react-query'
import { portfolioApi, FifoLot, FiscalYear, FiatBalance } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { StatCard } from '../components/StatCard'
import { AssetTable } from '../components/AssetTable'
import { formatEur, pnlColor } from '../utils/format'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#a855f7']

function PortfolioDonut({ lots, prices, fiatBalances }: { lots: FifoLot[]; prices: Record<string, number>; fiatBalances: FiatBalance[] }) {
  const fiatByAsset = fiatBalances.reduce((acc, b) => {
    acc[b.asset] = (acc[b.asset] ?? 0) + parseFloat(b.balance)
    return acc
  }, {} as Record<string, number>)

  const cryptoData = lots
    .map((l) => ({
      name: l.asset,
      value: parseFloat(l.quantity) * (prices[l.asset] ?? 0),
    }))
    .filter((d) => d.value > 0)

  const fiatData = Object.entries(fiatByAsset)
    .filter(([, v]) => v > 0)
    .map(([asset, value]) => ({ name: asset, value, isFiat: true }))

  const data = [...cryptoData, ...fiatData].sort((a, b) => b.value - a.value)

  const total = data.reduce((s, d) => s + d.value, 0)

  const FIAT_COLOR = '#10b981'

  return (
    <div className="card">
      <h3 className="font-medium text-sm mb-4">Distribución del portfolio</h3>
      <div className="flex gap-4 items-center">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => (
                <Cell key={i} fill={(entry as { isFiat?: boolean }).isFiat ? FIAT_COLOR : COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 8 }}
              formatter={(v: number) => [formatEur(v), '']}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {data.slice(0, 8).map((d, i) => {
            const isFiat = (d as { isFiat?: boolean }).isFiat
            return (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: isFiat ? FIAT_COLOR : COLORS[i % COLORS.length] }} />
                  <span className={isFiat ? 'text-emerald-400' : 'text-gray-300'}>{d.name}</span>
                  {isFiat && <span className="text-emerald-600 text-[10px]">cash</span>}
                </div>
                <div className="text-right">
                  <span className="mono text-gray-400">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            )
          })}
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

  const { data: fiatBalances = [] } = useQuery({
    queryKey: ['fiat-balances'],
    queryFn: portfolioApi.getFiatBalances,
    refetchInterval: 60_000,
  })

  const totalFiat = fiatBalances.reduce((s, b) => s + parseFloat(b.balance), 0)
  const fiatByWalletKind = fiatBalances.reduce((acc, b) => {
    acc[b.wallet_kind] = (acc[b.wallet_kind] ?? 0) + parseFloat(b.balance)
    return acc
  }, {} as Record<string, number>)

  const cryptoValue = lots.reduce((sum, lot) => {
    const price = prices[lot.asset] ?? 0
    return sum + parseFloat(lot.quantity) * price
  }, 0)
  const totalValue = cryptoValue + totalFiat

  const totalCost = lots.reduce((sum, lot) => sum + parseFloat(lot.cost_basis_eur), 0)
  const totalPnl = cryptoValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const binanceLots = lots.filter((l) => l.wallet_kind === 'exchange')
  const tangemLots = lots.filter((l) => l.wallet_kind !== 'exchange')
  const binanceCrypto = binanceLots.reduce((s, l) => s + parseFloat(l.quantity) * (prices[l.asset] ?? 0), 0)
  const binanceValue = binanceCrypto + (fiatByWalletKind['exchange'] ?? 0)
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
          sub={`Cripto: ${formatEur(cryptoValue)} · Cash: ${formatEur(totalFiat)}`}
          trend={totalPnl >= 0 ? 'up' : 'down'}
          large
        />
        <StatCard
          label="P&L cripto"
          value={(totalPnl >= 0 ? '+' : '') + formatEur(totalPnl)}
          sub={(totalPnlPct >= 0 ? '+' : '') + totalPnlPct.toFixed(2) + '%'}
          trend={totalPnl >= 0 ? 'up' : 'down'}
        />
        <StatCard
          label="Binance"
          value={formatEur(binanceValue)}
          sub={`${binanceLots.length} activos${(fiatByWalletKind['exchange'] ?? 0) > 0 ? ` · ${formatEur(fiatByWalletKind['exchange'] ?? 0)} cash` : ''}`}
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
          <PortfolioDonut lots={lots} prices={prices} fiatBalances={fiatBalances} />
        </div>
        <FiscalCard data={fiscal} />
      </div>

      {/* Tabla de activos */}
      <AssetTable lots={lots} fiatBalances={fiatBalances} />
    </div>
  )
}
