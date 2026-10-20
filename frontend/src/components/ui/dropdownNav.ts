// Navegación por teclado del Dropdown (#240), patrón listbox del WAI-ARIA.

export interface NavOption { label: string; disabled?: boolean }

/** Siguiente opción habilitada desde `from` en la dirección dada (sin dar la vuelta); `from` si no hay. */
export function nextEnabled(options: readonly NavOption[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i
  return from
}

/** Primera o última opción habilitada; -1 si no hay ninguna. */
export function edgeEnabled(options: readonly NavOption[], edge: 'first' | 'last'): number {
  const order = options.map((_, i) => i)
  if (edge === 'last') order.reverse()
  return order.find(i => !options[i].disabled) ?? -1
}

/**
 * Búsqueda por letra: la siguiente opción habilitada (después de `from`, dando
 * la vuelta) cuya etiqueta empieza por `query`, sin distinguir mayúsculas ni tildes.
 */
export function typeAhead(options: readonly NavOption[], query: string, from: number): number {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query)
  if (!q) return from
  for (let k = 1; k <= options.length; k++) {
    const i = (from + k) % options.length
    if (!options[i].disabled && norm(options[i].label).startsWith(q)) return i
  }
  return from
}

/** Opciones que contienen el texto buscado (sin distinguir mayúsculas ni tildes). */
export function filterOptions<T extends NavOption>(options: readonly T[], query: string): T[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query.trim())
  return q ? options.filter(o => norm(o.label).includes(q)) : [...options]
}

/** Índices donde empieza un grupo nuevo (#321): ahí se pinta su cabecera. */
export function groupStarts(options: readonly { group?: string }[]): Set<number> {
  const out = new Set<number>()
  options.forEach((o, i) => { if (o.group && o.group !== options[i - 1]?.group) out.add(i) })
  return out
}
