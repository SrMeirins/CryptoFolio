// Ejercicios declarados (#311): etiquetas de las cifras que cambian y umbral
// del incremento del 721. Funciones puras.

export const CAMPO_LABEL: Record<string, string> = {
  ganancias: 'Ganancias',
  perdidas: 'Pérdidas',
  neto: 'Neto',
  rendimientos: 'Rendimientos',
  operaciones: 'Operaciones',
  base: 'Base del ahorro',
  cuota: 'Cuota IRPF',
}

export const INCREMENTO_721 = 20_000

/** Valor a partir del cual vuelve a haber obligación: el mayor entre el umbral y lo último presentado + 20.000 €. */
export function umbralSiguiente721(umbral: number, ultima: { valor: number } | null | undefined): number {
  return ultima ? Math.max(umbral, ultima.valor + INCREMENTO_721) : umbral
}

/** Importe escrito a mano: «60.000», «60.000,50», «60000,5» o «60000.50». NaN si no es un número. */
export function parseImporte(raw: string): number {
  const t = raw.trim().replace(/\s|€/g, '')
  if (!/^\d[\d.,]*$/.test(t)) return Number.NaN
  // Con coma, la coma es el decimal y los puntos son de miles; sin coma, un punto
  // seguido de 3 cifras es de miles y cualquier otro es decimal.
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  return Number(normal)
}
