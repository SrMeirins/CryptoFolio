import { AssetTable } from '../../components/AssetTable'
import { panelClasses, panelEnterStyle, panelSurface } from '../../components/ui'
import { formatMoney, formatPercent } from '../../utils/format'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { ink } from '../../utils/colors'
import type { WalletSection } from '../../utils/portfolioSections'

const KIND_LABEL: Record<string, string> = {
  exchange: 'Exchange',
  hardware: 'Hardware',
  software: 'Software',
  cold:     'Frío',
  hot:      'Caliente',
}

// Una tarjeta por wallet con sus posiciones (#269): autocustodia primero,
// exchanges después. Las wallets que solo tienen polvo no aparecen aquí (su
// polvo va a la sección común) y el chip de la wallet no se repite en cada fila.
export function WalletSections({ sections, total, compact, onSimulate, onOpen }: {
  sections: WalletSection[]
  total: number
  compact: boolean
  onSimulate: (asset: string, qty: number, price: number) => void
  /** Abre el detalle del activo (#460), como en la vista «Por activo». */
  onOpen: (asset: string) => void
}) {
  const currency = useCurrency()
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        const value = s.rows.reduce((sum, r) => sum + r.value, 0)
        return (
          <section key={s.walletId} aria-label={`Wallet ${s.name}`}
            className={panelClasses(panelSurface('none', 'overflow-clip'))} style={panelEnterStyle(i + 1)}>
            <AssetTable rows={s.rows} portfolioTotal={total} compact={compact} hideWalletChips onSimulate={onSimulate} onOpen={onOpen}
              header={
                <>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  <h2 className="text-sm font-semibold truncate" style={{ color: ink(s.color) }}>{s.name}</h2>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-border/60 font-medium uppercase tracking-wider text-fg-subtle">
                    {KIND_LABEL[s.kind] ?? (s.kind || 'Fiat')}
                  </span>
                  <span className="text-xs text-fg-subtle">{s.assetCount} {s.assetCount === 1 ? 'posición' : 'posiciones'}</span>
                  <span className="text-xs text-fg-subtle mono tabular-nums ml-1">
                    · <span className="text-fg">{formatMoney(value, currency)}</span>
                    {total > 0 && <> · {formatPercent((value / total) * 100, 1)}</>}
                  </span>
                </>
              } />
          </section>
        )
      })}
    </div>
  )
}
