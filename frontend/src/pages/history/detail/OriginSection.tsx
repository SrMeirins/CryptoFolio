import { Link } from 'react-router-dom'
import type { TransactionDetail } from '../../../api/portfolio'
import { fmtDate } from '../helpers'
import { importHistoryLink } from './detailLinks'

// Origen de una transacción (#373): archivo de importación y cuántas filas
// suyas agrupa (p. ej. los fills parciales de una orden).

export function OriginSection({ origin, manual }: { origin: TransactionDetail['origin']; manual: boolean }) {
  if (!origin.import) {
    return <p className="text-xs text-fg-subtle">{manual ? 'Añadida manualmente: no procede de ningún archivo.' : 'Sin archivo de origen registrado.'}</p>
  }
  const imported = fmtDate(origin.import.imported_at)
  const n = origin.source_rows
  return (
    <div className="space-y-2 text-xs">
      <p className="text-fg-muted">
        <span className="text-fg font-medium break-all">{origin.import.filename}</span> · {origin.import.exchange} · importado el {imported.date}
      </p>
      {n > 0 && <p className="text-fg-muted">Agrupa {n} {n === 1 ? 'fila' : 'filas'} del archivo.</p>}
      <p><Link to={importHistoryLink(origin.import.id)} className="text-brand-ink hover:underline">Ver todas las transacciones de este archivo</Link></p>
    </div>
  )
}
