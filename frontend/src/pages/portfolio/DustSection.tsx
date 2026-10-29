import { ChevronDown } from 'lucide-react'
import { AssetTable } from '../../components/AssetTable'
import { panelClasses, panelEnterStyle, panelSurface } from '../../components/ui'
import { formatMoney } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import type { UnifiedRow } from '../../utils/assetTable'

// Polvo de todas las wallets en un único bloque plegable al final (#269), en
// lugar de una tabla de polvo (y otra vacía) por wallet. Cada fila lleva el
// chip de su wallet.
export function DustSection({ rows, value, total, threshold, compact, open, onToggle, index, onOpen }: {
  rows: UnifiedRow[]
  value: number
  total: number
  threshold: number
  compact: boolean
  open: boolean
  onToggle: () => void
  index: number
  /** Abre el detalle del activo (#460): el polvo también tiene su panel. */
  onOpen: (asset: string) => void
}) {
  const currency = useCurrency()
  if (rows.length === 0) return null
  return (
    <section aria-label="Polvo" className={panelClasses(panelSurface('none', 'overflow-clip'))} style={panelEnterStyle(index)}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-overlay/3 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60">
        <span className="flex items-center gap-2">
          <ChevronDown size={14} aria-hidden="true" className={`text-fg-subtle transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Polvo</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-overlay/6 text-fg-subtle">
            {rows.length} {rows.length === 1 ? 'posición' : 'posiciones'} &lt; {formatMoney(threshold, currency)}
          </span>
        </span>
        <span className="text-xs mono tabular-nums text-fg-subtle">{formatMoney(value, currency)}</span>
      </button>
      {open && (
        <div className="border-t border-border">
          <AssetTable rows={rows} portfolioTotal={total} compact={compact} keyByWallet onOpen={onOpen} />
        </div>
      )}
    </section>
  )
}
