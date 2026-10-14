import { useRef, type KeyboardEvent } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useEffectiveTheme, useSetTheme } from '../hooks/useTheme'
import { optionForKey } from '../utils/segmented'
import type { EffectiveTheme } from '../utils/theme'

const OPTIONS: readonly EffectiveTheme[] = ['dark', 'light']
const META = { dark: { label: 'Oscuro', Icon: Moon }, light: { label: 'Claro', Icon: Sun } } as const

/**
 * Toggle claro/oscuro de la barra superior (#197). Muestra el tema que se ve
 * y, al elegir, fija esa preferencia (aunque en Ajustes estuviera «Sistema»).
 */
export function ThemeToggle() {
  const { theme } = useEffectiveTheme()
  const setTheme = useSetTheme()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(OPTIONS, theme, e.key)
    if (!next) return
    e.preventDefault()
    setTheme(next)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Tema" onKeyDown={onKeyDown}
      className="flex shrink-0 items-center p-0.5 rounded-lg border border-border bg-background-tertiary">
      {OPTIONS.map(opt => {
        const active = opt === theme
        const { label, Icon } = META[opt]
        return (
          <button key={opt} ref={el => { refs.current[opt] = el }} type="button" role="radio"
            aria-checked={active} aria-label={label} title={label} tabIndex={active ? 0 : -1}
            onClick={() => setTheme(opt)}
            className={`px-2 py-1 rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              active ? 'bg-background-card text-fg shadow-xs' : 'text-fg-subtle hover:text-fg'
            }`}>
            <Icon size={14} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
