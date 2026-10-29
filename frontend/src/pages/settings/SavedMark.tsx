import { Check } from 'lucide-react'
import type { SavedStamp } from '../../hooks/useSettingFeedback'

// Marca animada junto a un ajuste recién guardado (#445). Decorativa: el aviso
// «Guardado» ya lo anuncia al lector de pantalla. La clave remonta la marca
// para repetir la animación en cada guardado.
export function SavedMark({ stamp, id }: { stamp: SavedStamp | null; id: string }) {
  if (!stamp || stamp.key !== id) return null
  return (
    <span key={stamp.at} aria-hidden="true" className="saved-mark inline-flex items-center gap-1 text-xs text-positive-ink">
      <Check size={12} strokeWidth={2.5} /> Guardado
    </span>
  )
}
