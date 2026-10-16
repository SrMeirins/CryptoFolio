import type { ReactNode } from 'react'
import { Hourglass, Layers, Lock, ShieldCheck } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { cardClasses, panelClasses, panelEnterStyle } from '../../components/ui'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import type { Inventory } from '../../utils/portfolioInventory'
import { daysSince, formatAge, formatLotDate } from '../../utils/portfolioLots'

// Franja de inventario de Portfolio (#270): custodia, posiciones y bloqueado.
// Sustituye al anillo de distribución, que duplicaba el panel del Dashboard.

function Tile({ icon, label, help, children, index }: { icon: ReactNode; label: string; help: ReactNode; children: ReactNode; index: number }) {
  return (
    <div className={panelClasses(cardClasses('none', 'relative flex gap-3 px-4 py-3.5 min-w-0'))} style={panelEnterStyle(index)}>
      {/* Icono con degradado de marca (#283) */}
      <span className="size-10 rounded-xl grid place-items-center shrink-0 text-brand bg-linear-to-br from-brand/25 to-accent-purple/5 ring-1 ring-brand/15" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle leading-none">
          {label}
          <InfoTooltip label={label}>{help}</InfoTooltip>
        </span>
        {children}
      </div>
    </div>
  )
}

/** Mini anillo de custodia (#283): autocustodia en color de marca y exchanges en ámbar. */
function CustodyRing({ selfPct }: { selfPct: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const self = (Math.min(100, Math.max(0, selfPct)) / 100) * c
  return (
    <svg viewBox="0 0 40 40" className="size-11 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-warning/80" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-brand transition-[stroke-dasharray] duration-500"
        strokeDasharray={`${self} ${c}`} strokeLinecap={self > 0 && self < c ? 'round' : 'butt'} />
    </svg>
  )
}


export function InventoryStrip({ inventory }: { inventory: Inventory }) {
  const currency = useCurrency()
  const { custody, positions, locked, avgOpenedAt } = inventory
  const selfPct = 100 - custody.exchangePct
  const ageDays = daysSince(avgOpenedAt)
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
      <Tile index={0} icon={<ShieldCheck size={17} strokeWidth={2.2} />} label="Custodia"
        help={<>
          <p>Qué parte de la cartera está en exchanges (custodia de terceros) y qué parte en autocustodia (hardware o software).</p>
          <p className="mt-1.5 text-fg-subtle">Solo la custodia de terceros computa para el Modelo 721.</p>
        </>}>
        <div className="flex items-center gap-3" role="img"
          aria-label={`${formatPercent(selfPct, 0)} en autocustodia y ${formatPercent(custody.exchangePct, 0)} en exchanges`}>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="mono tabular-nums text-xl font-semibold text-fg leading-tight">
              {formatPercent(selfPct, 0)} <span className="text-xs font-normal font-sans text-fg-subtle">en autocustodia</span>
            </p>
            <p className="text-[11px] text-fg-subtle mono tabular-nums truncate">
              <span className="text-brand">●</span> {formatMoney(custody.self, currency)} · <span className="text-warning">●</span> {formatMoney(custody.exchange, currency)} en exchanges
            </p>
          </div>
          <CustodyRing selfPct={selfPct} />
        </div>
      </Tile>

      <Tile index={1} icon={<Layers size={17} strokeWidth={2.2} />} label="Posiciones"
        help={<p>Activos distintos en cartera, wallets donde están y concentración: el peso del activo más grande sobre el total.</p>}>
        <p className="mono tabular-nums text-xl font-semibold text-fg leading-tight">
          {positions.assets} <span className="text-xs font-normal text-fg-subtle">{positions.assets === 1 ? 'activo' : 'activos'} en</span> {positions.wallets} <span className="text-xs font-normal text-fg-subtle">{positions.wallets === 1 ? 'wallet' : 'wallets'}</span>
        </p>
        <p className="text-[11px] text-fg-subtle">
          {positions.top
            ? <>Mayor peso: <span className="mono text-fg">{positions.top.asset}</span> <span className={`mono ${positions.top.pct >= 50 ? 'text-warning' : 'text-fg-muted'}`}>{formatPercent(positions.top.pct, 1)}</span></>
            : 'Sin precios para calcular la concentración'}
        </p>
      </Tile>

      {/* Sin nada bloqueado, la tercera tarjeta muestra la antigüedad media (#283) */}
      {locked.assets > 0 || ageDays === null ? (
        <Tile index={2} icon={<Lock size={16} strokeWidth={2.2} />} label="Bloqueado"
          help={<p>Valor en staking o launchpool al precio actual: forma parte de la cartera, pero no está disponible para vender hasta desbloquearlo.</p>}>
          <p className="mono tabular-nums text-xl font-semibold text-fg leading-tight">{formatMoney(locked.value, currency)}</p>
          <p className="text-[11px] text-fg-subtle">
            {locked.assets > 0
              ? `${locked.assets} ${locked.assets === 1 ? 'activo' : 'activos'} en staking o launchpool`
              : 'Nada bloqueado'}
          </p>
        </Tile>
      ) : (
        <Tile index={2} icon={<Hourglass size={16} strokeWidth={2.2} />} label="Antigüedad media"
          help={<p>Fecha media de compra de las posiciones abiertas, ponderada por lo que costó cada lote: pesa más lo que más dinero tienes invertido.</p>}>
          <p className="text-xl font-semibold text-fg leading-tight">{formatAge(ageDays)}</p>
          <p className="text-[11px] text-fg-subtle">Fecha media de compra: <span className="mono">{formatLotDate(new Date(avgOpenedAt!).toISOString())}</span></p>
        </Tile>
      )}
    </div>
  )
}
