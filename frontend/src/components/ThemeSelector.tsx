import { useRef, type KeyboardEvent } from 'react'
import { useEffectiveTheme, useSetTheme } from '../hooks/useTheme'
import { optionForKey } from '../utils/segmented'
import { THEME_PREFERENCES, type ThemePreference } from '../utils/theme'

const LABELS: Record<ThemePreference, string> = { dark: 'Oscuro', light: 'Claro', system: 'Sistema' }

/** Selector de tema de Ajustes → General (#197): oscuro, claro o el del sistema. */
export function ThemeSelector() {
  const { preference } = useEffectiveTheme()
  const setTheme = useSetTheme()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(THEME_PREFERENCES, preference, e.key)
    if (!next) return
    e.preventDefault()
    setTheme(next)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Tema" onKeyDown={onKeyDown}
      className="flex shrink-0 items-center p-0.5 rounded-lg border border-border bg-background-tertiary">
      {THEME_PREFERENCES.map(opt => {
        const active = opt === preference
        return (
          <button key={opt} ref={el => { refs.current[opt] = el }} type="button" role="radio"
            aria-checked={active} tabIndex={active ? 0 : -1} onClick={() => setTheme(opt)}
            className={`px-3 py-1.5 text-sm whitespace-nowrap rounded-lg font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              active ? 'bg-background-card text-fg shadow-xs' : 'text-fg-subtle hover:text-fg'
            }`}>
            {LABELS[opt]}
          </button>
        )
      })}
    </div>
  )
}
