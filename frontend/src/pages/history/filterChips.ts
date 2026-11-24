import { CARD_TITLES } from './stats/summaryText'
import { OP_META, type OpGroup } from '../../constants/operations'
import type { MultiOption } from '../../components/ui'
import { fmtShort } from '../../utils/date'
import type { HistoryFilterState } from './urlState'

// Filtros activos y opciones de tipo agrupadas del Historial (#366). Desde
// #552 no se pintan como chips: cada control muestra su valor. La lista sirve
// para el recuento de «Limpiar filtros», el resumen del vacío por filtros y el
// texto de cada control. Funciones puras.

export interface FilterChip {
  id: string
  /** Texto visible del chip. */
  label: string
  /** Cambio que quita este filtro. */
  clear: Partial<HistoryFilterState>
}

const GROUP_LABELS: Record<OpGroup, string> = {
  buy: 'Compras', sell: 'Ventas', income: 'Ingresos', transfer: 'Transferencias', fee: 'Comisiones', other: 'Otras',
}
const GROUP_ORDER: OpGroup[] = ['buy', 'sell', 'income', 'transfer', 'fee', 'other']

/** Opciones del filtro de tipos, agrupadas; si se conocen los tipos presentes, solo esos. */
export function typeOptions(present?: readonly string[]): MultiOption<string>[] {
  const only = present && present.length ? new Set(present) : null
  return GROUP_ORDER.flatMap(group =>
    Object.entries(OP_META)
      .filter(([code, meta]) => meta.group === group && (!only || only.has(code)))
      .map(([code, meta]) => ({ value: code, label: meta.label, group: GROUP_LABELS[group] })))
}

export function activeChips(
  f: HistoryFilterState,
  names: { wallet: (id: string) => string | undefined; importFile: (id: string) => string | undefined; currencySymbol: string },
): FilterChip[] {
  const chips: FilterChip[] = []
  if (f.search) chips.push({ id: 'buscar', label: `Busca: «${f.search}»`, clear: { search: '' } })
  for (const t of f.types) {
    chips.push({ id: `tipo:${t}`, label: `Tipo: ${OP_META[t]?.label ?? t}`, clear: { types: f.types.filter(x => x !== t) } })
  }
  for (const a of f.assets) {
    chips.push({ id: `activo:${a}`, label: `Activo: ${a}`, clear: { assets: f.assets.filter(x => x !== a) } })
  }
  if (f.wallet_id) chips.push({ id: 'wallet', label: `Wallet: ${names.wallet(f.wallet_id) ?? '…'}`, clear: { wallet_id: '' } })
  if (f.account) chips.push({ id: 'cuenta', label: `Cuenta: ${f.account}`, clear: { account: '' } })
  if (f.date_from || f.date_to) {
    chips.push({ id: 'fechas', label: `Fechas: ${textoFechas(f.date_from, f.date_to)}`, clear: { date_from: '', date_to: '' } })
  }
  if (f.value_min || f.value_max) {
    chips.push({ id: 'importe', label: `Importe: ${textoImporte(f.value_min, f.value_max, names.currencySymbol)}`, clear: { value_min: '', value_max: '' } })
  }
  if (f.manualOnly) chips.push({ id: 'manuales', label: 'Solo manuales', clear: { manualOnly: false } })
  if (f.editedOnly) chips.push({ id: 'editadas', label: 'Solo editadas', clear: { editedOnly: false } })
  if (f.card) chips.push({ id: 'tarjeta', label: `Tarjeta: ${CARD_TITLES[f.card]}${f.includeMargin ? ' (con margen)' : ''}`, clear: { card: '' } })
  if (f.import_id) chips.push({ id: 'importacion', label: `Archivo: ${names.importFile(f.import_id) ?? '…'}`, clear: { import_id: '' } })
  return chips
}

/** Texto de un rango de fechas: «1 ene 2025 – 31 mar 2025», «desde …» o «hasta …»; vacío sin fechas. */
export function textoFechas(from: string, to: string): string {
  if (from && to) return from === to ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`
  if (from) return `desde ${fmtShort(from)}`
  if (to) return `hasta ${fmtShort(to)}`
  return ''
}

/** Texto de un rango de importes con su símbolo; vacío sin importes. */
export function textoImporte(min: string, max: string, simbolo: string): string {
  if (min && max) return `${min}–${max} ${simbolo}`
  if (min) return `≥ ${min} ${simbolo}`
  if (max) return `≤ ${max} ${simbolo}`
  return ''
}
