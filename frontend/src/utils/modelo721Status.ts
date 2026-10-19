// Estado del Modelo 721 con precios pendientes (#267). Si faltan precios, el
// valor es un mínimo: si ya supera el umbral la obligación es segura; si no,
// no se puede afirmar «Sin obligación» y el resultado es «Incompleto».

export type Modelo721Status = 'obligatorio' | 'incompleto' | 'sin-obligacion'

export function modelo721Status({ superaUmbral, incompleto, obligado }: { superaUmbral: boolean; incompleto?: boolean; obligado?: boolean }): Modelo721Status {
  // Con un 721 presentado antes, superar el umbral no basta: el backend aplica
  // la regla del incremento de 20.000 € y lo indica en `obligado` (#311).
  const obliga = obligado ?? superaUmbral
  if (obliga) return 'obligatorio'
  // Si ya supera el umbral pero no obliga por la regla, el resultado es firme aunque falten precios.
  if (superaUmbral) return 'sin-obligacion'
  return incompleto ? 'incompleto' : 'sin-obligacion'
}

export const MODELO721_LABELS: Record<Modelo721Status, string> = {
  obligatorio: 'Obligatorio',
  incompleto: 'Incompleto',
  'sin-obligacion': 'Sin obligación',
}

/** «Faltan precios de ADA y DOT» / «… de ADA, DOT, XLM y 2 más»; null si no falta ninguno. */
export function pendingPricesText(assets: readonly string[] | undefined, max = 3): string | null {
  if (!assets || assets.length === 0) return null
  if (assets.length === 1) return `Falta el precio de ${assets[0]}`
  const shown = assets.slice(0, max)
  const rest = assets.length - shown.length
  const list = rest > 0 ? `${shown.join(', ')} y ${rest} más` : `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`
  return `Faltan precios de ${list}`
}
