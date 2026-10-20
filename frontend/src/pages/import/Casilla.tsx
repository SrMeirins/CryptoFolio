import { Check, Minus } from 'lucide-react'

// Casilla de selección accesible (#321): rol checkbox con estado, también «mixto».
export function Casilla({ estado, onChange, label, size = 'md' }: {
  estado: boolean | 'mixed'
  onChange: () => void
  label: string
  size?: 'sm' | 'md'
}) {
  const dim = size === 'md' ? 'w-4.5 h-4.5' : 'w-4 h-4'
  return (
    <button type="button" role="checkbox" aria-checked={estado} aria-label={label} onClick={onChange}
      className={`${dim} shrink-0 rounded border-2 flex items-center justify-center transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
        estado === true ? 'bg-brand-solid text-on-brand border-brand'
          : estado === 'mixed' ? 'bg-brand/25 border-brand text-brand'
            : 'border-border hover:border-fg-subtle'}`}>
      {estado === true && <Check size={11} strokeWidth={3} aria-hidden="true" />}
      {estado === 'mixed' && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
    </button>
  )
}
