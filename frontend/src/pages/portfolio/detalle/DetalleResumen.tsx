import { Calculator } from 'lucide-react'
import type { AssetSales } from '../../../api/portfolio'
import { BreakEvenCell } from '../../../components/BreakEvenCell'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { Button, StatStrip, type StatStripCell } from '../../../components/ui'
import { totalReturn } from '../../../utils/assetPriceChart'
import { formatAmount, formatMoney, formatPercent, formatPrice, type Currency } from '../../../utils/format'
import { breakEvenDistance } from '../../../utils/portfolioView'
import { formatLotDate } from '../../../utils/portfolioLots'
import { recoveryText } from '../../../utils/fxEffect'
import type { CryptoRow } from '../../../utils/assetTable'

// Resumen del activo en el panel de detalle (#528): una tira de métricas
// (StatStrip, #490) con la posición y la rentabilidad total, y debajo el
// break-even en palabras con el botón del simulador.

const signed = (v: number, currency: Currency) => `${v >= 0 ? '+' : ''}${formatMoney(v, currency)}`
const tone = (v: number | null): StatStripCell['tone'] => (v === null || v === 0 ? undefined : v > 0 ? 'positive' : 'negative')

export function DetalleResumen({ row, price, currency, rate, sales, onSimulate }: {
  row: CryptoRow
  price: number
  currency: Currency
  rate: number | null
  sales: AssetSales | undefined
  onSimulate: () => void
}) {
  const hasPrice = price > 0
  const pnl = hasPrice ? row.value - row.totalCostBasis : null
  const pnlPct = pnl !== null && row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : null
  const avg = row.totalQuantity > 0 ? row.totalCostBasis / row.totalQuantity : null
  const distance = avg !== null ? breakEvenDistance(price, avg) : null
  // Rentabilidad total (#284): el realizado es fiscal (EUR) y se convierte al cambio en vivo.
  const total = sales && rate !== null ? totalReturn(sales.realizedEur, pnl, rate) : null
  const conVentas = !!sales && (sales.count > 0 || sales.realizedEur !== 0)

  const cells: StatStripCell[] = [
    { key: 'valor', label: 'Valor', value: hasPrice ? formatMoney(row.value, currency) : '—', sub: `${formatAmount(row.totalQuantity)} ${row.asset}` },
    { key: 'coste', label: 'Coste base', value: formatMoney(row.totalCostBasis, currency) },
    { key: 'medio', label: 'Precio medio', value: avg !== null ? formatPrice(avg, currency) : '—', sub: hasPrice ? `Actual ${formatPrice(price, currency)}` : undefined },
    {
      key: 'no-realizado', label: 'No realizado', tone: tone(pnl),
      value: pnl !== null ? signed(pnl, currency) : '—',
      sub: pnlPct !== null ? formatPercent(pnlPct, 2, true) : undefined,
    },
  ]
  if (total && conVentas && sales) {
    cells.push(
      {
        key: 'realizado', label: 'Realizado', tone: tone(total.realized), value: signed(total.realized, currency),
        sub: sales.count === 0 ? 'Sin ventas'
          : `${sales.count} ${sales.count === 1 ? 'venta' : 'ventas'}${sales.lastSaleAt ? `, última el ${formatLotDate(sales.lastSaleAt)}` : ''}`,
      },
      {
        key: 'total', label: 'Rentabilidad total', tone: tone(total.total),
        value: total.total !== null ? signed(total.total, currency) : '—',
        sub: <span className="inline-flex items-center gap-1">Realizado más no realizado
          <InfoTooltip label="Cómo se calcula la rentabilidad total">
            <p>Realizado (ventas, permutas y comisiones pagadas con {row.asset}, como en Fiscal) más el no realizado de la posición actual.</p>
            {sales.otherRealizedEur !== 0 && (
              <p className="mt-1.5">Incluye {formatMoney(sales.otherRealizedEur * (rate ?? 1), currency)} de comisiones u otros consumos que no son ventas.</p>
            )}
            {currency !== 'EUR' && <p className="mt-1.5 text-fg-subtle">El realizado es un dato fiscal en EUR; aquí se muestra al cambio actual.</p>}
          </InfoTooltip></span>,
      },
    )
  }

  return (
    <div className="space-y-3">
      {/* Tres por fila (dos en móvil): cada cifra y su línea secundaria caben enteras en el panel. */}
      <StatStrip cells={cells} label={`Resumen de ${row.asset}`} columnas={cells.length === 4 ? 4 : 3} />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-overlay/2 px-3 py-2.5">
        <div className="text-xs text-fg-muted">
          {distance === null
            ? 'Sin precio actual para calcular el break-even.'
            : distance.pct >= 0
              ? <>En beneficio: el precio está un <span className="mono text-positive-ink">{formatPercent(distance.pct, 1)}</span> por encima de tu precio medio.</>
              : <>Para recuperar lo invertido, el precio tiene que subir un <span className="mono text-negative-ink">{formatPercent(distance.toRecover, 1)}</span>{' '}
                  <InfoTooltip label="Por qué la subida es mayor que la caída">
                    <p>{recoveryText(distance.pct)}</p>
                    <p className="mt-1.5 text-fg-subtle">Ejemplo: tras caer un 50 %, hace falta subir un 100 % para volver al precio inicial.</p>
                  </InfoTooltip>.</>}
        </div>
        <div className="shrink-0"><BreakEvenCell price={price} avgPrice={avg} currency={currency} /></div>
      </div>
      <Button variant="primary" size="sm" onClick={onSimulate} disabled={!hasPrice}>
        <Calculator size={14} aria-hidden="true" /> Simular venta
      </Button>
    </div>
  )
}
