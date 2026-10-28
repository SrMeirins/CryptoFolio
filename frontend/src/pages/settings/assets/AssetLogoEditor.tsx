import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type AssetMetadata } from '../../../api/portfolio'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { useToast } from '../../../hooks/useToast'
import { buttonClasses, fieldClasses } from '../../../components/ui'

// Logo del activo en su panel de edición (#449): de dónde sale y, si es el
// equivocado, un id de CoinGecko solo para el logo (nunca cambia los precios)
// o volver al automático.

const VALID_ID = /^[a-z0-9][a-z0-9-]{0,99}$/

function sourceText(a: AssetMetadata): string {
  if (a.icon_source === 'local') return 'Paquete de iconos incluido en la app'
  if (a.icon_source === 'flag') return 'Bandera del país'
  if (a.icon_id_source === 'manual') return `CoinGecko, id fijado a mano: ${a.icon_coingecko_id}`
  if (a.icon_id_source === 'auto') return `CoinGecko, id encontrado por el símbolo: ${a.icon_coingecko_id}`
  if (a.icon_source === 'coingecko') return `CoinGecko${a.coingecko_id ? `: ${a.coingecko_id}` : ''}`
  return 'Sin logo: se muestran las iniciales'
}

export function AssetLogoEditor({ asset }: { asset: AssetMetadata }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState(asset.icon_id_source === 'manual' ? asset.icon_coingecko_id ?? '' : '')
  const [saving, setSaving] = useState(false)
  const id = draft.trim().toLowerCase()
  const invalid = id !== '' && !VALID_ID.test(id)

  async function apply(next: string | null) {
    setSaving(true)
    try {
      await portfolioApi.setAssetIconId(asset.symbol, next)
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
      // El logo nuevo se busca en segundo plano: la lista de logos se vuelve a pedir en unos segundos.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['asset-icons'] }), 4000)
      toast.success('Logo actualizado', next ? `Se usará el de ${next}` : 'Vuelve al automático')
      if (!next) setDraft('')
    } catch (e) {
      toast.error('No se pudo cambiar el logo', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-fg-muted">Logo</p>
      <div className="flex items-center gap-3">
        <CryptoIcon symbol={asset.symbol} size={28} />
        <p className="text-xs text-fg-subtle">{sourceText(asset)}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={`logo-${asset.symbol}`} className="sr-only">Id de CoinGecko del logo de {asset.symbol}</label>
        <input id={`logo-${asset.symbol}`} value={draft} onChange={e => setDraft(e.target.value)} placeholder="id de CoinGecko, p. ej. shiba-inu"
          aria-invalid={invalid} className={fieldClasses('sm', invalid, 'mono w-64')} />
        <button type="button" onClick={() => void apply(id)} disabled={!id || invalid || saving} className={buttonClasses('secondary', 'sm')}>
          Usar este logo
        </button>
        {asset.icon_id_source === 'manual' && (
          <button type="button" onClick={() => void apply(null)} disabled={saving} className={buttonClasses('ghost', 'sm')}>
            Volver al automático
          </button>
        )}
      </div>
      {invalid
        ? <p role="alert" className="text-xs text-negative-ink">Solo minúsculas, números y guiones.</p>
        : <p className="text-xs text-fg-subtle">Solo cambia el logo; los precios siguen saliendo de sus pares.</p>}
    </div>
  )
}
