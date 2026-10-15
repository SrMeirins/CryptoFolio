// Corte verde/rojo en el 0 del gráfico de evolución (#231).
//
// Los degradados SVG usan por defecto la caja de la propia forma
// (objectBoundingBox): 0 es su borde superior y 1 el inferior. Antes el corte
// se calculaba sobre el dominio redondeado del eje, más amplio que esa caja,
// así que el cambio de color quedaba desplazado respecto al 0. Aquí se calcula
// con el rango real de cada forma:
// - el área (rellena hasta el 0) va de max(datos, 0) a min(datos, 0);
// - la línea va del máximo al mínimo de los datos.
// La interpolación monotone no se sale de los extremos de los datos.

export interface ZeroSplit {
  /** Posición del 0 en el relleno (0 = arriba, 1 = abajo). */
  fill: number
  /** Posición del 0 en la línea; null si la línea es plana (caja sin altura: color sólido). */
  stroke: number | null
  /** Color de la línea cuando es plana o no cruza el 0. */
  solid: 'up' | 'down'
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

export function zeroSplit(values: readonly number[]): ZeroSplit {
  if (values.length === 0) return { fill: 1, stroke: null, solid: 'up' }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const top = Math.max(max, 0)
  const bottom = Math.min(min, 0)
  const fill = top === bottom ? 1 : clamp(top / (top - bottom))
  const solid = max <= 0 && min < 0 ? 'down' : 'up'
  const stroke = max === min ? null : clamp(max / (max - min))
  return { fill, stroke, solid }
}
