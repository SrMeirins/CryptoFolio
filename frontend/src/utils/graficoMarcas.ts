// Cómo se marcan compras y ventas en el gráfico de precio del detalle del
// activo (#528): puntos sobre la línea o banderas en una franja arriba o abajo,
// fuera del área de la línea. Se guarda en app_config (grafico_marcas, validada
// en el backend con la misma lista) y se edita en el gráfico y en Ajustes.

export const GRAFICO_MARCAS_KEY = 'grafico_marcas'
export type MarcasGrafico = 'puntos' | 'banderas-arriba' | 'banderas-abajo'

export const MARCAS_OPCIONES: readonly { value: MarcasGrafico; label: string; title: string }[] = [
  { value: 'puntos', label: 'Puntos', title: 'Puntos sobre la línea del precio' },
  { value: 'banderas-arriba', label: 'Banderas arriba', title: 'Banderas en una franja sobre el gráfico' },
  { value: 'banderas-abajo', label: 'Banderas abajo', title: 'Banderas en una franja bajo el gráfico' },
]

export const MARCAS_DEFECTO: MarcasGrafico = 'puntos'

/** Valor guardado; si falta o no es válido, el predeterminado. */
export function marcasGrafico(config: Readonly<Record<string, string>> | undefined): MarcasGrafico {
  const v = config?.[GRAFICO_MARCAS_KEY]
  return MARCAS_OPCIONES.some(o => o.value === v) ? (v as MarcasGrafico) : MARCAS_DEFECTO
}

export function marcasLabel(v: MarcasGrafico): string {
  return MARCAS_OPCIONES.find(o => o.value === v)?.label ?? 'Puntos'
}
