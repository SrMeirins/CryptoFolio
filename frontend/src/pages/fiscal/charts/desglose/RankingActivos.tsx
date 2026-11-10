import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search, Wallet } from 'lucide-react'
import { CryptoIcon } from '../../../../components/CryptoIcon'
import { fieldClasses, Hint, SegmentedControl, StatStrip, tableHeadRowClasses } from '../../../../components/ui'
import { formatEur, formatNumber, formatPercent, pnlColor } from '../../../../utils/format'
import { filasRanking, filtrarRanking, ordenarRanking, separarOtros, totalesRanking, type ClaveOrden, type Direccion, type FilaActivo, type FiltroSigno } from '../../../../utils/desgloseActivo'
import type { BreakdownItem } from '../../types'

// Ranking por activo (#540): tira con el total de lo que se ve, columnas
// ordenables (activo, resultado, peso y operaciones), buscador y filtro por
// signo, y los que pasan de los 8 primeros en «Otros» desplegable. La fila
// abre las operaciones del activo; el icono, su detalle en Portfolio.

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`
const COLUMNAS: ReadonlyArray<{ id: ClaveOrden; label: string; align: 'left' | 'right' }> = [
  { id: 'asset', label: 'Activo', align: 'left' },
  { id: 'neto', label: 'Resultado', align: 'right' },
  { id: 'peso', label: 'Peso', align: 'left' },
  { id: 'operaciones', label: 'Operaciones', align: 'right' },
]
const SIGNOS = [
  { value: 'todos' as const, label: 'Todos' },
  { value: 'ganancia' as const, label: 'Con ganancia' },
  { value: 'perdida' as const, label: 'Con pérdida' },
]

function Fila({ f, onSelect }: { f: FilaActivo; onSelect: () => void }) {
  return (
    <tr onClick={onSelect} className="cursor-pointer transition-colors hover:bg-overlay/[0.05]">
      <th scope="row" className="py-2 pl-2 pr-3 text-left font-normal">
        {/* El botón da el acceso por teclado y el nombre accesible; la fila entera responde al ratón. */}
        <button type="button" onClick={e => { e.stopPropagation(); onSelect() }}
          aria-label={`${f.asset}: resultado ${signed(f.neto)}, ganancias ${formatEur(f.ganancias)}, pérdidas ${formatEur(f.perdidas)}. Ver sus operaciones`}
          className="inline-flex items-center gap-2 rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <CryptoIcon symbol={f.asset} size={18} />
          <span className="mono font-bold text-fg">{f.asset}</span>
        </button>
      </th>
      <td className={`py-2 px-3 text-right mono tabular-nums font-semibold whitespace-nowrap ${pnlColor(f.neto)}`}>{signed(f.neto)}</td>
      <td className="py-2 px-3 w-[30%]">
        <span className="flex items-center gap-2">
          <span className="relative h-1.5 flex-1 rounded-full bg-overlay/8 overflow-hidden" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-brand/70" style={{ width: `${f.peso}%` }} />
          </span>
          <span className="w-12 text-right mono tabular-nums text-xs text-fg-muted">{formatPercent(f.peso, 1)}</span>
        </span>
      </td>
      <td className="py-2 px-3 text-right mono tabular-nums text-fg-muted">{formatNumber(f.operaciones, 0)}</td>
      <td className="py-2 pr-2 pl-1 w-9 text-right">
        <Hint label={`Ver ${f.asset} en Portfolio`}>
          <Link to={`/portfolio?activo=${encodeURIComponent(f.asset)}`} onClick={e => e.stopPropagation()} aria-label={`Ver ${f.asset} en Portfolio`}
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-overlay/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <Wallet size={14} aria-hidden="true" />
          </Link>
        </Hint>
      </td>
    </tr>
  )
}

export function RankingActivos({ data, onSelectAsset }: { data: readonly BreakdownItem[]; onSelectAsset: (asset: string) => void }) {
  const [orden, setOrden] = useState<{ clave: ClaveOrden; dir: Direccion }>({ clave: 'peso', dir: 'desc' })
  const [texto, setTexto] = useState('')
  const [signo, setSigno] = useState<FiltroSigno>('todos')
  const [verOtros, setVerOtros] = useState(false)
  const todas = filasRanking(data)
  const visibles = ordenarRanking(filtrarRanking(todas, texto, signo), orden.clave, orden.dir)
  const filtrando = texto.trim() !== '' || signo !== 'todos'
  // Filtrando se ven todas las coincidencias; sin filtros, los 8 primeros y «Otros».
  const { principales, otros } = filtrando ? { principales: visibles, otros: [] } : separarOtros(visibles)
  const t = totalesRanking(visibles)
  const ordenarPor = (clave: ClaveOrden) => setOrden(o => ({ clave, dir: o.clave === clave && o.dir === 'desc' ? 'asc' : 'desc' }))
  const netoOtros = otros.reduce((s, f) => s + f.neto, 0)

  return (
    <div className="space-y-4">
      <StatStrip label="Totales del desglose" cells={[
        { key: 'neto', label: filtrando ? 'Resultado filtrado' : 'Resultado', value: t.neto, format: signed,
          tone: t.neto > 0.005 ? 'positive' : t.neto < -0.005 ? 'negative' : undefined },
        { key: 'activos', label: 'Activos', value: t.activos, format: v => formatNumber(v, 0) },
        { key: 'ops', label: 'Operaciones', value: t.operaciones, format: v => formatNumber(v, 0) },
      ]} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40 max-w-xs">
          <Search size={13} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input type="search" placeholder="Buscar activo..." aria-label="Buscar activo en el desglose" value={texto}
            onChange={e => setTexto(e.target.value)} className={fieldClasses('sm', false, 'pl-8')} />
        </div>
        <SegmentedControl options={SIGNOS} value={signo} onChange={setSigno} label="Filtrar por resultado" size="sm" />
      </div>
      {/* relative: el texto oculto de las cabeceras (sr-only, absoluto) queda dentro del recorte y no ensancha la página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Resultado por activo del ejercicio</caption>
          <thead>
            <tr className={tableHeadRowClasses()}>
              {COLUMNAS.map(c => {
                const activa = orden.clave === c.id
                const Icon = !activa ? ArrowUpDown : orden.dir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th key={c.id} scope="col" aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`py-2 font-medium ${c.id === 'asset' ? 'pl-2 pr-3' : 'px-3'} ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    <button type="button" onClick={() => ordenarPor(c.id)}
                      className={`inline-flex items-center gap-1 rounded hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${activa ? 'text-fg' : ''}`}>
                      {c.label} <Icon size={11} aria-hidden="true" className={activa ? '' : 'opacity-50'} />
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="py-2 pr-2"><span className="sr-only">Portfolio</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {principales.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-sm text-fg-subtle">Ningún activo coincide con el filtro.</td></tr>
            )}
            {principales.map(f => <Fila key={f.asset} f={f} onSelect={() => onSelectAsset(f.asset)} />)}
            {otros.length > 0 && (
              <tr>
                <td colSpan={5} className="py-1.5 pl-1">
                  <button type="button" onClick={() => setVerOtros(v => !v)} aria-expanded={verOtros}
                    className="w-full flex items-center gap-2 rounded-md px-1 py-1 text-left text-sm text-fg-muted hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                    <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${verOtros ? 'rotate-180' : ''}`} />
                    <span className="flex-1">{verOtros ? 'Ocultar' : 'Ver'} otros {otros.length} activos</span>
                    <span className={`mono tabular-nums text-sm ${pnlColor(netoOtros)}`}>{signed(netoOtros)}</span>
                  </button>
                </td>
              </tr>
            )}
            {verOtros && otros.map(f => <Fila key={f.asset} f={f} onSelect={() => onSelectAsset(f.asset)} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
