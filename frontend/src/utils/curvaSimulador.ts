import type { SimulationCurvePoint } from '../api/portfolio'

// Curva del simulador de venta (#529): valor de la curva en un precio
// cualquiera (interpolación lineal entre sus puntos) y movimiento del punto
// elegido con el teclado. Funciones puras.

/** Resultado y neto de la curva en `price`, interpolados; null fuera de la curva. */
export function curvaEn(points: readonly SimulationCurvePoint[], price: number): { resultadoNeto: number; netoEnMano: number } | null {
  if (points.length === 0 || price < points[0].price || price > points[points.length - 1].price) return null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (price <= b.price) {
      const f = b.price > a.price ? (price - a.price) / (b.price - a.price) : 0
      return { resultadoNeto: a.resultadoNeto + f * (b.resultadoNeto - a.resultadoNeto), netoEnMano: a.netoEnMano + f * (b.netoEnMano - a.netoEnMano) }
    }
  }
  const last = points[points.length - 1]
  return { resultadoNeto: last.resultadoNeto, netoEnMano: last.netoEnMano }
}

/**
 * Precio tras pulsar una tecla con el foco en el punto: flechas ±1 % del
 * precio actual (con Mayús, ±10 %); Inicio, el precio actual. Null si la
 * tecla no mueve el punto.
 */
export function pasoTeclado(key: string, shift: boolean, elegido: number, actual: number): number | null {
  const paso = actual * (shift ? 0.1 : 0.01)
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return elegido + paso
    case 'ArrowLeft': case 'ArrowDown': return Math.max(0, elegido - paso)
    case 'PageUp': return elegido + actual * 0.1
    case 'PageDown': return Math.max(0, elegido - actual * 0.1)
    case 'Home': return actual
    default: return null
  }
}
