import type { HistoryStats } from '../../../api/portfolio'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { formatAmount, formatMoney, type Currency } from '../../../utils/format'
import { T } from '../../../utils/colors'

// Rankings de la analítica del Historial (#376, #413): top activos y
// comisiones por activo, con barras en degradado y filas que filtran la lista
// por su activo, con brillo al pasar o con foco.

function RankRow({ asset, share, color, figure, label, onClick }: {
  asset: string; share: number; color: string; figure: string; label: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={`Filtrar ${asset}`}
      className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand group/rank">
      <CryptoIcon symbol={asset} size={16} />
      <span className="text-xs mono font-bold text-fg w-14 shrink-0 text-left truncate">{asset}</span>
      <span className="flex-1 h-2 rounded-full bg-overlay/8 overflow-hidden">
        <span className="block h-full rounded-full transition-[filter] group-hover/rank:brightness-125"
          style={{ width: `${Math.max(share, 0.03) * 100}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 35%, transparent), ${color})` }} />
      </span>
      <span className="text-xs text-fg-muted mono font-semibold shrink-0 min-w-12 text-right">{figure}</span>
    </button>
  )
}

export function Rankings({ stats, currency, period, onAssetClick }: {
  stats: HistoryStats; currency: Currency; period: string; onAssetClick: (asset: string) => void
}) {
  const topOps = stats.top_assets[0]?.ops || 1
  const topFee = stats.fees_by_asset[0]?.value[currency] || 1
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-border/50">
      <div>
        <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
          Top activos <span className="normal-case">· {period}</span>
        </p>
        {stats.top_assets.length === 0 && <p className="text-xs text-fg-subtle">Sin compras ni ventas en este periodo.</p>}
        <div className="space-y-0.5">
          {stats.top_assets.slice(0, 6).map(row => (
            <RankRow key={row.asset} asset={row.asset} share={row.ops / topOps} color={T.brand} figure={String(row.ops)}
              label={`Filtrar ${row.asset}: ${row.ops} compras y ventas, ${formatMoney(row.volume[currency], currency)}`}
              onClick={() => onAssetClick(row.asset)} />
          ))}
        </div>
      </div>
      {stats.fees_by_asset.length > 0 && (
        <div>
          <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
            Comisiones por activo <span className="normal-case">· {period}</span>
          </p>
          <div className="space-y-0.5">
            {stats.fees_by_asset.map(row => {
              const value = row.value[currency]
              const figure = value > 0 ? formatMoney(value, currency) : formatAmount(row.amount, 4)
              return (
                <RankRow key={row.asset} asset={row.asset} share={value / topFee} color={T.warning} figure={figure}
                  label={`Filtrar ${row.asset}: ${row.ops} comisiones, ${figure}`} onClick={() => onAssetClick(row.asset)} />
              )
            })}
          </div>
        </div>
      )}
      {stats.top_assets.length > 0 && <p className="md:col-span-2 text-xs text-fg-subtle -mt-3 pl-1.5">Pulsa un activo para filtrarlo</p>}
    </div>
  )
}
