import { COLORS } from './helpers'

/**
 * Selector de color de wallet — antes repetido casi idéntico en
 * AddWalletForm (tamaño grande) y el modo edición inline de WalletsSection
 * (tamaño compacto).
 */
export function ColorPicker({ value, onChange, size = 'md' }: {
  value: string
  onChange: (c: string) => void
  size?: 'sm' | 'md'
}) {
  const dim  = size === 'md' ? 'w-7 h-7' : 'w-5 h-5'
  const ring = size === 'md' ? 'ring-2' : 'ring-1'
  const gap  = size === 'md' ? 'gap-2' : 'gap-1.5'
  return (
    <div className={`flex ${gap}`}>
      {COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          aria-label={`Elegir color ${c}`}
          className={`${dim} rounded-full transition-transform ${value === c ? `scale-125 ${ring} ring-white` : ''}`}
          style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}
