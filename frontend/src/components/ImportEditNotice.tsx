import { AlertTriangle } from 'lucide-react'
import type { Transaction } from '../api/portfolio'

/**
 * Aviso al editar una transacción importada (#378): de qué archivo viene, que
 * el importador no la volverá a tocar y que se pueden restaurar sus valores.
 */
export function ImportEditNotice({ tx }: { tx: Pick<Transaction, 'import_filename' | 'original_import'> }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink">
      <AlertTriangle size={13} aria-hidden="true" className="shrink-0 mt-px" />
      <span>
        Transacción importada{tx.import_filename ? <> de <span className="font-semibold break-all">{tx.import_filename}</span></> : ''}.
        {' '}{tx.original_import ? 'Ya la editaste: se conservan los valores originales.' : 'Se guardarán sus valores originales.'}
        {' '}Podrás restaurarlos desde su detalle, y una nueva importación no la sobrescribirá.
      </span>
    </p>
  )
}
