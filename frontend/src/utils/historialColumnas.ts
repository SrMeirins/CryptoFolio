// Columnas configurables de la tabla del Historial (#554). Fecha, Tipo y Activo
// se ven siempre; el resto se elige en las opciones de vista del Historial o en
// Ajustes y se guarda en app_config (historial_columnas, validada en el backend
// con la misma lista).

export const HISTORIAL_COLUMNAS_KEY = 'historial_columnas'

export type ColumnaHistorial = 'cantidad' | 'valor' | 'fee' | 'wallet'

/** Orden de pintado. */
export const COLUMNAS_HISTORIAL: readonly { key: ColumnaHistorial; label: string }[] = [
  { key: 'cantidad', label: 'Cantidad' },
  { key: 'valor', label: 'Valor' },
  { key: 'fee', label: 'Fee' },
  { key: 'wallet', label: 'Wallet' },
]

const CLAVES = COLUMNAS_HISTORIAL.map(c => c.key)
const CONOCIDAS = new Set<string>(CLAVES)

/** Columnas guardadas; si faltan o no son válidas, todas. Una lista vacía es válida. */
export function columnasHistorial(config: Readonly<Record<string, string>> | undefined): ColumnaHistorial[] {
  const raw = config?.[HISTORIAL_COLUMNAS_KEY]
  if (!raw) return [...CLAVES]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'string' && CONOCIDAS.has(v))) return [...CLAVES]
    return CLAVES.filter(k => parsed.includes(k))
  } catch (e) {
    if (e instanceof SyntaxError) return [...CLAVES]
    throw e
  }
}

/** Valor a guardar: en el orden canónico y sin repetidos. */
export function serializarColumnasHistorial(cols: readonly ColumnaHistorial[]): string {
  return JSON.stringify(CLAVES.filter(k => cols.includes(k)))
}
