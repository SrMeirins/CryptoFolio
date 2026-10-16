import type { ReactNode } from 'react'
import { Layers, Lock, ShieldCheck } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { cardClasses, panelClasses, panelEnterStyle } from '../../components/ui'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import type { Inventory } from '../../utils/portfolioInventory'

// Franja de inventario de Portfolio (#270): custodia, posiciones y bloqueado.
// Sustituye al anillo de distribución, que duplicaba el panel del Dashboard.

function Tile({ icon, label, help, children, index }: { icon: ReactNode; label: string; help: ReactNode; children: ReactNode; index: number }) {
  return (
    <div className={panelClasses(cardClasses('none', 'relative flex gap-3 px-4 py-3.5 min-w-0'))} style={panelEnterStyle(index)}>
      <span className="size-9 rounded-lg grid place-items-center shrink-0 bg-brand/10 text-brand" aria-hidden="true">{icon}</span>
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

export function InventoryStrip({ inventory }: { inventory: Inventory }) {
  const currency = useCurrency()
  const { custody, positions, locked } = inventory
  const selfPct = 100 - custody.exchangePct
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
      <Tile index={0} icon={<ShieldCheck size={17} strokeWidth={2.2} />} label="Custodia"
        help={<>
          <p>Qué parte de la cartera está en exchanges (custodia de terceros) y qué parte en autocustodia (hardware o software).</p>
          <p className="mt-1.5 text-fg-subtle">Solo la custodia de terceros computa para el Modelo 721.</p>
        </>}>
        <p className="mono tabular-nums text-[15px] font-semibold text-fg leading-tight">
          {formatPercent(selfPct, 0)} <span className="text-xs font-normal text-fg-subtle">en autocustodia</span>
        </p>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-overlay/6" role="img"
          aria-label={`${formatPercent(selfPct, 0)} en autocustodia y ${formatPercent(custody.exchangePct, 0)} en exchanges`}>
          <span className="h-full bg-brand transition-[width] duration-500" style={{ width: `${selfPct}%` }} />
          <span className="h-full bg-warning/80 transition-[width] duration-500" style={{ width: `${custody.exchangePct}%` }} />
        </div>
        <p className="text-[11px] text-fg-subtle mono tabular-nums truncate">
          <span className="text-brand">●</span> {formatMoney(custody.self, currency)} · <span className="text-warning">●</span> {formatMoney(custody.exchange, currency)} en exchanges
        </p>
      </Tile>

      <Tile index={1} icon={<Layers size={17} strokeWidth={2.2} />} label="Posiciones"
        help={<p>Activos distintos en cartera, wallets donde están y concentración: el peso del activo más grande sobre el total.</p>}>
        <p className="mono tabular-nums text-[15px] font-semibold text-fg leading-tight">
          {positions.assets} <span className="text-xs font-normal text-fg-subtle">{positions.assets === 1 ? 'activo' : 'activos'} en</span> {positions.wallets} <span className="text-xs font-normal text-fg-subtle">{positions.wallets === 1 ? 'wallet' : 'wallets'}</span>
        </p>
        <p className="text-[11px] text-fg-subtle">
          {positions.top
            ? <>Mayor peso: <span className="mono text-fg">{positions.top.asset}</span> <span className={`mono ${positions.top.pct >= 50 ? 'text-warning' : 'text-fg-muted'}`}>{formatPercent(positions.top.pct, 1)}</span></>
            : 'Sin precios para calcular la concentración'}
        </p>
      </Tile>

      <Tile index={2} icon={<Lock size={16} strokeWidth={2.2} />} label="Bloqueado"
        help={<p>Valor en staking o launchpool al precio actual: forma parte de la cartera, pero no está disponible para vender hasta desbloquearlo.</p>}>
        <p className="mono tabular-nums text-[15px] font-semibold text-fg leading-tight">{formatMoney(locked.value, currency)}</p>
        <p className="text-[11px] text-fg-subtle">
          {locked.assets > 0
            ? `${locked.assets} ${locked.assets === 1 ? 'activo' : 'activos'} en staking o launchpool`
            : 'Nada bloqueado'}
        </p>
      </Tile>
    </div>
  )
}
