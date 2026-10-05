import { Edit2, Trash2 } from 'lucide-react'
import type { AssetMetadata } from '../../../api/portfolio'
import { SOURCE_META, fmtPrice } from './helpers'
import { AssetEditPanel } from './AssetEditPanel'

export function AssetItem({ asset, price, isEditing, onEdit, onSaved, onDelete }: {
  asset: AssetMetadata; price: number | undefined
  isEditing: boolean; onEdit: () => void; onSaved: () => void; onDelete: () => void
}) {
  const src = SOURCE_META[asset.price_source] ?? SOURCE_META.unknown
  const activePair = asset.binance_eur_pair ?? asset.binance_usdt_pair ?? asset.binance_btc_pair

  return (
    <div className="rounded-xl border border-border bg-background-card" style={{ borderLeftColor: src.color, borderLeftWidth: 3 }}>
      <div className="group flex items-center gap-4 px-4 py-3">
        <div className="w-28 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold mono">{asset.symbol}</span>
            {asset.auto_detected && <span className="text-xs" style={{ color: '#6366f1' }}>auto</span>}
          </div>
          <div className="text-xs text-gray-600 truncate">{asset.name}</div>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
            style={{ backgroundColor: `${src.color}18`, color: src.color }}>
            {src.label}
          </span>
          {activePair && <span className="text-xs mono text-gray-500 truncate">{activePair}</span>}
        </div>
        <div className="w-28 text-right shrink-0">
          {price != null
            ? <span className="text-sm font-medium mono">{fmtPrice(price)}</span>
            : <span className="text-xs text-gray-700">—</span>
          }
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button type="button" onClick={onEdit} aria-label="Editar activo"
            className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors">
            <Edit2 size={12} />
          </button>
          <button type="button" onClick={onDelete} aria-label="Eliminar activo"
            className="p-1.5 text-gray-600 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {isEditing && <AssetEditPanel asset={asset} onSaved={onSaved} onCancel={onEdit} />}
    </div>
  )
}
