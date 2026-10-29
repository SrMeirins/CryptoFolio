import { Hourglass, Layers, Lock } from 'lucide-react'
import { StatCard } from '../../components/ui'
import { formatMoney, formatPercent } from '../../utils/format'
import { T } from '../../utils/colors'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import type { Inventory } from '../../utils/portfolioInventory'
import { daysSince, formatAge, formatLotDate } from '../../utils/portfolioLots'

// Franja de inventario de Portfolio (#270) con StatCard (#417): custodia,
// posiciones y bloqueado (o antigüedad media). Solo la cifra; importes, mayor
// peso y fecha media van en la ayuda.

/** Mini anillo de custodia (#283): autocustodia en color de marca y exchanges en ámbar; decorativo. */
export function CustodyRing({ selfPct }: { selfPct: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const self = (Math.min(100, Math.max(0, selfPct)) / 100) * c
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="4" className="stroke-warning/80" />
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="4" className="stroke-brand transition-[stroke-dasharray] duration-500"
        strokeDasharray={`${self} ${c}`} strokeLinecap={self > 0 && self < c ? 'round' : 'butt'} />
    </svg>
  )
}

export function InventoryStrip({ inventory }: { inventory: Inventory }) {
  const currency = useCurrency()
  const { custody, positions, locked, avgOpenedAt } = inventory
  const selfPct = 100 - custody.exchangePct
  const ageDays = daysSince(avgOpenedAt)
  const money = (v: number) => formatMoney(v, currency)
  const legend = 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5'
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
      <StatCard title="Autocustodia" visual={<CustodyRing selfPct={selfPct} />} color={T.brand}
        value={selfPct} format={v => formatPercent(v, 0)}
        helpLabel="Qué mide Autocustodia"
        help={<>
          <p>Qué parte de la cartera está en autocustodia (hardware o software) y qué parte en exchanges (custodia de terceros).</p>
          <dl className={legend}>
            <dt className="text-fg-muted">Autocustodia</dt><dd className="mono text-right">{money(custody.self)}</dd>
            <dt className="text-fg-muted">En exchanges</dt><dd className="mono text-right">{money(custody.exchange)} · {formatPercent(custody.exchangePct, 0)}</dd>
          </dl>
          <p className="text-fg-subtle">Solo la custodia de terceros computa para el Modelo 721.</p>
        </>} />

      <StatCard title="Posiciones" icon={Layers} color={T.info} delay={60}
        value={positions.assets} format={v => String(Math.round(v))}
        helpLabel="Qué mide Posiciones"
        help={<>
          <p>{positions.assets} {positions.assets === 1 ? 'activo distinto' : 'activos distintos'} en {positions.wallets} {positions.wallets === 1 ? 'wallet' : 'wallets'}.</p>
          <p>{positions.top
            ? <>Mayor peso: <span className="mono text-fg">{positions.top.asset}</span>, el <span className="mono">{formatPercent(positions.top.pct, 1)}</span> del total{positions.top.pct >= 50 ? ': cartera muy concentrada' : ''}.</>
            : 'Sin precios para calcular la concentración.'}</p>
        </>} />

      {/* Sin nada bloqueado, la tercera tarjeta muestra la antigüedad media (#283) */}
      {locked.assets > 0 || ageDays === null ? (
        <StatCard title="Bloqueado" icon={Lock} color={T.warning} delay={120}
          value={locked.value} format={money}
          helpLabel="Qué mide Bloqueado"
          help={<>
            <p>Valor en staking o launchpool al precio actual: forma parte de la cartera, pero no está disponible para vender hasta desbloquearlo.</p>
            <p>{locked.assets > 0 ? `${locked.assets} ${locked.assets === 1 ? 'activo bloqueado' : 'activos bloqueados'}.` : 'Nada bloqueado.'}</p>
          </>} />
      ) : (
        <StatCard title="Antigüedad media" icon={Hourglass} color={T.purple} delay={120}
          value={formatAge(ageDays)}
          helpLabel="Qué mide Antigüedad media"
          help={<>
            <p>Fecha media de compra de las posiciones abiertas, ponderada por lo que costó cada lote: pesa más lo que más dinero tienes invertido.</p>
            <p>Fecha media: <span className="mono text-fg">{formatLotDate(new Date(avgOpenedAt!).toISOString())}</span>.</p>
          </>} />
      )}
    </div>
  )
}
