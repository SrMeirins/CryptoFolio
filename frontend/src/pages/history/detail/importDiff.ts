import type { ImportOriginal, Transaction } from '../../../api/portfolio'
import { OP_META } from '../../../constants/operations'
import { formatAmount } from '../../../utils/format'
import { fmtDate } from '../helpers'

// Diferencias entre una importada editada y sus valores importados (#378).
// Función pura: los nombres de wallet llegan resueltos desde fuera.

type Field = keyof ImportOriginal
type Kind = 'text' | 'number' | 'date' | 'op' | 'wallet' | 'bool'

const FIELDS: readonly [Field, string, Kind][] = [
  ['operation_type', 'Tipo', 'op'],
  ['timestamp', 'Fecha', 'date'],
  ['asset', 'Activo', 'text'],
  ['amount', 'Cantidad', 'number'],
  ['amount_net', 'Cantidad neta', 'number'],
  ['cost_asset', 'Activo de pago', 'text'],
  ['cost_amount', 'Importe pagado', 'number'],
  ['price_per_unit', 'Precio unitario', 'number'],
  ['fee_asset', 'Activo de la comisión', 'text'],
  ['fee_amount', 'Comisión', 'number'],
  ['wallet_id', 'Wallet', 'wallet'],
  ['destination_wallet_id', 'Wallet destino', 'wallet'],
  ['destination_pending', 'Destino pendiente', 'bool'],
]

export interface DiffRow { field: Field; label: string; before: string; after: string }

type Current = Pick<Transaction, Exclude<Field, 'destination_pending'>> & { destination_pending?: boolean }

function same(kind: Kind, a: unknown, b: unknown): boolean {
  if (a == null || a === '') return b == null || b === ''
  if (b == null || b === '') return false
  if (kind === 'number') return Number(a) === Number(b)
  if (kind === 'date') return new Date(String(a)).getTime() === new Date(String(b)).getTime()
  return String(a) === String(b)
}

function show(kind: Kind, v: unknown, walletName: (id: string) => string | undefined): string {
  if (v == null || v === '') return '—'
  switch (kind) {
    case 'number': return formatAmount(String(v), 8)
    case 'date': { const d = fmtDate(String(v)); return `${d.date} ${d.time}` }
    case 'op': return OP_META[String(v)]?.label ?? String(v)
    case 'wallet': return walletName(String(v)) ?? 'Wallet eliminada'
    case 'bool': return v ? 'Sí' : 'No'
    default: return String(v)
  }
}

/** Campos que difieren del original, con sus valores legibles. */
export function importDiff(
  current: Current, original: ImportOriginal, walletName: (id: string) => string | undefined,
): DiffRow[] {
  const rows: DiffRow[] = []
  for (const [field, label, kind] of FIELDS) {
    // destination_pending no viaja en la fila: solo se compara si se conoce.
    if (field === 'destination_pending' && current.destination_pending === undefined) continue
    const before = original[field]
    const after = current[field as keyof Current]
    if (!same(kind, before, after)) rows.push({ field, label, before: show(kind, before, walletName), after: show(kind, after, walletName) })
  }
  return rows
}
