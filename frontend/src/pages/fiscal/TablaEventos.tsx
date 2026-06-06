import { useState, useMemo } from 'react'
import { TrendingUp, Search, Filter, ChevronUp, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { formatEur, pnlColor } from '../../utils/format'
import { AssetLogo, PNL_THRESHOLD } from './helpers'
import type { FiscalEvent, FiscalSummary } from './types'

type SortKey = 'fecha' | 'activoTransmitido' | 'gananciaPerdidaEur' | 'valorTransmisionEur'
type SortDir  = 'asc' | 'desc'

export function TablaEventos({ events, summary, year: _year }: { events: FiscalEvent[]; summary: FiscalSummary; year: number }) {
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

  const totalFiltrado = filtered.reduce((s, e) => s + (e.gananciaPerdidaEur ?? 0), 0)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={10} className="text-gray-600" />
    return sortDir === 'asc'
      ? <ArrowUp size={10} className="text-accent-blue" />
      : <ArrowDown size={10} className="text-accent-blue" />
  }

  const hasDateFilter = filterFrom || filterTo
  const hasAnyFilter  = filterAsset || filterTipo !== 'all' || hasDateFilter

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 hover:text-white transition-colors">
          <TrendingUp size={15} className="text-gray-500" />
          <span className="font-medium text-sm">Ganancias y Pérdidas Patrimoniales</span>
          <span className="text-xs text-gray-500">({events.length} operaciones)</span>
          {expanded ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
        </button>

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
                <button onClick={() => { setFilterFrom(''); setFilterTo('') }} className="text-gray-500 hover:text-gray-300 ml-0.5">
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
                  <button onClick={() => toggleSort('fecha')} className="flex items-center gap-1 hover:text-gray-300">
                    Fecha <SortIcon col="fecha" />
                  </button>
                </th>
                <th className="text-left px-4 py-2.5">Tipo</th>
                <th className="text-left px-4 py-2.5">
                  <button onClick={() => toggleSort('activoTransmitido')} className="flex items-center gap-1 hover:text-gray-300">
                    Operación <SortIcon col="activoTransmitido" />
                  </button>
                </th>
                <th className="text-right px-4 py-2.5">Cantidad</th>
                <th className="text-left px-4 py-2.5">Clave AEAT</th>
                <th className="text-right px-4 py-2.5">
                  <button onClick={() => toggleSort('valorTransmisionEur')} className="flex items-center gap-1 hover:text-gray-300 ml-auto">
                    Val. Transmisión <SortIcon col="valorTransmisionEur" />
                  </button>
                </th>
                <th className="text-right px-4 py-2.5">Gtos.</th>
                <th className="text-right px-4 py-2.5">Val. Adquisición</th>
                <th className="text-right px-4 py-2.5">Gtos.</th>
                <th className="text-right px-4 py-2.5">
                  <button onClick={() => toggleSort('gananciaPerdidaEur')} className="flex items-center gap-1 hover:text-gray-300 ml-auto">
                    G/P € <SortIcon col="gananciaPerdidaEur" />
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
              ) : filtered.map((e, i) => {
                const gp    = e.gananciaPerdidaEur ?? 0
                const isFee  = ['FEE_EXCHANGE', 'FEE_NETWORK', 'FEE'].includes(e.tipo)
                const isLost = ['LOST', 'GIFT_SENT'].includes(e.tipo)
                const qty    = e.cantidadTransmitida
                return (
                  <tr key={i} className="hover:bg-background-tertiary/40 transition-colors">
                    <td className="px-4 py-2.5 mono text-gray-400 text-[11px]">{e.fecha}</td>
                    <td className="px-4 py-2.5">
                      {isFee ? (
                        <span className="text-[10px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded">Fee</span>
                      ) : isLost ? (
                        <span className="text-[10px] bg-accent-red/10 text-accent-red px-1.5 py-0.5 rounded">Pérdida</span>
                      ) : (
                        <span className="text-[10px] bg-background-tertiary text-gray-400 px-1.5 py-0.5 rounded">{e.tipo}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 min-w-[140px]">
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <AssetLogo symbol={e.activoTransmitido} size={15} />
                        <span className="font-bold mono text-[11px]">{e.activoTransmitido}</span>
                        {e.activoRecibido ? (
                          <>
                            <span className="text-gray-600 text-[10px] mx-0.5">→</span>
                            <AssetLogo symbol={e.activoRecibido} size={15} />
                            <span className="font-bold mono text-[11px]">{e.activoRecibido}</span>
                          </>
                        ) : isFee ? (
                          <span className="text-gray-600 text-[10px]">→ fee</span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-gray-600 mt-0.5">{e.wallet}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-[11px] text-gray-500">
                      {qty >= 0.01
                        ? qty >= 1000
                          ? qty.toLocaleString('es-ES', { maximumFractionDigits: 2 })
                          : qty >= 1
                            ? qty.toFixed(4)
                            : qty.toFixed(6)
                        : qty.toExponential(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="bg-background-tertiary px-1.5 py-0.5 rounded text-gray-300 font-mono text-[10px]">
                        {e.contrapartidaClave}
                      </span>
                      <span className="ml-1.5 text-gray-500 text-[10px]">{e.contrapartidaDescripcion}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorTransmisionEur)}</td>
                    <td className="px-4 py-2.5 text-right mono text-gray-500">{formatEur(e.gastosTransmisionEur)}</td>
                    <td className="px-4 py-2.5 text-right mono">{formatEur(e.valorAdquisicionEur)}</td>
                    <td className="px-4 py-2.5 text-right mono text-gray-500">{formatEur(e.gastosAdquisicionEur)}</td>
                    <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(gp)}`}>
                      {Math.abs(gp) < PNL_THRESHOLD
                        ? <span className="text-gray-500 font-normal">0,00 €</span>
                        : <>{gp > 0 ? '+' : ''}{formatEur(gp)}</>}
                    </td>
                  </tr>
                )
              })}
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
                    {formatEur(filtered.reduce((s, e) => s + e.valorTransmisionEur, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs text-gray-500">
                    {formatEur(filtered.reduce((s, e) => s + e.gastosTransmisionEur, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs">
                    {formatEur(filtered.reduce((s, e) => s + e.valorAdquisicionEur, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-xs text-gray-500">
                    {formatEur(filtered.reduce((s, e) => s + e.gastosAdquisicionEur, 0))}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono font-bold ${pnlColor(totalFiltrado)}`}>
                    {totalFiltrado >= 0 ? '+' : ''}{formatEur(totalFiltrado)}
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
