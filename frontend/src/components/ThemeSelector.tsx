import { useEffectiveTheme, useSetTheme } from '../hooks/useTheme'
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from '../utils/theme'
import { SegmentedControl } from './ui'


/** Selector de tema de Ajustes → General (#197): oscuro, claro o el del sistema. */
/** `onChanged` (#445): Ajustes ofrece Deshacer con el valor anterior. */
export function ThemeSelector({ onChanged }: { onChanged?: (previous: ThemePreference, next: ThemePreference) => void } = {}) {
  const { preference } = useEffectiveTheme()
  const setTheme = useSetTheme()
  return (
    <SegmentedControl label="Tema" size="md" value={preference} onChange={next => { if (next === preference) return; setTheme(next); onChanged?.(preference, next) }}
      options={THEME_PREFERENCES.map(p => ({ value: p, label: THEME_LABELS[p] }))} />
  )
}
