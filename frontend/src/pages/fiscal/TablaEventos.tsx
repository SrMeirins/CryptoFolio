import { useState, useMemo } from 'react'
import { TrendingUp, Search, Filter, ChevronDown } from 'lucide-react'
import { formatEur, pnlColor } from '../../utils/format'
import { SortIcon } from '../../components/SortIcon'
import { PNL_THRESHOLD } from './constants'
import { TableExpandToggle } from './TableExpandToggle'
import { FiscalEventRow } from './FiscalEventRow'
import type { FiscalEvent, FiscalSummary } from './types'

type SortKey = 'fecha' | 'activoTransmitido' | 'gananciaPerdidaEur' | 'valorTransmisionEur'
type SortDir  = 'asc' | 'desc'

export function TablaEventos({ events, summary }: { events: FiscalEvent[]; summary: FiscalSummary }) {
  const [expanded, setExpanded]     = useState(true)
  const [filterAsset, setFilterAsset] = useState('')
  const [filterTipo, setFilterTipo]   = useState<'all' | 'gain' | 'loss'>('all')
  const [filterFrom, setFilterFrom]   = useState('')
  const [filterTo, setFilterTo]       = useState('')
  const [sortKey, setSortKey]         = useState<SortKey>('fecha')
  const [sortDir, setSortDir]         = useState<SortDir>('asc')

  const activos = useMemo(() => {
    const set = new Set<string>()
    events.forEach(e => { set.add(e.activoTransmitido); if (e.activoRecibido) set.add(e.activoRecibido) })
    return [...set].sort()
  }, [events])

  const filtered = useMemo(() => {
    let result = events.filter(e => {
      if (filterAsset && e.activoTransmitido !== filterAsset && e.activoRecibido !== filterAsset) return false
      const gp = e.gananciaPerdidaEur ?? 0
      if (filterTipo === 'gain' && gp <= PNL_THRESHOLD) return false
      if (filterTipo === 'loss' && gp >= -PNL_THRESHOLD) return false
      if (filterFrom && e.fecha < filterFrom) return false
      if (filterTo && e.fecha > filterTo) return false
      return true
    })

    result = [...result].sort((a, b) => {
      const va: number | string = a[sortKey] ?? 0
      const vb: number | string = b[sortKey] ?? 0
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
    return result
  }, [events, filterAsset, filterTipo, filterFrom, filterTo, sortKey, sortDir])

  // Totales del tfoot en una sola pasada — antes eran 4 .reduce() separados
  // sobre `filtered`, cada uno recorriendo el array completo en cada render.
  const totales = useMemo(() => filtered.reduce((acc, e) => ({
    gananciaPerdida:    acc.gananciaPerdida    + (e.gananciaPerdidaEur ?? 0),
    valorTransmision:   acc.valorTransmision   + e.valorTransmisionEur,
    gastosTransmision:  acc.gastosTransmision  + e.gastosTransmisionEur,
    valorAdquisicion:   acc.valorAdquisicion   + e.valorAdquisicionEur,
    gastosAdquisicion:  acc.gastosAdquisicion  + e.gastosAdquisicionEur,
  }), { gananciaPerdida: 0, valorTransmision: 0, gastosTransmision: 0, valorAdquisicion: 0, gastosAdquisicion: 0 }),
  [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const hasDateFilter = filterFrom || filterTo
  const hasAnyFilter  = filterAsset || filterTipo !== 'all' || hasDateFilter

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
        <TableExpandToggle
          icon={TrendingUp}
          title="Ganancias y Pérdidas Patrimoniales"
          count={events.length}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />

        {expanded && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                className="px-2 py-1 bg-background-tertiary border border-border rounded-lg text-[11px] text-gray-300 cursor-pointer hover:border-gray-500 transition-colors"
                title="Desde"
              />
              <span className="text-gray-600 text-[10px]">—</span>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                className="px-2 py-1 bg-background-tertiary border border-border rounded-lg text-[11px] text-gray-300 cursor-pointer hover:border-gray-500 transition-colors"
                title="Hasta"
              />
              {hasDateFilter && (
                <button type="button" onClick={() => { setFilterFrom(''); setFilterTo('') }} className="text-gray-500 hover:text-gray-300 ml-0.5">
                  <ChevronDown size={12} className="rotate-90" />
                </button>
              )}
            </div>

            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              <select
                value={filterAsset}
                onChange={e => setFilterAsset(e.target.value)}
                className="pl-6 pr-6 py-1 bg-background-tertiary border border-border rounded-lg text-[11px] text-gray-300 appearance-none cursor-pointer hover:border-gray-500 transition-colors"
              >
                <option value="">Todos los activos</option>
                {activos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex bg-background-tertiary border border-border rounded-lg overflow-hidden text-[11px]">
              {(['all', 'gain', 'loss'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterTipo(t)}
                  className={`px-2.5 py-1 transition-colors ${
                    filterTipo === t
                      ? t === 'gain' ? 'bg-accent-green/20 text-accent-green'
                        : t === 'loss' ? 'bg-accent-red/20 text-accent-red'
                        : 'bg-white/10 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t === 'all' ? 'Todos' : t === 'gain' ? '▲ Ganancias' : '▼ Pérdidas'}
                </button>
              ))}
            </div>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={() => { setFilterAsset(''); setFilterTipo('all'); setFilterFrom(''); setFilterTo('') }}
                className="text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 border border-border rounded-lg transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-[10px] uppercase tracking-wider border-b border-border bg-background-tertiary/30">
                <th className="text-left px-4 py-2.5">
                  <button type="button" onClick={() => toggleSort('fecha')} className="flex items-center gap-1 hover:text-gray-300">
                    Fecha <SortIcon col="fecha" activeCol={sortKey} dir={sortDir} />
                  </button>
                </th>
                <th className="text-left px-4 py-2.5">Tipo</th>
                <th className="text-left px-4 py-2.5">
                  <button type="button" onClick={() => toggleSort('activoTransmitido')} className="flex items-center gap-1 hover:text-gray-300">
                    Operación <SortIcon col="activoTransmitido" activeCol={sortKey} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-2.5">Cantidad</th>
                <th className="text-left px-4 py-2.5">Clave AEAT</th>
                <th className="text-right px-4 py-2.5">
                  <button type="button" onClick={() => toggleSort('valorTransmisionEur')} className="flex items-center gap-1 hover:text-gray-300 ml-auto">
                    Val. Transmisión <SortIcon col="valorTransmisionEur" activeCol={sortKey} dir={sortDir} />
                  </button>
                </th>
                <th className="text-right px-4 py-2.5">Gtos.</th>
                <th className="text-right px-4 py-2.5">Val. Adquisición</th>
                <th className="text-right px-4 py-2.5">Gtos.</th>
                <th className="text-right px-4 py-2.5">
                  <button type="button" onClick={() => toggleSort('gananciaPerdidaEur')} className="flex items-center gap-1 hover:text-gray-300 ml-auto">
                    G/P € <SortIcon col="gananciaPerdidaEur" activeCol={sortKey} dir={sortDir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-600 text-xs">
                    <Filter size={20} className="mx-auto mb-2 opacity-30" />
                    Sin operaciones con los filtros actuales
                  </td>
                </tr>
              ) : filtered.map((e) => <FiscalEventRow key={e.txId} e={e} />)}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-background-tertiary/20">
                  <td className="px-4 py-2.5 text-xs text-gray-500" colSpan={5}>
                    {filtered.length < events.length
                      ? `${filtered.length} de ${events.length} operaciones`
                      : `${filtered.length} operaciones`}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs">
                    {formatEur(totales.valorTransmision)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs text-gray-500">
                    {formatEur(totales.gastosTransmision)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs">
                    {formatEur(totales.valorAdquisicion)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs text-gray-500">
                    {formatEur(totales.gastosAdquisicion)}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(totales.gananciaPerdida)}`}>
                    {totales.gananciaPerdida >= 0 ? '+' : ''}{formatEur(totales.gananciaPerdida)}
                    {filtered.length < events.length && (
                      <div className="text-[10px] text-gray-500 font-normal">
                        neto total: {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
