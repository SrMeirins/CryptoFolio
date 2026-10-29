import { Fragment, useMemo, useState, type KeyboardEvent } from 'react'
import { Calendar } from 'lucide-react'
import type { Transaction } from '../../api/portfolio'
import { tableHeadRowClasses, panelSurface } from '../../components/ui'
import type { Currency } from '../../utils/format'
import { fmtDateGroup, localDayKey } from './helpers'
import { groupsByDay, type SortKey, type SortState } from './sorting'
import { SortHeader } from './SortHeader'
import { TxRow } from './TxRow'
import type { RunningBalanceView } from './balance/useRunningBalance'
import { nextRowIndex } from './keyboard/shortcutKeys'

// Tabla del Historial (#351): cabeceras ordenables, grupos por día local
// (solo ordenando por fecha) y filas de transacción.

export function HistoryTable({ transactions, sort, onSort, currency, searchTerm, selectedId, deletingId, onOpen, onPrefetch, onDelete, onEdit, skipLink, balance, walletId }: {
  transactions: Transaction[]
  sort: SortState
  onSort: (col: SortKey) => void
  currency: Currency
  searchTerm: string
  /** Transacción con el panel de detalle abierto (#373). */
  selectedId: string | null
  deletingId: string | null
  onOpen: (id: string) => void
  onPrefetch: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (tx: Transaction) => void
  /** Enlace «Saltar a la paginación», si hay más de una página. */
  skipLink?: { href: string; onActivate: () => void }
  /** Saldo corrido del activo filtrado (#380): añade la columna «Saldo». */
  balance?: RunningBalanceView | null
  /** Wallet filtrada (#395), para el sentido de las operaciones entre wallets. */
  walletId?: string
}) {
  const columns = balance ? 8 : 7
  // Foco itinerante (#382): la tabla es una sola parada de Tab (la fila activa);
  // flechas arriba/abajo e Inicio/Fin mueven entre filas, Intro abre el detalle.
  const [activeState, setActiveState] = useState<string | null>(null)
  const ids = useMemo(() => transactions.map(t => t.id), [transactions])
  const activeId = activeState && ids.includes(activeState) ? activeState
    : selectedId && ids.includes(selectedId) ? selectedId : ids[0] ?? null
  function onRowsKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    const row = (e.target as HTMLElement)
    if (row.tagName !== 'TR' || row.dataset.rowIndex === undefined) return
    const next = nextRowIndex(e.key, Number(row.dataset.rowIndex), ids.length)
    if (next === null) return
    e.preventDefault()
    setActiveState(ids[next])
    e.currentTarget.querySelector<HTMLElement>(`tr[data-row-index="${next}"]`)?.focus()
  }
  const byDay = groupsByDay(sort)
  const grouped = useMemo(() => {
    if (!byDay) return [['', transactions] as [string, Transaction[]]]
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      // Día local, el mismo de la hora que muestra la fila (no el día UTC).
      const day = localDayKey(tx.timestamp)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(tx)
    }
    return [...map.entries()]
  }, [transactions, byDay])

  return (
    <div className={panelSurface('none', 'overflow-hidden relative')}>
      {skipLink && (
        <a href={skipLink.href} onClick={e => { e.preventDefault(); skipLink.onActivate() }}
          className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:top-2 focus:left-2 focus:px-3 focus:py-1.5 focus:rounded-lg focus:bg-background-card focus:text-fg focus:text-xs focus:ring-2 focus:ring-brand">
          Saltar a la paginación
        </a>
      )}
      <table className="w-full">
        <caption className="sr-only">Transacciones del historial</caption>
        <thead>
          <tr className={tableHeadRowClasses()}>
            <SortHeader col="fecha" sort={sort} onSort={onSort} className="px-4 py-2.5">Fecha</SortHeader>
            <SortHeader col="tipo" sort={sort} onSort={onSort} className="px-3 py-2.5">Tipo</SortHeader>
            <SortHeader col="activo" sort={sort} onSort={onSort} className="px-3 py-2.5">Activo</SortHeader>
            <SortHeader col="valor" sort={sort} onSort={onSort} align="right" className="px-3 py-2.5">Valor {currency}</SortHeader>
            <th scope="col" className="text-left px-3 py-2.5 font-medium">Fee</th>
            <th scope="col" className="text-left px-3 py-2.5 font-medium">Wallet</th>
            {balance && <th scope="col" className="text-right px-3 py-2.5 font-medium">Saldo {balance.asset}</th>}
            <th scope="col" className="px-3 py-2.5 w-16"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody onKeyDown={onRowsKeyDown}>
          {grouped.map(([day, txs]) => (
            <Fragment key={day || 'todas'}>
              {byDay && (
                <tr className="bg-background-tertiary/25">
                  <th scope="rowgroup" colSpan={columns} className="px-4 py-1.5 text-left font-normal">
                    <div className="flex items-center gap-2">
                      <Calendar size={9} aria-hidden="true" className="text-fg-subtle" />
                      <span className="text-xs text-fg-subtle font-semibold">{fmtDateGroup(day)}</span>
                      <span className="text-xs text-fg-subtle">· {txs.length} {txs.length !== 1 ? 'operaciones' : 'operación'}</span>
                    </div>
                  </th>
                </tr>
              )}
              {txs.map(tx => (
                <TxRow key={tx.id} tx={tx} onDelete={onDelete} onEdit={onEdit} onOpen={onOpen} onPrefetch={onPrefetch}
                  isDeleting={deletingId === tx.id} searchTerm={searchTerm} currency={currency} selected={tx.id === selectedId}
                  balance={balance ? { asset: balance.asset, value: balance.byId.get(tx.id) } : undefined}
                  rowIndex={ids.indexOf(tx.id)} tabbable={tx.id === activeId} onActivate={setActiveState} walletId={walletId} />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
