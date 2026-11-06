import { Repeat } from 'lucide-react'
import { Notice, Tooltip } from '../../components/ui'
import { formatEur } from '../../utils/format'
import type { RecompraSummary as Summary } from '../../utils/fiscalOperations'

// Resumen de pérdidas posiblemente diferidas del año (#299): una sola
// explicación arriba en lugar del aviso repetido en cada fila.
export function RecompraSummary({ data, active, onToggle }: { data: Summary; active: boolean; onToggle: () => void }) {
  if (data.count === 0) return null
  const assets = data.topAssets.map(a => `${a.asset} (${a.count})`).join(', ')
  return (
    <Notice tipo="aviso" icon={Repeat} className="mx-4 mt-4" action={
      <button type="button" onClick={onToggle} aria-pressed={active}
        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-warning/60 ${active ? 'border-warning/50 bg-warning/15 text-warning-ink' : 'border-border text-fg-muted hover:text-fg'}`}>
        {active ? 'Ver todas' : 'Ver solo estas'}
      </button>
    }>
      <span className="font-semibold text-fg">{data.count} {data.count === 1 ? 'pérdida posiblemente diferida' : 'pérdidas posiblemente diferidas'}</span>
      {' · '}<span className="mono text-negative">{formatEur(data.amount)}</span>
      {assets && <> · sobre todo {assets}</>}{' '}
      <Tooltip label="Regla de recompra (art. 33.5 LIRPF)">
        <p>Si vendes con pérdida y compras el mismo activo en los 2 meses anteriores o posteriores, la pérdida no se integra hasta que vendas esa recompra.</p>
        <p className="mt-1.5 text-fg-subtle">Su aplicación a criptoactivos no es pacífica. Con stablecoins que compras a menudo (USDC, USDT) casi cualquier pérdida queda marcada. Consúltalo con tu asesor.</p>
      </Tooltip>
    </Notice>
  )
}
