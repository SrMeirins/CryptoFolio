interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
  large?: boolean
}

export function StatCard({ label, value, sub, trend, large }: StatCardProps) {
  const trendColor =
    trend === 'up' ? 'text-accent-green' :
    trend === 'down' ? 'text-accent-red' : 'text-gray-400'

  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`mono font-semibold ${large ? 'text-3xl' : 'text-xl'} ${trendColor}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}
