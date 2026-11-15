// Cabecera de Portfolio (#525): «Para recuperar el coste» y la custodia con
// los decimales justos para sumar exactamente 100 %. Funciones puras.

export type Recuperar =
  | { estado: 'perdida'; subidaPct: number; faltan: number }
  | { estado: 'ganancia'; margenPct: number; sobra: number }
  | { estado: 'sinCoste' }

/** Cuánto tendría que subir la cartera para valer lo que costó o, si ya lo vale, cuánto lo supera. */
export function recuperarCoste(valor: number, coste: number): Recuperar {
  if (!(coste > 0)) return { estado: 'sinCoste' }
  if (valor < coste) {
    return valor > 0
      ? { estado: 'perdida', subidaPct: (coste / valor - 1) * 100, faltan: coste - valor }
      : { estado: 'perdida', subidaPct: Number.POSITIVE_INFINITY, faltan: coste }
  }
  return { estado: 'ganancia', margenPct: (valor / coste - 1) * 100, sobra: valor - coste }
}

export interface CustodiaPartes {
  /** «Todo en autocustodia» o «Todo en exchanges» si un lado es exactamente cero. */
  todo: 'propia' | 'exchanges' | null
  propia: string
  exchanges: string
  decimales: number
}

const pct = (v: number, d: number) => v.toFixed(d).replace('.', ',')

/**
 * Los dos lados de la custodia en %, con los decimales mínimos (hasta 3) para
 * que ninguno que no sea cero se muestre como 0 o 100 y ambos sumen 100.
 */
export function custodiaPartes(propia: number, exchanges: number): CustodiaPartes {
  const total = propia + exchanges
  if (!(total > 0)) return { todo: null, propia: '0', exchanges: '0', decimales: 0 }
  if (exchanges <= 0) return { todo: 'propia', propia: '100', exchanges: '0', decimales: 0 }
  if (propia <= 0) return { todo: 'exchanges', propia: '0', exchanges: '100', decimales: 0 }
  const p = (propia / total) * 100
  for (let d = 0; d <= 3; d++) {
    const a = Number(p.toFixed(d))
    const b = Number((100 - a).toFixed(d))
    if (a > 0 && a < 100 && b > 0 && b < 100) return { todo: null, propia: pct(a, d), exchanges: pct(b, d), decimales: d }
  }
  // Por debajo de 0,001 %: se muestra el mínimo legible.
  return p < 50
    ? { todo: null, propia: '<0,001', exchanges: '>99,999', decimales: 3 }
    : { todo: null, propia: '>99,999', exchanges: '<0,001', decimales: 3 }
}

/** Línea y área de un mini gráfico (#525) en un lienzo de `ancho` por `alto`; sin dos puntos, nada. */
export function trazoMini(valores: readonly number[], ancho: number, alto: number): { linea: string; area: string } | null {
  const v = valores.filter(Number.isFinite)
  if (v.length < 2) return null
  const min = Math.min(...v), max = Math.max(...v)
  const rango = max - min || 1
  const margen = 2
  const pts = v.map((y, i) => [
    (i / (v.length - 1)) * ancho,
    margen + (1 - (y - min) / rango) * (alto - 2 * margen),
  ] as const)
  const linea = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return { linea, area: `${linea} L${ancho} ${alto} L0 ${alto} Z` }
}

/** Importe partido en la parte entera y los decimales (con la moneda), para mostrarlos a dos tamaños. */
export function partirImporte(texto: string): { entero: string; resto: string } {
  const i = texto.lastIndexOf(',')
  return i < 0 ? { entero: texto, resto: '' } : { entero: texto.slice(0, i), resto: texto.slice(i) }
}
