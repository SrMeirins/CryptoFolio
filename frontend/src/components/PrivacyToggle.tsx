import { Eye, EyeOff } from 'lucide-react'
import { usePrivacyStore } from '../store/privacyStore'
import { Tooltip } from './ui'

// Botón del modo privacidad de la barra superior (#254): oculta importes y
// cantidades en toda la app; precios de mercado y porcentajes siguen visibles.
export function PrivacyToggle() {
  const hidden = usePrivacyStore(s => s.hidden)
  const toggle = usePrivacyStore(s => s.toggle)
  return (
    <Tooltip
      label="Modo privacidad"
      triggerLabel={hidden ? 'Mostrar importes' : 'Ocultar importes'}
      onActivate={toggle}
      triggerClassName={`inline-flex items-center justify-center size-8 rounded-lg border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
        hidden ? 'border-brand/40 bg-brand/12 text-brand' : 'border-border text-fg-subtle hover:text-fg hover:bg-background-tertiary'
      }`}
      trigger={hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}>
      <p>{hidden ? 'Importes y cantidades ocultos.' : 'Oculta importes y cantidades para compartir pantalla.'}</p>
      <p className="text-fg-subtle">Los precios de mercado y los porcentajes siguen visibles.</p>
    </Tooltip>
  )
}
