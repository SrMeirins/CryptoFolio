import { Filter } from 'lucide-react'
import { formatEur, pnlColor } from '../../../utils/format'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { desgloseSeries, type AssetRow } from '../../../utils/fiscalCharts'
import { FiscalChartCard } from '../FiscalChartCard'
import type { BreakdownItem } from '../types'

// Desglose por activo (#301): pérdidas a la izquierda y ganancias a la
// derecha de un eje común, 8 principales y «Otros». Pulsar un activo abre sus
// operaciones.

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`

function Row({ r, max, onSelect }: { r: AssetRow; max: number; onSelect?: () => void }) {
  const barP = (Math.abs(r.perdidas) / max) * 100
  const barG = (r.ganancias / max) * 100
  const body = (
    <>
      <span className="flex items-center gap-1.5 w-24 shrink-0 min-w-0">
        {r.otros ? <span className="size-4 rounded-full bg-overlay/10 shrink-0" aria-hidden="true" /> : <CryptoIcon symbol={r.asset} size={16} />}
        <span className="text-xs font-bold mono text-fg truncate">{r.otros ? `Otros (${r.otros})` : r.asset}</span>
      </span>
      <span className="flex-1 grid grid-cols-2 items-center gap-1 h-5" aria-hidden="true">
        <span className="flex justify-end">{barP > 0 && <span className="h-3 rounded-l bg-negative/70" style={{ width: `${Math.max(barP, 1)}%` }} />}</span>
        <span className="flex border-l border-border h-4 items-center">{barG > 0 && <span className="h-3 rounded-r bg-positive/70" style={{ width: `${Math.max(barG, 1)}%` }} />}</span>
      </span>
      <span className="w-28 text-right shrink-0 leading-tight">
        <span className={`block text-xs mono font-bold ${pnlColor(r.neto)}`}>{signed(r.neto)}</span>
        <span className="block text-[10px] mono text-fg-subtle">{r.operaciones} op.</span>
      </span>
    </>
  )
  return onSelect ? (
    <li>
      <button type="button" onClick={onSelect} aria-label={`${r.asset}: neto ${signed(r.neto)}, ganancias ${formatEur(r.ganancias)}, pérdidas ${formatEur(r.perdidas)}. Ver sus operaciones`}
        className="w-full flex items-center gap-3 rounded-lg px-1.5 py-0.5 -mx-1.5 text-left hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 transition-colors">
        {body}
      </button>
    </li>
  ) : <li className="flex items-center gap-3 px-1.5 py-0.5 -mx-1.5">{body}</li>
}

export function DesglosePorActivo({ data, onSelectAsset }: { data: BreakdownItem[]; onSelectAsset: (asset: string) => void }) {
  if (data.length === 0) return null
  const rows = desgloseSeries(data)
  const max = Math.max(...rows.map(r => Math.max(r.ganancias, Math.abs(r.perdidas))), 0.01)
  return (
    <FiscalChartCard icon={Filter} title="Desglose por activo"
      right={<span className="text-[11px] text-fg-subtle"><span className="text-negative">pérdidas</span> · <span className="text-positive">ganancias</span></span>}>
      <ul className="space-y-1.5">
        {rows.map(r => <Row key={r.asset} r={r} max={max} onSelect={r.otros ? undefined : () => onSelectAsset(r.asset)} />)}
      </ul>
    </FiscalChartCard>
  )
}
