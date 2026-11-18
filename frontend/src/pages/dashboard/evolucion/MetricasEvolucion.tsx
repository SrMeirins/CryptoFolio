import { StatStrip, type StatStripCell } from '../../../components/ui'
import { formatMoney, formatPercent, type Currency } from '../../../utils/format'
import { formatPointDateShort } from '../../../utils/evolutionSeries'
import type { PeriodSummary } from '../../../utils/evolutionSummary'
import type { MetricasVentana } from '../../../utils/evolucionVentana'
import { summaryTiles } from '../../../utils/evolutionTiles'

// Tira de métricas del gráfico de evolución (#509), sobre lo visible (también
// con zoom): variación, máximo, mínimo (con la máxima caída en su ayuda),
// aportado neto, mejor y peor día. Mejor y peor día abren el detalle del día.
// Los días sin posiciones no cuentan.

const signed = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`
const tono = (n: number | null): StatStripCell['tone'] => (n === null || Math.abs(n) < 0.005 ? undefined : n > 0 ? 'positive' : 'negative')
const corta = (x: number, intraday: boolean) => formatPointDateShort(x, intraday)

export function MetricasEvolucion({ metricas, summary, modo, intraday, currency, onOpenDay }: {
  metricas: MetricasVentana | null
  summary: PeriodSummary | null
  modo: 'pnl' | 'value'
  intraday: boolean
  currency: Currency
  onOpenDay?: (day: string) => void
}) {
  if (!metricas || !summary) return null
  const [best, worst, drawdown] = summaryTiles(summary, intraday, currency)
  const variacion = modo === 'pnl' ? summary.pnl : metricas.variacionValor
  const variacionPct = modo === 'pnl' ? summary.pct : metricas.variacionPct
  const dd = summary.drawdown
  const celdas: StatStripCell[] = [
    {
      key: 'variacion', label: modo === 'pnl' ? 'Resultado' : 'Variación del valor', tone: tono(variacion),
      value: signed(variacion, currency), sub: variacionPct !== null ? formatPercent(variacionPct, 2, true) : 'en lo visible',
    },
    {
      key: 'maximo', label: 'Máximo', value: metricas.maximo ? formatMoney(metricas.maximo.valor, currency) : '—',
      sub: metricas.maximo ? corta(metricas.maximo.x, intraday) : undefined,
    },
    {
      key: 'minimo', label: 'Mínimo', value: metricas.minimo ? formatMoney(metricas.minimo.valor, currency) : '—',
      sub: dd ? `Máx. caída ${formatPercent(dd.pct, 1)}` : metricas.minimo ? corta(metricas.minimo.x, intraday) : undefined,
    },
    {
      key: 'aportado', label: 'Aportado neto', tone: tono(metricas.aportadoNeto),
      value: signed(metricas.aportadoNeto, currency), sub: 'Depósitos menos retiradas',
    },
    {
      key: 'mejor', label: best.label, tone: best.day || best.value !== '—' ? 'positive' : undefined, value: best.value,
      sub: [best.badge, best.detail].filter(Boolean).join(', '),
      ...(best.day && onOpenDay ? { onSelect: () => onOpenDay(best.day!), destination: 'el detalle del día' } : {}),
    },
    {
      key: 'peor', label: worst.label, tone: worst.day || worst.value !== '—' ? 'negative' : undefined, value: worst.value,
      sub: [worst.badge, worst.detail].filter(Boolean).join(', '),
      ...(worst.day && onOpenDay ? { onSelect: () => onOpenDay(worst.day!), destination: 'el detalle del día' } : {}),
    },
  ]
  return (
    <div className="space-y-1.5">
      <StatStrip cells={celdas} label="Métricas de lo visible en el gráfico de evolución" columnas={6} />
      {dd && (
        <p className="text-[11px] text-fg-subtle">
          {drawdown.label}: {formatPercent(dd.pct, 2)}, del {corta(dd.fromX, intraday)} al {corta(dd.toX, intraday)}. {drawdown.help}
        </p>
      )}
    </div>
  )
}
