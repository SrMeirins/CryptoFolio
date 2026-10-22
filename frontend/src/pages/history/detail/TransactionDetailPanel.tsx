import { useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, PenLine, Trash2, X } from 'lucide-react'
import type { Transaction } from '../../../api/portfolio'
import { Drawer } from '../../../components/ui/Drawer'
import { LoadingState, iconButtonClasses } from '../../../components/ui'
import { OP_META } from '../../../constants/operations'
import type { Currency } from '../../../utils/format'
import { fmtDate } from '../helpers'
import { DeleteConfirm } from '../DeleteConfirm'
import { DetailBody } from './DetailBody'
import { detailQuery } from './detailQuery'

// Panel lateral de detalle de una transacción (#373): cabecera con
// Anterior/Siguiente, editar, borrar y cerrar; el contenido va en DetailBody.
// Cambiar de transacción no remonta el Drawer: el foco sigue en su sitio.

export function TransactionDetailPanel({ id, currency, onClose, onOpen, prev, next, onEdit, onDelete, isDeleting }: {
  id: string
  currency: Currency
  onClose: () => void
  /** Abre otra transacción en el mismo panel (operaciones relacionadas). */
  onOpen: (id: string) => void
  prev: (() => void) | null
  next: (() => void) | null
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  // Confirmación de borrado ligada a la transacción: al navegar a otra se descarta.
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const confirmDelete = confirmFor === id
  const { data, isLoading, error } = useQuery(detailQuery(id))
  const tx = data?.transaction

  const meta = tx ? OP_META[tx.operation_type] : undefined
  const when = tx ? fmtDate(tx.timestamp) : null

  return (
    <Drawer onClose={onClose} labelledBy={titleId} initialFocusRef={closeRef}>
      <header className="flex items-start gap-2 px-5 py-4">
        <div className="flex-1 min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-fg truncate">
            {tx ? `${meta?.label ?? tx.operation_type} · ${tx.asset}` : 'Detalle de la transacción'}
          </h2>
          {when && <p className="text-xs text-fg-subtle">{when.date} · {when.time}</p>}
        </div>
        <button type="button" onClick={prev ?? undefined} disabled={!prev} aria-label="Transacción anterior" className={iconButtonClasses('md')}><ChevronLeft size={15} aria-hidden="true" /></button>
        <button type="button" onClick={next ?? undefined} disabled={!next} aria-label="Transacción siguiente" className={iconButtonClasses('md')}><ChevronRight size={15} aria-hidden="true" /></button>
        {tx && <button type="button" onClick={() => onEdit(tx)} aria-label="Editar transacción" className={iconButtonClasses('md', false, '', 'brand')}><PenLine size={14} aria-hidden="true" /></button>}
        {tx?.manually_added && !confirmDelete && (
          <button type="button" onClick={() => setConfirmFor(id)} aria-label="Eliminar transacción" className={iconButtonClasses('md', false, '', 'danger')}><Trash2 size={14} aria-hidden="true" /></button>
        )}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar el detalle" className={iconButtonClasses('md')}><X size={15} aria-hidden="true" /></button>
      </header>
      {tx?.manually_added && confirmDelete && (
        <div className="px-5 pb-3"><DeleteConfirm onConfirm={() => onDelete(tx.id)} onCancel={() => setConfirmFor(null)} isDeleting={isDeleting} /></div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}
        {error && <p role="alert" className="px-5 py-4 text-sm text-negative-ink">No se pudo cargar el detalle: {(error as Error).message}</p>}
        {data && <DetailBody data={data} currency={currency} onOpen={onOpen} />}
      </div>
    </Drawer>
  )
}
