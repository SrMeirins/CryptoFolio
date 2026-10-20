import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { usePrivacyStore } from '../../store/privacyStore'
import { abreviarDireccion } from './direcciones'

// Dirección on-chain abreviada con copiar y enlace al explorador (#320). En
// modo privacidad se oculta, sin tooltip ni copia. Se pinta siempre como texto.
export function DireccionTag({ address, explorerUrl }: { address: string; explorerUrl: string | null }) {
  const oculta = usePrivacyStore(s => s.hidden)
  const [copiada, setCopiada] = useState(false)

  if (oculta) return <span className="mono text-xs text-fg-subtle" aria-label="Dirección oculta">••••••…••••</span>

  async function copiar() {
    try {
      await navigator.clipboard.writeText(address)
      setCopiada(true)
      setTimeout(() => setCopiada(false), 1500)
    } catch { /* portapapeles no disponible */ }
  }

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="mono text-xs text-fg truncate" title={address}>{abreviarDireccion(address)}</span>
      <button type="button" onClick={() => { void copiar() }} aria-label={copiada ? 'Dirección copiada' : 'Copiar dirección'}
        className="p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
        {copiada ? <Check size={11} className="text-positive" aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
      </button>
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="Ver la dirección en el explorador"
          className="p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </span>
  )
}
