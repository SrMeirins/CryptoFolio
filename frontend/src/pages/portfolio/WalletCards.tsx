import { X } from 'lucide-react'
import { panelEnterStyle } from '../../components/ui'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { alpha, ink } from '../../utils/colors'
import type { WalletSummary } from '../../utils/portfolioInventory'

const KIND_LABEL: Record<string, string> = {
  exchange: 'Exchange',
  hardware: 'Hardware',
  software: 'Software',
  cold:     'Frío',
  hot:      'Caliente',
}

// Tarjetas de wallet de Portfolio (#270): valor, % del total, tipo y nº de
// activos. Pulsar una filtra la tabla por esa wallet; otra vez, quita el filtro.
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
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]" role="group" aria-label="Filtrar la tabla por wallet">
        {wallets.map((w, i) => {
          const on = w.walletId === selected
          return (
            <button key={w.walletId} type="button" aria-pressed={on} onClick={() => onSelect(on ? null : w.walletId)}
              className={`panel-in panel-glow text-left rounded-xl border bg-background-card px-4 py-3 space-y-2 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
                selected && !on ? 'opacity-60 hover:opacity-100' : ''}`}
              style={{ ...panelEnterStyle(i + 3), borderColor: on ? w.color : undefined, backgroundColor: on ? alpha(w.color, 6) : undefined }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} aria-hidden="true" />
                <span className="text-sm font-semibold truncate" style={{ color: ink(w.color) }}>{w.name}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md border border-border/60 uppercase tracking-wider text-fg-subtle shrink-0">
                  {KIND_LABEL[w.kind] ?? w.kind}
                </span>
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="mono tabular-nums text-[15px] font-semibold text-fg">{formatMoney(w.value, currency)}</span>
                <span className="mono tabular-nums text-xs text-fg-subtle">{formatPercent(w.pct, 1)}</span>
              </span>
              <span className="block h-1 rounded-full bg-overlay/6 overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(w.pct, w.value > 0 ? 1 : 0)}%`, backgroundColor: w.color }} />
              </span>
              <span className="block text-[11px] text-fg-subtle">{w.assetCount} {w.assetCount === 1 ? 'activo' : 'activos'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
