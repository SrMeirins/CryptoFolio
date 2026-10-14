/**
 * Navegación con teclado de un grupo de opciones (patrón radiogroup del
 * WAI-ARIA): flechas para la anterior/siguiente (circular), Inicio y Fin para
 * los extremos. null si la tecla no aplica.
 */
export function optionForKey<T>(options: readonly T[], current: T, key: string): T | null {
  const i = options.indexOf(current)
  const n = options.length
  if (n === 0) return null
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return options[(i + 1) % n]
    case 'ArrowLeft': case 'ArrowUp': return options[(i - 1 + n) % n]
    case 'Home': return options[0]
    case 'End': return options[n - 1]
    default: return null
  }
}
