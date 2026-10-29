// Interruptor accesible (#453): una casilla con role="switch" y su pista
// visual. El mismo aspecto que los de Preferencias y Notificaciones.

export function Switch({ id, checked, onChange, describedBy, disabled }: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  describedBy?: string
  disabled?: boolean
}) {
  return (
    <span className="inline-flex items-center cursor-pointer shrink-0">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={describedBy}
        className="peer sr-only" onChange={e => onChange(e.target.checked)} />
      <label htmlFor={id} aria-hidden="true"
        className="relative w-9 h-5 rounded-full cursor-pointer bg-overlay/15 ring-1 ring-inset ring-fg-subtle/60 peer-checked:ring-0 transition-colors peer-checked:bg-brand-solid peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
    </span>
  )
}
