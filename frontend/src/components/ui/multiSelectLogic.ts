// Lógica pura del desplegable de selección múltiple (#366): marcar valores y
// grupos enteros, y el texto del disparador. Sin React, para poder probarla.

export interface MultiOption<T extends string> {
  value: T
  label: string
  /** Grupo de la opción; con `groupSelectable`, su cabecera marca el grupo entero. */
  group?: string
}

/** Fila navegable de la lista: una opción o la cabecera de un grupo. */
export type MultiRow<T extends string> =
  | { kind: 'option'; option: MultiOption<T> }
  | { kind: 'group'; group: string; label: string }

export function toggleValue<T extends string>(values: readonly T[], v: T): T[] {
  return values.includes(v) ? values.filter(x => x !== v) : [...values, v]
}

/** Estado de un grupo: todas, algunas o ninguna de sus opciones marcadas. */
export function groupState<T extends string>(values: readonly T[], options: readonly MultiOption<T>[], group: string): 'all' | 'some' | 'none' {
  const members = options.filter(o => o.group === group).map(o => o.value)
  const marked = members.filter(v => values.includes(v)).length
  if (marked === 0) return 'none'
  return marked === members.length ? 'all' : 'some'
}

/** Si el grupo está entero, lo desmarca; si no, marca todas sus opciones. */
export function toggleGroup<T extends string>(values: readonly T[], options: readonly MultiOption<T>[], group: string): T[] {
  const members = options.filter(o => o.group === group).map(o => o.value)
  if (groupState(values, options, group) === 'all') return values.filter(v => !members.includes(v))
  return [...values, ...members.filter(v => !values.includes(v))]
}

/** Filas en orden: con grupos seleccionables, la cabecera de cada grupo antes de sus opciones. */
export function buildRows<T extends string>(visible: readonly MultiOption<T>[], groupSelectable: boolean): MultiRow<T>[] {
  const rows: MultiRow<T>[] = []
  visible.forEach((o, i) => {
    if (groupSelectable && o.group && o.group !== visible[i - 1]?.group) rows.push({ kind: 'group', group: o.group, label: `Todo: ${o.group}` })
    rows.push({ kind: 'option', option: o })
  })
  return rows
}

/**
 * Texto del disparador: el marcador de posición, la única opción elegida o el
 * recuento con su sustantivo («2 tipos»); sin sustantivo, «N seleccionados».
 */
export function summaryLabel<T extends string>(values: readonly T[], options: readonly MultiOption<T>[], placeholder: string, plural?: string): string {
  if (values.length === 0) return placeholder
  if (values.length === 1) return options.find(o => o.value === values[0])?.label ?? values[0]
  return `${values.length} ${plural ?? 'seleccionados'}`
}
