// Navegación entre activos del panel de detalle con [ y ] (#528): recorre el
// orden de la tabla desde la que se abrió, sin repetir activos (en la vista
// por wallet un activo puede salir en varias secciones) y de forma circular.

export function uniqueOrder(assets: readonly string[]): string[] {
  return [...new Set(assets)]
}

/** Activo anterior (-1) o siguiente (+1); null si no hay otro al que ir. */
export function neighbourAsset(order: readonly string[], current: string, dir: -1 | 1): string | null {
  const list = uniqueOrder(order)
  const i = list.indexOf(current)
  if (i === -1 || list.length < 2) return null
  return list[(i + dir + list.length) % list.length]
}

/** Posición «3 de 12» del activo actual; null si no está en la lista. */
export function assetPosition(order: readonly string[], current: string): { index: number; total: number } | null {
  const list = uniqueOrder(order)
  const i = list.indexOf(current)
  return i === -1 ? null : { index: i + 1, total: list.length }
}
