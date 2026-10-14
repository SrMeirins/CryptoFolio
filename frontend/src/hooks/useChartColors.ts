import { useMemo, useSyncExternalStore } from 'react'
import { readChartColors, type ChartColors } from '../utils/chartColors'

// Colores de los gráficos del tema activo (#197): se releen al cambiar el
// atributo data-theme del documento.
function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
const currentTheme = () => document.documentElement.getAttribute('data-theme') ?? 'dark'

export function useChartColors(): ChartColors {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'dark')
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    return readChartColors(v => style.getPropertyValue(v))
    // theme es la dependencia: cambia cuando cambian las variables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
}
