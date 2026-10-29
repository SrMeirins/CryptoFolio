import type { BackupPreview } from '../../../api/backup'
import { formatNumber } from '../../../utils/format'
import { BACKUP_TABLE_LABELS } from '../../../utils/backupFile'

// Qué trae la copia frente a lo que hay ahora (#453). Solo las filas con
// datos en alguno de los dos lados; las diferencias se marcan en texto, no
// solo con color.
export function BackupPreviewTable({ preview }: { preview: BackupPreview }) {
  const rows = BACKUP_TABLE_LABELS
    .map(r => ({ ...r, copia: preview.counts[r.table] ?? 0, ahora: preview.current[r.table] ?? 0 }))
    .filter(r => r.copia > 0 || r.ahora > 0)
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Contenido de la copia frente a los datos actuales</caption>
      <thead>
        <tr className="text-xs text-fg-subtle border-b border-border">
          <th scope="col" className="text-left font-medium py-1.5">Datos</th>
          <th scope="col" className="text-right font-medium py-1.5">En la copia</th>
          <th scope="col" className="text-right font-medium py-1.5">Ahora</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map(r => {
          const diff = r.copia - r.ahora
          return (
            <tr key={r.table} data-tabla={r.table}>
              <th scope="row" className="text-left font-normal py-1.5">{r.label}</th>
              <td className="text-right mono tabular-nums py-1.5">
                {formatNumber(r.copia, 0)}
                {diff !== 0 && (
                  <span className={`ml-1.5 text-[11px] ${diff < 0 ? 'text-warning-ink' : 'text-fg-subtle'}`}>
                    ({diff > 0 ? '+' : ''}{formatNumber(diff, 0)})
                  </span>
                )}
              </td>
              <td className="text-right mono tabular-nums py-1.5 text-fg-muted">{formatNumber(r.ahora, 0)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
