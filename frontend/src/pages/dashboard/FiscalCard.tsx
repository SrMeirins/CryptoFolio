import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Landmark, Scale } from 'lucide-react'
import { portfolioApi, type FiscalYear } from '../../api/portfolio'
import { formatEur, formatPercent } from '../../utils/format'
import { EurOnlyBadge } from '../../components/EurOnlyBadge'
import { AnimatedNumber } from '../../components/AnimatedNumber'
import { PanelHeader, badgeClasses, cardClasses } from '../../components/ui'
import { fiscalSubtitle } from '../../utils/panelSubtitles'
import { baseTramosCompensada } from '../../utils/tramosIrpf'
import { deadlineFromHito, deadlineUrgency, estimatedTax, gainLossShares } from '../../utils/fiscalPanel'
import { MODELO721_LABELS, modelo721Status, pendingPricesText } from '../../utils/modelo721Status'
import { useTramos } from '../../hooks/useTramos'
import { FISCAL_STALE_TIME } from '../fiscal/constants'
import { FiscalMonthly } from './FiscalMonthly'

// Panel fiscal del Dashboard (#236): resumen compacto del ejercicio en curso
// con el G/P neto realizado, la comparación de ganancias y pérdidas, la cuota
// IRPF estimada (con pérdidas compensadas, mismo cálculo que la página Fiscal),
// el estado del Modelo 721 y la cuenta atrás a la próxima fecha fiscal.

const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const utc = (d: string) => new Date(`${d}T00:00:00Z`)
const shortDate = (d: string) => SHORT_DATE.format(utc(d)).replace('.', '')
const plural = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
const URGENCY_TEXT = { calm: 'text-brand', soon: 'text-warning', urgent: 'text-negative' } as const
const URGENCY_BAR = { calm: 'bg-brand', soon: 'bg-warning', urgent: 'bg-negative' } as const

