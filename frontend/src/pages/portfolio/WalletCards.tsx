import { X, Building2, Smartphone, Usb, Banknote, Wallet as WalletIcon, type LucideIcon } from 'lucide-react'
import { StatCard } from '../../components/ui'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { ink } from '../../utils/colors'
import { assetHue } from '../../utils/assetInitials'
import { daysSince, formatAge } from '../../utils/portfolioLots'
import { distinctHues, type WalletSummary } from '../../utils/portfolioInventory'

const KIND_LABEL: Record<string, string> = {
  exchange: 'Exchange',
  hardware: 'Hardware',
  software: 'Software',
  cold:     'Frío',
  hot:      'Caliente',
}
// Icono según el tipo de wallet (#283); el fiat no tiene tipo propio.
const KIND_ICON: Record<string, LucideIcon> = {
  exchange: Building2,
  software: Smartphone,
  hot:      Smartphone,
  hardware: Usb,
  cold:     Usb,
}
const hsl = (hue: number) => `hsl(${hue} 65% 55%)`

/** Barra apilada con los activos principales y «otros», con leyenda corta (#283). */
function Composition({ w }: { w: WalletSummary }) {
  const { top, others } = w.composition
  const hues = distinctHues(top.map(p => assetHue(p.asset)))
  const detail = [
    ...top.map(p => `${p.asset} ${formatPercent(p.pct, 1)}`),
    ...(others.value > 0 ? [`Otros ${formatPercent(others.pct, 1)}`] : []),
  ].join(' · ')
  return (
    <span className="block space-y-1" title={detail}>
      <span className="flex h-1.5 rounded-full overflow-hidden bg-overlay/6 gap-px" aria-hidden="true">
        {top.map((p, i) => (
          <span key={p.asset} className="h-full transition-[width] duration-500" style={{ width: `${p.pct}%`, backgroundColor: hsl(hues[i]) }} />
        ))}
        {others.value > 0 && <span className="h-full bg-fg-subtle/40 transition-[width] duration-500" style={{ width: `${others.pct}%` }} />}
      </span>
      <span className="sr-only">Composición: {detail}</span>
      <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-fg-subtle" aria-hidden="true">
        {top.slice(0, 2).map((p, i) => (
          <span key={p.asset} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hsl(hues[i]) }} />
            <span className="text-fg-muted">{p.asset}</span> <span className="mono">{formatPercent(p.pct, 0)}</span>
          </span>
        ))}
        {top.length + others.count > 2 && <span className="whitespace-nowrap">+{top.length - Math.min(2, top.length) + others.count}</span>}
      </span>
    </span>
  )
}

// Tarjetas de wallet de Portfolio (#270, #283) con StatCard (#417): color de
// la wallet, valor como cifra, chip con el P&L no realizado y su %, y la barra
// de composición. Tipo, peso, activos y antigüedad van en la ayuda. Pulsar una
// filtra la tabla por esa wallet; otra vez, quita el filtro.
export function WalletCards({ wallets, selected, onSelect }: {
  wallets: WalletSummary[]
  selected: string | null
  onSelect: (walletId: string | null) => void
}) {
  const currency = useCurrency()
  const active = wallets.find(w => w.walletId === selected)
  const money = (v: number) => formatMoney(v, currency)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 min-h-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Wallets</h2>
        {active && (
          <button type="button" onClick={() => onSelect(null)}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-overlay/5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
            Mostrando solo <span className="font-medium" style={{ color: ink(active.color) }}>{active.name}</span>
            <X size={12} aria-hidden="true" /><span className="sr-only">Quitar el filtro</span>
          </button>
        )}
      </div>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]" role="group" aria-label="Filtrar la tabla por wallet">
        {wallets.map((w, i) => {
          const on = w.walletId === selected
          const ageDays = daysSince(w.avgOpenedAt)
          const pnlText = w.pnl === null ? null
            : `${w.pnl >= 0 ? '+' : ''}${money(w.pnl)}${w.pnlPct !== null ? ` · ${formatPercent(w.pnlPct, 1, true)}` : ''}`
          return (
            <StatCard key={w.walletId} title={w.name} icon={KIND_ICON[w.kind] ?? (w.kind ? WalletIcon : Banknote)} color={w.color}
              value={w.value} format={money} delay={i * 60}
              chip={pnlText && (
                <span className={`mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${w.pnl! >= 0 ? 'bg-positive/10 text-positive-ink' : 'bg-negative/10 text-negative-ink'}`}>{pnlText}</span>
              )}
              footer={<Composition w={w} />}
              onSelect={() => onSelect(on ? null : w.walletId)} active={on}
              actionLabel={`${pnlText ? `P&L no realizado ${pnlText}. ` : ''}${on ? 'Quitar el filtro de la tabla' : 'Filtrar la tabla por esta wallet'}`}
              helpLabel={`Detalle de la wallet ${w.name}`}
              help={<>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-fg-muted">Tipo</dt><dd className="text-right">{KIND_LABEL[w.kind] ?? (w.kind || 'Fiat')}</dd>
                  <dt className="text-fg-muted">Peso en la cartera</dt><dd className="mono text-right">{formatPercent(w.pct, 1)}</dd>
                  <dt className="text-fg-muted">Activos</dt><dd className="mono text-right">{w.assetCount}</dd>
                  {ageDays !== null && <><dt className="text-fg-muted">Antigüedad media</dt><dd className="text-right">{formatAge(ageDays)}</dd></>}
                </dl>
                {pnlText && <p>P&L no realizado de sus posiciones con precio: <span className="mono">{pnlText}</span>.</p>}
                <p className="text-fg-muted">Pulsa la tarjeta para ver solo esta wallet en la tabla.</p>
              </>} />
          )
        })}
      </div>
    </div>
  )
}
