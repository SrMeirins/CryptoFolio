import { useId } from 'react'
import { NAMED_COLORS } from './helpers'

/**
 * Selector de color de wallet (#525): muestras con nombre, un color libre para
 * igualarlo al de tu wallet física y la vista previa de cómo queda la tarjeta.
 * Lo usan el alta y la edición de wallets y guardar una dirección.
 */
export function ColorPicker({ value, onChange, size = 'md', preview }: {
  value: string
  onChange: (c: string) => void
  size?: 'sm' | 'md'
  /** Nombre de la wallet para la vista previa de la tarjeta; sin él, no se muestra. */
  preview?: string
}) {
  const uid = useId()
  const dim = size === 'md' ? 'w-7 h-7' : 'w-5 h-5'
  const gap = size === 'md' ? 'gap-2' : 'gap-1.5'
  const actual = NAMED_COLORS.find(c => c.hex.toLowerCase() === value.toLowerCase())
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Color de la wallet" className={`flex flex-wrap items-center ${gap}`}>
        {NAMED_COLORS.map(c => {
          const elegido = c.hex.toLowerCase() === value.toLowerCase()
          return (
            <button key={c.hex} type="button" role="radio" aria-checked={elegido} aria-label={c.name} onClick={() => onChange(c.hex)}
              className={`${dim} rounded-full ring-offset-2 ring-offset-background-card transition-transform focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${elegido ? 'scale-110 ring-2 ring-fg' : 'ring-1 ring-black/10'}`}
              style={{ backgroundColor: c.hex }} />
          )
        })}
        <label className={`relative ${dim} rounded-full overflow-hidden cursor-pointer ring-1 ring-black/10 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] focus-within:ring-2 focus-within:ring-brand ${!actual ? 'ring-2 ring-fg' : ''}`}>
          <span className="sr-only">Otro color</span>
          <input type="color" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-describedby={`${uid}-libre`} />
        </label>
      </div>
      <p id={`${uid}-libre`} className="text-xs text-fg-subtle">
        {actual ? actual.name : `Color propio ${value.toUpperCase()}`}. Con la rueda puedes elegir cualquiera, por ejemplo el de tu wallet física.
      </p>
      {preview !== undefined && (
        <div aria-hidden="true" className="flex items-center gap-2 rounded-xl border border-border bg-background-card px-3 py-2 text-sm" style={{ borderLeftColor: value, borderLeftWidth: 4 }}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: value }} />
          <span className="font-medium text-fg truncate">{preview || 'Tu wallet'}</span>
          <span className="ml-auto text-xs text-fg-subtle">así se verá en Portfolio</span>
        </div>
      )}
    </div>
  )
}