export function FiscalCard({ data }: { data: FiscalYear[] }) {
  const currentYear = new Date().getFullYear()
  const current = data.find((fy) => fy.fiscal_year === currentYear) ?? data[data.length - 1]
  const year = current?.fiscal_year
  const tramos = useTramos()

  // Mismas consultas (y caché) que la página Fiscal.
  const { data: summary } = useQuery({
    queryKey: ['fiscal-summary-detail', year],
    queryFn: () => portfolioApi.getFiscalSummaryDetail(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  const { data: carryforward } = useQuery({ queryKey: ['fiscal-carryforward'], queryFn: portfolioApi.getFiscalCarryforward, staleTime: FISCAL_STALE_TIME })
  const { data: monthly } = useQuery({
    queryKey: ['fiscal-monthly', year],
    queryFn: () => portfolioApi.getFiscalMonthly(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  const { data: modelo721 } = useQuery({
    queryKey: ['fiscal-721', year],
    queryFn: () => portfolioApi.getFiscalModelo721(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  // Próximo plazo: el mismo hito que Fiscal y la campana, calculado en el backend (#309).
  const { data: calendario } = useQuery({ queryKey: ['fiscal-calendario'], queryFn: portfolioApi.getFiscalCalendar, staleTime: FISCAL_STALE_TIME })

  if (!current) return null

  const gainLoss = parseFloat(current.total_gain_loss_eur)
  const gains    = parseFloat(current.total_gains_eur)
  const losses   = parseFloat(current.total_losses_eur)
  const ops      = parseInt(current.num_operations, 10)
  const shares   = gainLossShares(gains, losses)
  const cfYear   = carryforward?.detalle.find(d => d.year === year)
  const base     = summary ? baseTramosCompensada(cfYear, summary.netoPatrimonial, summary.totalRendimientos) : null
  const tax      = base === null ? null : estimatedTax(base, tramos)
  const umbralPct = modelo721 ? Math.min(100, (modelo721.totalValorCustodia / modelo721.umbral) * 100) : null
  const deadline = calendario ? deadlineFromHito(calendario.proximo) : null
  const urgency = deadline ? deadlineUrgency(deadline) : 'calm'

  return (
    // Misma altura que Distribución: el gráfico mensual ocupa el espacio libre (#236).
    <div className={cardClasses('none', 'overflow-hidden h-full flex flex-col')}>
      <PanelHeader
        icon={Landmark}
        title="Fiscal"
        className="px-5 py-4 border-b border-border"
        extra={<EurOnlyBadge />}
        subtitle={fiscalSubtitle(current.fiscal_year, ops)}
        actions={<Link to="/fiscal" className="text-xs text-brand hover:underline">Detalle →</Link>}
      />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* G/P neto y cuota estimada */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-fg-subtle">G/P neto realizado</p>
            <p className={`mono text-2xl font-bold tracking-tight leading-tight ${gainLoss >= 0 ? 'text-positive' : 'text-negative'}`}>
              <AnimatedNumber value={gainLoss} countUp format={v => `${v >= 0 ? '+' : ''}${formatEur(v)}`} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-fg-subtle">IRPF estimado</p>
            <p className="mono text-lg font-semibold text-fg leading-tight">{tax === null ? '—' : formatEur(tax)}</p>
            {cfYear && cfYear.compensado > 0.01 && <p className="text-[11px] text-fg-subtle">tras compensar pérdidas</p>}
          </div>
        </div>

        {/* Ganancias frente a pérdidas */}
        <div>
          <div className="flex h-2 rounded-full overflow-hidden bg-overlay/6" role="img"
            aria-label={`Ganancias ${formatEur(gains)}, pérdidas ${formatEur(losses)}`}>
            <span className="h-full bg-positive transition-[width] duration-700" style={{ width: `${shares.gains}%` }} />
            <span className="h-full bg-negative transition-[width] duration-700" style={{ width: `${shares.losses}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-xs mono" aria-hidden="true">
            <span className="text-positive">▲ +{formatEur(gains)}</span>
            <span className="text-negative">▼ {formatEur(losses)}</span>
          </div>
        </div>

        {monthly && <FiscalMonthly meses={monthly.meses} />}

        <div className="grid grid-cols-2 gap-2">
          {/* Modelo 721 */}
          <div className="rounded-xl border border-border bg-overlay/2 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle"><Scale size={12} aria-hidden="true" /> Modelo 721</span>
            </div>
            {modelo721 ? (
              <>
                {(() => {
                  // Con precios pendientes el valor es un mínimo (#267).
                  const status = modelo721Status(modelo721)
                  return (
                    <span className={badgeClasses(status === 'obligatorio' ? 'negative' : status === 'incompleto' ? 'warning' : 'positive')}
                      title={pendingPricesText(modelo721.preciosPendientes) ?? undefined}>
                      {MODELO721_LABELS[status]}
                    </span>
                  )
                })()}
                <div className="h-1.5 rounded-full bg-overlay/6 overflow-hidden" role="img" aria-label={`${formatPercent(umbralPct ?? 0, 0)} del umbral`}>
                  <span className={`block h-full rounded-full ${modelo721.superaUmbral ? 'bg-negative' : (umbralPct ?? 0) > 75 ? 'bg-warning' : 'bg-positive'}`}
                    style={{ width: `${umbralPct}%` }} />
                </div>
                <p className="text-[11px] text-fg-subtle">{modelo721.incompleto ? 'Al menos ' : ''}{formatPercent(umbralPct ?? 0, 0)} del umbral de {formatEur(modelo721.umbral)}</p>
                {modelo721.incompleto && (
                  <p className="text-[11px] text-warning">{pendingPricesText(modelo721.preciosPendientes)}</p>
                )}
              </>
            ) : <p className="text-xs text-fg-subtle">—</p>}
          </div>

          {/* Próximo plazo (#249, #309): el mismo hito que Fiscal y la campana; lleva al calendario de Fiscal */}
          {deadline && (
          <Link to="/fiscal" className="block rounded-xl border border-border bg-overlay/2 p-3 space-y-1.5 hover:bg-overlay/4 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"
            title="Fechas habituales; consulta el calendario oficial de la AEAT">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle"><CalendarClock size={12} aria-hidden="true" /> Próximo plazo</span>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-fg leading-tight">{deadline.label}</p>
              <span className={badgeClasses(deadline.status === 'open' ? (urgency === 'calm' ? 'positive' : urgency === 'soon' ? 'warning' : 'negative') : 'neutral')}>
                {deadline.status === 'open' ? 'Abierta' : 'Pendiente de abrir'}
              </span>
            </div>
            <p className={`text-lg font-bold mono leading-tight ${URGENCY_TEXT[urgency]}`}>
              {deadline.status === 'pending'
                ? <>{deadline.opensApprox ? '~' : ''}{plural(deadline.daysToOpen)} <span className="text-[11px] font-normal text-fg-subtle whitespace-nowrap">para abrir</span></>
                : deadline.days === 0 ? 'Último día' : <>{plural(deadline.days)} <span className="text-[11px] font-normal text-fg-subtle whitespace-nowrap">para cerrar</span></>}
            </p>
            {deadline.status === 'open' && (
              <div className="h-1.5 rounded-full bg-overlay/6 overflow-hidden" role="img"
                aria-label={`${formatPercent(deadline.progress, 0)} del plazo transcurrido`}>
                <span className={`block h-full rounded-full ${URGENCY_BAR[urgency]}`} style={{ width: `${Math.max(2, deadline.progress)}%` }} />
              </div>
            )}
            <p className="text-[11px] text-fg-subtle">
              {deadline.opensApprox ? 'abre ~' + MONTH_YEAR.format(utc(deadline.opens)).replace('.', '') : 'abre ' + shortDate(deadline.opens)} · cierra {shortDate(deadline.date)}
            </p>
          </Link>
          )}
        </div>
      </div>
    </div>
  )
}
