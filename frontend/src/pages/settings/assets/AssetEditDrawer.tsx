import { useId, useRef } from 'react'
import { X } from 'lucide-react'
import type { AssetMetadata } from '../../../api/portfolio'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { Drawer, iconButtonClasses } from '../../../components/ui'
import { AssetEditPanel } from './AssetEditPanel'

// Edición de un activo en un panel lateral (#450): logo, pares, CoinGecko y
// estable, sin desplazar la tabla. Mismo comportamiento accesible que el resto
// de paneles (foco atrapado, Escape cierra y el foco vuelve a la fila).
export function AssetEditDrawer({ asset, onSaved, onClose }: { asset: AssetMetadata; onSaved: () => void; onClose: () => void }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  return (
    <Drawer onClose={onClose} labelledBy={titleId} initialFocusRef={closeRef}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <CryptoIcon symbol={asset.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold text-fg leading-tight">{asset.symbol}</h2>
          <p className="text-xs text-fg-subtle truncate">{asset.name}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar la edición" className={iconButtonClasses('md')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <AssetEditPanel asset={asset} embedded onSaved={() => { onSaved(); onClose() }} onCancel={onClose} />
      </div>
    </Drawer>
  )
}
