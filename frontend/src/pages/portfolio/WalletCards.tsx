import { X, Building2, Smartphone, Usb, Banknote, Wallet as WalletIcon, type LucideIcon } from 'lucide-react'
import { panelEnterStyle } from '../../components/ui'
import { formatMoney, formatPercent, pnlColor } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { alpha, ink } from '../../utils/colors'
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

// Tarjetas de wallet de Portfolio (#270, #283): tipo, valor, % del total,
// composición, P&L no realizado y antigüedad media. Pulsar una filtra la
// tabla por esa wallet; otra vez, quita el filtro.
export function WalletCards({ wallets, selected, onSelect }: {
  wallets: WalletSummary[]
  selected: string | null
  onSelect: (walletId: string | null) => void
}) {
  const currency = useCurrency()
  const active = wallets.find(w => w.walletId === selected)
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
          const Icon = KIND_ICON[w.kind] ?? (w.kind ? WalletIcon : Banknote)
          const ageDays = daysSince(w.avgOpenedAt)
          return (
            <button key={w.walletId} type="button" aria-pressed={on} onClick={() => onSelect(on ? null : w.walletId)}
              // Elevación al pasar el cursor o con el foco (#283): `translate` no choca con la animación de entrada (transform).
              className={`panel-in text-left rounded-xl border border-border bg-background-card px-4 py-3 space-y-2.5 transition-[translate,box-shadow,border-color,opacity] duration-200
                hover:-translate-y-0.5 focus-visible:-translate-y-0.5 motion-reduce:translate-y-0 hover:border-(--wallet) focus-visible:border-(--wallet)
                hover:shadow-[0_10px_24px_-14px_var(--wallet)] focus-visible:shadow-[0_10px_24px_-14px_var(--wallet)]
                focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${selected && !on ? 'opacity-60 hover:opacity-100' : ''}`}
              style={{
                ...panelEnterStyle(i + 3), ['--wallet' as string]: w.color,
                borderColor: on ? w.color : undefined, backgroundColor: on ? alpha(w.color, 6) : undefined,
              }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="size-7 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: alpha(w.color, 14), color: ink(w.color) }} aria-hidden="true">
                  <Icon size={14} strokeWidth={2.2} />
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: ink(w.color) }}>{w.name}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md border border-border/60 uppercase tracking-wider text-fg-subtle shrink-0">
                  {KIND_LABEL[w.kind] ?? (w.kind || 'Fiat')}
                </span>
              </span>
              <span className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="mono tabular-nums text-lg font-semibold text-fg leading-tight">{formatMoney(w.value, currency)}</span>
                <span className="mono tabular-nums text-xs text-fg-subtle">{formatPercent(w.pct, 1)} del total</span>
              </span>
              {w.pnl !== null && (
                <span className={`block mono tabular-nums text-xs ${pnlColor(w.pnl)}`}>
                  {w.pnl >= 0 ? '+' : ''}{formatMoney(w.pnl, currency)}
                  {w.pnlPct !== null && <span> ({formatPercent(w.pnlPct, 1, true)})</span>}
                  <span className="text-fg-subtle font-sans"> no realizado</span>
                </span>
              )}
              <Composition w={w} />
              <span className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
                <span>{w.assetCount} {w.assetCount === 1 ? 'activo' : 'activos'}</span>
                {ageDays !== null && <span title="Antigüedad media de los lotes, ponderada por coste">{formatAge(ageDays)}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
