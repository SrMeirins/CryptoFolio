import { OP_META, type OpGroup } from '../../constants/operations'
import type { MultiOption } from '../../components/ui'
import { fmtShort } from '../../utils/date'
import type { HistoryFilterState } from './urlState'

// Chips de filtros activos y opciones de tipo agrupadas del Historial (#366).
// Funciones puras: el componente solo las pinta.

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
    const label = f.date_from && f.date_to
      ? (f.date_from === f.date_to ? fmtShort(f.date_from) : `${fmtShort(f.date_from)} – ${fmtShort(f.date_to)}`)
      : f.date_from ? `desde ${fmtShort(f.date_from)}` : `hasta ${fmtShort(f.date_to)}`
    chips.push({ id: 'fechas', label: `Fechas: ${label}`, clear: { date_from: '', date_to: '' } })
  }
  if (f.value_min || f.value_max) {
    const s = names.currencySymbol
    const label = f.value_min && f.value_max ? `${f.value_min}–${f.value_max} ${s}`
      : f.value_min ? `≥ ${f.value_min} ${s}` : `≤ ${f.value_max} ${s}`
    chips.push({ id: 'importe', label: `Importe: ${label}`, clear: { value_min: '', value_max: '' } })
  }
  if (f.manualOnly) chips.push({ id: 'manuales', label: 'Solo manuales', clear: { manualOnly: false } })
  if (f.editedOnly) chips.push({ id: 'editadas', label: 'Solo editadas', clear: { editedOnly: false } })
  if (f.import_id) chips.push({ id: 'importacion', label: `Archivo: ${names.importFile(f.import_id) ?? '…'}`, clear: { import_id: '' } })
  return chips
}
