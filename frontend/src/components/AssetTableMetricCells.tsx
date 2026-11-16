import { formatMoney, formatPercent, pnlColor, type Currency } from '../utils/format'
import { formatAge } from '../utils/portfolioLots'
import { CATEGORIA_LABEL, edadCorta, type RowMetrics } from '../utils/positionMetrics'
import { TextTooltip } from './ui'

// Celdas de las columnas nuevas de la tabla de posiciones (#527).

const dash = <span className="text-fg-subtle text-xs">—</span>

/** Importe con signo y color; el signo lo hace legible sin color. */
export function SignedMoney({ value, currency, className = '' }: { value: number; currency: Currency; className?: string }) {
  return <span className={`${pnlColor(value)} ${className}`}>{value >= 0 ? '+' : ''}{formatMoney(value, currency)}</span>
}

export function ResultadoCell({ m, currency }: { m: RowMetrics | undefined; currency: Currency }) {
  if (!m || m.resultado === null) return dash
  const firmado = (v: number) => `${v >= 0 ? '+' : ''}${formatMoney(v, currency)}`
  // Desglose solo en el globo (#527): qué parte es lo que aún tienes y qué parte ya se materializó.
  const tip = (
    <span className="block space-y-1 text-left">
      <span className="flex justify-between gap-4"><span>No realizado (lo que tienes)</span><span className="mono">{firmado(m.noRealizado ?? 0)}</span></span>
      {m.realizadoPartes.length === 0
        ? <span className="block text-fg-subtle">Sin ventas, permutas ni comisiones pagadas con este activo.</span>
        : m.realizadoPartes.map(p => (
          <span key={p.categoria} className="flex justify-between gap-4">
            <span>{CATEGORIA_LABEL[p.categoria]} ({p.operations} {p.operations === 1 ? 'operación' : 'operaciones'})</span>
            <span className="mono">{firmado(p.value)}</span>
          </span>
        ))}
      <span className="flex justify-between gap-4 border-t border-border pt-1 font-medium"><span>Resultado total</span><span className="mono">{firmado(m.resultado)}</span></span>
      {m.realizadoPartes.some(p => p.categoria === 'comisiones') && (
        <span className="block text-fg-subtle">Pagar una comisión con el activo cuenta como transmisión: lo que valía al pagarla menos lo que costó.</span>
      )}
    </span>
  )
  return (
    <TextTooltip label="Resultado total" tip={tip}>
      <SignedMoney value={m.resultado} currency={currency} className="font-medium" />
    </TextTooltip>
  )
}

export function AntiguedadCell({ m }: { m: RowMetrics | undefined }) {
  if (!m || m.ageDays === null) return dash
  return <TextTooltip label="Antigüedad" tip={formatAge(m.ageDays)}><span className="text-fg-muted">{edadCorta(m.ageDays)}</span></TextTooltip>
}

export function MaximoCell({ m, currency }: { m: RowMetrics | undefined; currency: Currency }) {
  if (!m?.desdeMaximo) return dash
  const { pct, max } = m.desdeMaximo
  const enMaximo = pct > -0.05
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={enMaximo ? 'text-positive-ink font-medium' : 'text-fg'}>{enMaximo ? 'En máximo' : formatPercent(pct, 1, true)}</span>
      <span className="text-[11px] leading-none text-fg-subtle whitespace-nowrap">máx. {formatMoney(max, currency)}</span>
    </div>
  )
}

export function IngresosCell({ m, currency }: { m: RowMetrics | undefined; currency: Currency }) {
  if (!m?.ingresos) return dash
  const n = m.ingresos.operations
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-fg">{formatMoney(m.ingresos.value, currency)}</span>
      <span className="text-[11px] leading-none text-fg-subtle whitespace-nowrap">{n} {n === 1 ? 'renta' : 'rentas'}</span>
    </div>
  )
}
