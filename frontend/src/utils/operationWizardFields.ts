// Estado inicial de los campos del OperationWizard.

/** Datos de una operación desconocida detectada en un CSV (subconjunto que usa el wizard). */
export interface UnknownOperationSeed {
  timestamp: string
  asset: string
  amount: number
}

// Se calcula una sola vez al montar el formulario (con el catálogo ya cargado),
// en lugar de sincronizarlo con efectos: así un `unknownOperation` recreado en
// cada render del padre no pisa lo que el usuario está editando.
export function buildInitialFields(
  base: Record<string, unknown>,
  unknownOperation: UnknownOperationSeed | undefined,
  nowIso: () => string = () => new Date().toISOString(),
): Record<string, unknown> {
  const fields = { ...base }
  if (unknownOperation) {
    fields.timestamp = unknownOperation.timestamp
    fields.asset     = unknownOperation.asset
    fields.amount    = unknownOperation.amount
  } else if (!fields.timestamp) {
    fields.timestamp = nowIso()
  }
  return fields
}
