import { useState } from 'react'
import { TrendingDown, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { formatEur } from '../../utils/format'
import { AssetLogo } from './helpers'
import type { RendimientoEvent } from './types'

export function TablaRendimientos({ rendimientos, year }: { rendimientos: RendimientoEvent[]; year: number }) {
  const [expanded, setExpanded]         = useState(true)
  const [filterActivo, setFilterActivo] = useState('')
  const [filterTipo, setFilterTipo]     = useState('')

  if (rendimientos.length === 0) return null

  const activos = [...new Set(rendimientos.map(r => r.activo))].sort()
  const tipos   = [...new Set(rendimientos.map(r => r.tipo))].sort()

  const filtered = rendimientos.filter(r => {
    if (filterActivo && r.activo !== filterActivo) return false
    if (filterTipo && r.tipo !== filterTipo) return false
    return true
  })

  const totalRend = filtered.reduce((s, r) => s + r.valorEur, 0)

  const porTipo = rendimientos.reduce<Record<string, number>>((acc, r) => {
    acc[r.tipo] = (acc[r.tipo] ?? 0) + r.valorEur
    return acc
  }, {})

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 hover:text-white transition-colors">
          <TrendingDown size={15} className="text-gray-500" />
          <span className="font-medium text-sm">Rendimientos del Capital Mobiliario</span>
          <span className="text-xs text-gray-500">({rendimientos.length} operaciones)</span>
          {expanded ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(porTipo).map(([tipo, val]) => (
              <span key={tipo} className="text-[10px] bg-accent-amber/10 text-accent-amber border border-accent-amber/20 px-2 py-0.5 rounded-full font-medium">
                {tipo} · {formatEur(val)}
              </span>
            ))}
          </div>

          {expanded && (
            <>
              <select
                value={filterActivo}
                onChange={e => setFilterActivo(e.target.value)}
                className="px-2 py-1 bg-background-tertiary border border-border rounded-lg text-[11px] text-gray-300 appearance-none cursor-pointer hover:border-gray-500 transition-colors"
              >
                <option value="">Todos los activos</option>
                {activos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>

              <select
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value)}
                className="px-2 py-1 bg-background-tertiary border border-border rounded-lg text-[11px] text-gray-300 appearance-none cursor-pointer hover:border-gray-500 transition-colors"
              >
                <option value="">Todos los tipos</option>
                {tipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <button
                onClick={() => window.open(`/api/fiscal/${year}/export?format=csv&section=rendimientos`, '_blank')}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-background-tertiary border border-border rounded-lg text-[11px] text-gray-300 hover:border-gray-500 transition-colors"
              >
                <Download size={11} />
                CSV
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-[10px] uppercase tracking-wider border-b border-border bg-background-tertiary/30">
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
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-600 text-xs">Sin rendimientos con los filtros actuales</td>
                </tr>
              ) : filtered.map((r, i) => (
                <tr key={i} className="hover:bg-background-tertiary/40 transition-colors">
                  <td className="px-4 py-2.5 mono text-gray-400 text-[11px]">{r.fecha}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] bg-accent-amber/10 text-accent-amber px-1.5 py-0.5 rounded">{r.tipo}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <AssetLogo symbol={r.activo} size={16} />
                      <span className="font-bold mono">{r.activo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-gray-400">{r.cantidad.toFixed(6)}</td>
                  <td className="px-4 py-2.5 text-right mono font-medium text-accent-amber">{formatEur(r.valorEur)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-[11px]">{r.wallet}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-background-tertiary/20">
                <td className="px-4 py-2.5 text-xs text-gray-500 font-medium" colSpan={4}>
                  {filtered.length < rendimientos.length
                    ? `${filtered.length} de ${rendimientos.length} operaciones`
                    : `${filtered.length} operaciones`}
                </td>
                <td className="px-4 py-2.5 text-right mono font-bold text-accent-amber">{formatEur(totalRend)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
