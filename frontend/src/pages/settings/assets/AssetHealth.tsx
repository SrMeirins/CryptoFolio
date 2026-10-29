import { RefreshCw } from 'lucide-react'
import { buttonClasses } from '../../../components/ui'
import { formatAge, daysSince } from '../../../utils/portfolioLots'
import type { PriceHealth } from './assetRows'

// Salud de los precios (#450): cuántos activos tienen precio en vivo, de
// CoinGecko, del respaldo o ninguno, el último fallo y un botón de reintentar.

const SOURCE: Record<string, string> = { coingecko: 'CoinGecko', coinpaprika: 'el respaldo', okx: 'el respaldo' }
const REASON: Record<string, string> = { 'sin-precio': 'sin precio', 'sin-respuesta': 'sin respuesta' }

function when(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (ms < 60_000) return 'hace un momento'
  if (ms < 3_600_000) return `hace ${Math.round(ms / 60_000)} min`
  if (ms < 86_400_000) return `hace ${Math.round(ms / 3_600_000)} h`
  return formatAge(daysSince(Date.parse(iso)) ?? 0).toLowerCase()
}

export function AssetHealth({ health, retrying, onRetry }: { health: PriceHealth; retrying: boolean; onRetry: () => void }) {
  const { counts, lastFailure } = health
  const items: Array<[string, number, string]> = [
    ['En vivo', counts.binance, 'bg-positive/10 text-positive-ink'],
    ['CoinGecko', counts.coingecko, 'bg-accent-purple/10 text-accent-purple'],
    ['Respaldo', counts.respaldo, 'bg-warning/10 text-warning-ink'],
    ['Sin precio', counts['sin-precio'], counts['sin-precio'] > 0 ? 'bg-negative/10 text-negative-ink' : 'bg-overlay/8 text-fg-subtle'],
  ]
  return (
    <section aria-label="Salud de los precios" className="flex items-center gap-x-4 gap-y-2 flex-wrap rounded-xl border border-border bg-overlay/2 px-4 py-3">
      <dl className="flex items-center gap-2 flex-wrap">
        {items.map(([label, n, tone]) => (
          <div key={label} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${tone}`}>
            <dt>{label}</dt><dd className="mono font-semibold">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fg-subtle flex-1 min-w-48">
        {lastFailure
          ? <>Último fallo: <span className="mono text-fg-muted">{lastFailure.symbol}</span> {REASON[lastFailure.reason] ?? 'sin precio'} en {SOURCE[lastFailure.source] ?? lastFailure.source}, {when(lastFailure.at)}.</>
          : 'Sin fallos de precio desde que arrancó la app.'}
      </p>
      <button type="button" onClick={onRetry} disabled={retrying} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
        <RefreshCw size={12} aria-hidden="true" className={retrying ? 'animate-spin' : ''} /> Reintentar precios
      </button>
    </section>
  )
}
