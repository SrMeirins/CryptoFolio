import { NAV_ITEMS } from '../constants/navigation'

// Sugerencia de la página «no encontrada» (#487): la ruta conocida que más se
// parece a la pedida, por su dirección (/portfolioo) o por su nombre en
// castellano (/historial). Función pura.

/** Distancia de edición (inserciones, borrados y sustituciones). */
export function distancia(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** Máximo de letras distintas para considerar que es una errata. */
const MAX_DISTANCIA = 2

/** Página conocida más parecida a `pathname`, o null si ninguna se parece. */
export function rutaParecida(pathname: string): { to: string; label: string } | null {
  const pedida = (pathname.split('/').filter(Boolean)[0] ?? '').toLowerCase()
  if (!pedida) return null
  let mejor: { to: string; label: string; d: number } | null = null
  for (const item of NAV_ITEMS) {
    const ruta = item.to.replace(/^\//, '').toLowerCase()
    const nombre = item.label.toLowerCase()
    const d = Math.min(ruta ? distancia(pedida, ruta) : Infinity, distancia(pedida, nombre))
    if (d <= MAX_DISTANCIA && (!mejor || d < mejor.d)) mejor = { to: item.to, label: item.label, d }
  }
  return mejor && { to: mejor.to, label: mejor.label }
}
