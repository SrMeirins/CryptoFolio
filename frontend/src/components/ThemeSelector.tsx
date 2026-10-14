import { useEffectiveTheme, useSetTheme } from '../hooks/useTheme'
import { THEME_PREFERENCES, type ThemePreference } from '../utils/theme'
import { SegmentedControl } from './ui'

const LABELS: Record<ThemePreference, string> = { dark: 'Oscuro', light: 'Claro', system: 'Sistema' }

/** Selector de tema de Ajustes → General (#197): oscuro, claro o el del sistema. */
export function ThemeSelector() {
  const { preference } = useEffectiveTheme()
  const setTheme = useSetTheme()
  return (
    <SegmentedControl label="Tema" size="md" value={preference} onChange={setTheme}
      options={THEME_PREFERENCES.map(p => ({ value: p, label: LABELS[p] }))} />
  )
}
