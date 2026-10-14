import { Moon, Sun } from 'lucide-react'
import { useEffectiveTheme, useSetTheme } from '../hooks/useTheme'
import type { EffectiveTheme } from '../utils/theme'
import { SegmentedControl, type SegmentOption } from './ui'

const OPTIONS: readonly SegmentOption<EffectiveTheme>[] = [
  { value: 'dark', label: <Moon size={14} aria-hidden="true" />, title: 'Oscuro' },
  { value: 'light', label: <Sun size={14} aria-hidden="true" />, title: 'Claro' },
]

/**
 * Toggle claro/oscuro de la barra superior (#197). Muestra el tema que se ve
 * y, al elegir, fija esa preferencia (aunque en Ajustes estuviera «Sistema»).
 */
export function ThemeToggle() {
  const { theme } = useEffectiveTheme()
  const setTheme = useSetTheme()
  return <SegmentedControl label="Tema" value={theme} onChange={setTheme} options={OPTIONS} />
}
