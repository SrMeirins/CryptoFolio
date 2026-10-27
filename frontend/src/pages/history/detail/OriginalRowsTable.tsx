import { useId, useState } from 'react'
import type { OriginalRows } from '../../../api/portfolio'
import { usedColumns, VISIBLE_ROWS } from './originalRows'

// Filas originales del CSV de una transacción (#374), tal como venían en el
// archivo. Se ocultan las columnas vacías en todas las filas y, con muchas
// filas, se muestran las primeras. El texto se pinta siempre como texto.

export function OriginalRowsTable({ table }: { table: OriginalRows }) {
  const [expanded, setExpanded] = useState(false)
  const tableId = useId()
  const cols = usedColumns(table)
  const total = table.rows.length
  const rows = expanded ? table.rows : table.rows.slice(0, VISIBLE_ROWS)

  return (
    <div className="space-y-1.5">
      {/* Con muchas columnas se desplaza en horizontal: enfocable para el teclado. */}
      <div role="region" aria-label="Filas originales del archivo, desplazable" tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
        <table id={tableId} className="w-full text-xs">
          <caption className="sr-only">Filas originales del archivo</caption>
          <thead className="bg-background-tertiary text-fg-subtle">
            <tr>{cols.map(i => <th key={i} scope="col" className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{table.columns[i]}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, n) => (
              <tr key={n} className="border-t border-border/40">
                {cols.map(i => <td key={i} className="px-2 py-1 mono text-fg-muted whitespace-nowrap">{r[i]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > VISIBLE_ROWS && (
        <button type="button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={tableId}
          className="text-brand-ink hover:underline">
          {expanded ? 'Mostrar menos' : `Mostrar las ${total} filas`}
        </button>
      )}
    </div>
  )
}
