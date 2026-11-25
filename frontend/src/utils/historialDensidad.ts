// Densidad de la tabla del Historial (#552): cómoda (la de siempre) o
// compacta (filas más bajas). Se guarda en app_config (historial_densidad,
// validada en el backend con la misma lista) y se edita en las opciones de
// vista del Historial y en Ajustes › General › Preferencias.

export const HISTORIAL_DENSIDAD_KEY = 'historial_densidad'
export type DensidadHistorial = 'comoda' | 'compacta'

export const DENSIDAD_OPCIONES: readonly { value: DensidadHistorial; label: string }[] = [
  { value: 'comoda', label: 'Cómoda' },
  { value: 'compacta', label: 'Compacta' },
]

/** Valor guardado; si falta o no es válido, cómoda. */
export function densidadHistorial(config: Readonly<Record<string, string>> | undefined): DensidadHistorial {
  return config?.[HISTORIAL_DENSIDAD_KEY] === 'compacta' ? 'compacta' : 'comoda'
}
