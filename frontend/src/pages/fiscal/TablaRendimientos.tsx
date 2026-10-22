import { useState } from 'react'
import { TrendingDown, Download } from 'lucide-react'
import { formatEur } from '../../utils/format'
import { CryptoIcon } from '../../components/CryptoIcon'
import { TableExpandToggle } from './TableExpandToggle'
import type { RendimientoEvent } from './types'
import { fiscalDateDetail, formatFiscalDate, formatFiscalQty } from '../../utils/fiscalTable'
import { cardClasses, buttonClasses, badgeClasses, tableFootRowClasses, tableHeadRowClasses, tableRowClasses, Dropdown, Pagination } from '../../components/ui'
import { paginate, type PageSize } from '../../utils/pagination'
import { buildRendimientosCsv } from '../../utils/fiscalRendimientos'
import { usePrivacyStore } from '../../store/privacyStore'

export function TablaRendimientos({ rendimientos, year }: { rendimientos: RendimientoEvent[]; year: number }) {
  const [expanded, setExpanded]         = useState(true)
  const [filterActivo, setFilterActivo] = useState('')
  const [filterTipo, setFilterTipo]     = useState('')
  const privacy = usePrivacyStore(s => s.hidden)
  // Misma paginación que las operaciones (#299); un filtro nuevo vuelve a la página 1.
  const [size, setSize] = useState<PageSize>(25)
  const viewKey = JSON.stringify([filterActivo, filterTipo, size, rendimientos.length])
  const [pageState, setPageState] = useState({ key: viewKey, page: 1 })
  const page = pageState.key === viewKey ? pageState.page : 1

  if (rendimientos.length === 0) return null

  const activos = [...new Set(rendimientos.map(r => r.activo))].sort()
  const tipos   = [...new Set(rendimientos.map(r => r.tipo))].sort()

  const filtered = rendimientos.filter(r => {
    if (filterActivo && r.activo !== filterActivo) return false
    if (filterTipo && r.tipo !== filterTipo) return false
    return true
  })

  const totalRend = filtered.reduce((s, r) => s + r.valorEur, 0)
  const view = paginate(filtered, page, size)

  // CSV de la tabla filtrada (#313); antes descargaba la exportación completa del año.
  function exportCsv() {
    const blob = new Blob(['\uFEFF' + buildRendimientosCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rendimientos_fiscal_${year}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const porTipo = rendimientos.reduce<Record<string, number>>((acc, r) => {
    acc[r.tipo] = (acc[r.tipo] ?? 0) + r.valorEur
    return acc
  }, {})

  return (
    <div className={cardClasses('none', 'overflow-hidden')}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
        <TableExpandToggle
          icon={TrendingDown}
          title="Rendimientos del Capital Mobiliario"
          count={rendimientos.length}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(porTipo).map(([tipo, val]) => (
              <span key={tipo} className={badgeClasses('warning', 'sm', 'border border-warning/20')}>
                {tipo} · {formatEur(val)}
              </span>
            ))}
          </div>

          {expanded && (
            <>
              <Dropdown size="sm" label="Filtrar por activo" value={filterActivo} onChange={setFilterActivo} align="end"
                options={[{ value: '', label: 'Todos los activos' }, ...activos.map(a => ({ value: a, label: a }))]} />

              <Dropdown size="sm" label="Filtrar por tipo" value={filterTipo} onChange={setFilterTipo} align="end"
                options={[{ value: '', label: 'Todos los tipos' }, ...tipos.map(t => ({ value: t, label: t }))]} />

              <button type="button" onClick={exportCsv} disabled={privacy || filtered.length === 0}
                title={privacy ? 'Desactiva el modo privacidad para exportar' : 'Exportar a CSV los rendimientos de la tabla'}
                className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
                <Download size={11} aria-hidden="true" />
                {filtered.length < rendimientos.length ? 'CSV de lo filtrado' : 'CSV de rendimientos'}
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={tableHeadRowClasses()}>
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-4 py-2.5">Tipo</th>
                <th className="text-left px-4 py-2.5">Activo</th>
                <th className="text-right px-4 py-2.5">Cantidad</th>
                <th className="text-right px-4 py-2.5">Valor EUR</th>
                <th className="text-left px-4 py-2.5">Wallet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-fg-subtle text-xs">Sin rendimientos con los filtros actuales</td>
                </tr>
              ) : view.items.map((r, i) => (
                <tr key={`${r.fecha}-${r.tipo}-${r.activo}-${i}`} className={tableRowClasses()}>
                  <td className="px-4 py-2.5 text-fg-muted text-xs whitespace-nowrap">
                    <time dateTime={r.fechaHora ?? r.fecha} title={fiscalDateDetail(r.fechaHora)}>{formatFiscalDate(r.fecha)}</time>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-warning/10 text-warning-ink px-1.5 py-0.5 rounded-lg">{r.tipo}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <CryptoIcon symbol={r.activo} size={16} />
                      <span className="font-bold mono">{r.activo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-fg-muted">{formatFiscalQty(r.cantidad)}</td>
                  <td className="px-4 py-2.5 text-right mono font-medium text-warning">{formatEur(r.valorEur)}</td>
                  <td className="px-4 py-2.5 text-fg-subtle text-xs">{r.wallet}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={tableFootRowClasses()}>
                <td className="px-4 py-2.5 text-xs text-fg-subtle font-medium" colSpan={4}>
                  {filtered.length < rendimientos.length
                    ? `${filtered.length} de ${rendimientos.length} operaciones`
                    : `${filtered.length} operaciones`}
                </td>
                <td className="px-4 py-2.5 text-right mono font-bold text-warning">{formatEur(totalRend)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <Pagination label="rendimientos" page={view.page} pages={view.pages} from={view.from} to={view.to} total={view.total}
            size={size} onSize={setSize} onPage={p => setPageState({ key: viewKey, page: p })} />
        </div>
      )}
    </div>
  )
}
