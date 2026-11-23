import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, CalendarClock, CheckCircle2, Info, ListChecks, Scale, TrendingDown, TrendingUp, XCircle } from 'lucide-react'
import { portfolioApi, type Notification } from '../../../api/portfolio'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { AnimatedNumber } from '../../../components/AnimatedNumber'
import { PanelHeader, panelSurface, QueryError } from '../../../components/ui'
import { useCurrencyQuery } from '../../../hooks/useCurrencyQuery'
import { useLiveDayPnl } from '../../../hooks/useLiveDayPnl'
import { dailyPnlQuery, dayDetailQuery } from '../../../queries/currencyQueries'
import { useBellStore } from '../../../store/bellStore'
import { usePrivacyStore } from '../../../store/privacyStore'
import { T } from '../../../utils/colors'
import { dayMs } from '../../../utils/chartAxes'
import { fromDaily } from '../../../utils/evolutionSeries'
import { applyLiveToday } from '../../../utils/evolutionSummary'
import { rebasarVentana } from '../../../utils/evolucionVentana'
import { formatPercent, type Currency } from '../../../utils/format'
import { metricFor, localToday } from '../../../utils/pnlChart'
import { diasDelPeriodo, resumenPeriodo } from '../../../utils/pnlPeriodo'
import { FISCAL_STALE_TIME } from '../../fiscal/constants'
import {
  barrasSemana, cambioValor, diasSemana, enlaceOperaciones, opsPorDia, inicioSemana, mejorYPeor, plazosCercanos, resumenAvisos, VENTANA_PLAZOS,
} from '../../../utils/resumenSemana'
import { CeldaResumen } from './CeldaResumen'
import { BarrasSemana } from './BarrasSemana'
import { signedMoney } from '../calendar/format'

// Panel «Últimos 7 días» del Dashboard (#522): hoy y los 6 anteriores, como
// el «7 d» de P&L diario, con las mismas cifras que cada pantalla:
// - P&L del periodo (sin depósitos ni retiradas) y su %, como el resumen de
//   P&L diario; debajo, el cambio del valor y los flujos netos.
// - Mejor y peor activo por su aporte en euros (suma del detalle de cada día).
// - Operaciones con fecha en el periodo, como el Historial con ese rango.
// - Avisos pendientes de la campana y plazos fiscales abiertos o que abren
//   en 30 días.
// Con privacidad, solo porcentajes y recuentos.

const corto = (d: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)).replace('.', '')

export function ResumenSemana({ valorAhora, onIrAPnl }: {
  /** Valor de la cartera en vivo en la moneda de visualización; null sin precios. */
  valorAhora: number | null
  /** Lleva al panel P&L diario con el periodo de 7 días. */
  onIrAPnl: () => void
}) {
  const hoy = localToday()
  const desde = inicioSemana(hoy)
  const oculto = usePrivacyStore(s => s.hidden)
  const abrirCampana = useBellStore(s => s.setOpen)

  // Misma serie y mismo vivo que P&L diario.
  const pnlQ = useCurrencyQuery(c => dailyPnlQuery(c), { refetchInterval: q => (q.state.data?.refreshing ? 5_000 : 60_000) })
  const data = pnlQ.data
  const currency: Currency = data?.currency ?? pnlQ.currency
  const live = useLiveDayPnl(data?.today, currency)
  const dias = useMemo(() => (data?.days ?? []).map(d =>
    d.live && live && data?.today?.date === d.date ? { ...d, pnl: Math.round(live.pnl * 100) / 100, pct: live.pct } : d,
  ), [data, live])
  const enPeriodo = useMemo(() => diasDelPeriodo(dias, desde, hoy), [dias, desde, hoy])
  const total = useMemo(() => resumenPeriodo(enPeriodo).total, [enPeriodo])
  const pct = useMemo(() => {
    if (!data) return null
    const full = applyLiveToday(fromDaily(data.days, 'Todo'), live, metricFor('Todo'))
    const ventana = rebasarVentana(full, dayMs(desde), dayMs(hoy))
    return ventana.length ? ventana[ventana.length - 1].pct : null
  }, [data, live, desde, hoy])
  const valor = useMemo(() => (data ? cambioValor(data.days, hoy, valorAhora) : null), [data, hoy, valorAhora])

  // consulta de fondo (#498): sin el detalle de algún día, la celda dice que lo está calculando.
  const detallesQ = useQueries({ queries: diasSemana(hoy).map(d => dayDetailQuery(currency, d)) })
  const extremos = mejorYPeor(detallesQ.map(q => q.data))

  // consulta de fondo (#498): sin el recuento, la celda lo dice y lleva al Historial.
  const opsQ = useQuery({
    queryKey: ['resumen-semana-ops', desde, hoy],
    queryFn: () => portfolioApi.getHistoryStats({ granularidad: 'dia', date_from: desde, date_to: hoy }),
    staleTime: 60_000,
  })
  // consulta de fondo (#498): la misma lista que la campana, que ya avisa de su fallo.
  const { data: notificaciones = [] } = useQuery<Notification[]>({ queryKey: ['notifications'], queryFn: portfolioApi.getNotifications, refetchInterval: 60_000 })
  const avisos = resumenAvisos(notificaciones)
  // consulta de fondo (#498): sin calendario fiscal, la celda de plazos lo dice.
  const calendarioQ = useQuery({ queryKey: ['fiscal-calendario'], queryFn: portfolioApi.getFiscalCalendar, staleTime: FISCAL_STALE_TIME })
  const plazos = calendarioQ.data ? plazosCercanos(calendarioQ.data.ciclo) : null

  const tonoPnl = total > 0.005 ? T.positive : total < -0.005 ? T.negative : T.muted
  // Mismo formato que la cabecera de P&L diario, para que la cifra coincida.
  const dinero = (n: number) => signedMoney(n, currency)

  const barras = barrasSemana(hoy, enPeriodo)
  const opsDia = opsQ.data ? opsPorDia(hoy, opsQ.data.chart.buckets) : null
  const maxOps = Math.max(1, ...(opsDia ?? [0]))
  const maxAporte = extremos ? Math.max(Math.abs(extremos.mejor?.pnl ?? 0), Math.abs(extremos.peor?.pnl ?? 0), 0.01) : 1
  const primerPlazo = plazos?.[0] ?? null
  const GRAVEDAD = [
    { n: avisos.errores, texto: avisos.errores === 1 ? 'error' : 'errores', icono: XCircle, clase: 'text-negative-ink bg-negative/10' },
    { n: avisos.advertencias, texto: avisos.advertencias === 1 ? 'advertencia' : 'advertencias', icono: AlertTriangle, clase: 'text-warning-ink bg-warning/10' },
    { n: avisos.total - avisos.errores - avisos.advertencias, texto: 'informativos', icono: Info, clase: 'text-brand-ink bg-brand/10' },
  ].filter(g => g.n > 0)

  return (
    <section className={panelSurface('md', 'space-y-4')} aria-label="Últimos 7 días" data-testid="resumen-semana">
      <PanelHeader icon={CalendarClock} title="Últimos 7 días"
        subtitle={`Del ${corto(desde)} al ${corto(hoy)}, hoy en vivo`} />
      {pnlQ.isError && <QueryError what="el P&L de la semana" error={pnlQ.error} onRetry={() => void pnlQ.refetch()} />}
      <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* P&L de la semana: tarjeta destacada con las barras de cada día */}
        <CeldaResumen indice={0} grande className="sm:col-span-2 xl:col-span-1 xl:row-span-2" etiqueta="P&L de la semana" icono={total < -0.005 ? TrendingDown : TrendingUp}
          color={tonoPnl} onSelect={onIrAPnl} destino="P&L diario con los últimos 7 días">
          {data ? (
            <>
              <span className="flex items-baseline gap-2.5 flex-wrap">
                {!oculto && (
                  <span className="mono text-3xl font-bold tracking-tight tabular-nums" style={{ color: tonoPnl }} data-testid="resumen-pnl">
                    <AnimatedNumber value={total} format={dinero} countUp duration={500} />
                  </span>
                )}
                {pct !== null && (
                  <span className={`mono tabular-nums font-semibold rounded-full px-2 py-0.5 ${oculto ? 'text-2xl' : 'text-xs'}`}
                    style={{ color: tonoPnl, backgroundColor: `color-mix(in srgb, ${tonoPnl} 12%, transparent)` }}>
                    {formatPercent(pct, 2, true)}
                  </span>
                )}
              </span>
              {!oculto && valor && (
                <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg-muted">
                  <span>Valor <span className="mono text-fg">{dinero(valor.cambio)}</span></span>
                  {Math.abs(valor.flujos) >= 0.005 && <span>Flujos <span className="mono text-fg">{dinero(valor.flujos)}</span></span>}
                </span>
              )}
              <span className="mt-auto pt-4 block"><BarrasSemana barras={barras} oculto={oculto} formato={dinero} /></span>
            </>
          ) : <span className="block h-36 w-full skeleton rounded-lg" />}
        </CeldaResumen>

            {/* Mejor y peor activo por aporte */}
            <CeldaResumen indice={1} etiqueta="Mejor y peor" icono={Scale} color={T.purple}>
              {extremos ? (
                <span className="block space-y-2.5">
                  {[{ a: extremos.mejor, txt: 'Mejor', vacio: 'Ninguno en verde' }, { a: extremos.peor, txt: 'Peor', vacio: 'Ninguno en rojo' }].map(({ a, txt, vacio }) => (
                    a ? (
                      <Link key={txt} to={`/portfolio?activo=${encodeURIComponent(a.asset)}`}
                        className="block rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true"><CryptoIcon symbol={a.asset} size={22} /></span>
                          <span className="min-w-0">
                            <span className="block text-[10px] uppercase tracking-widest text-fg-subtle">{txt}</span>
                            <span className="block text-sm font-semibold text-fg truncate">{a.asset}</span>
                          </span>
                          {!oculto && <span className={`ml-auto mono text-xs font-semibold tabular-nums ${a.pnl >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>{dinero(a.pnl)}</span>}
                        </span>
                        <span aria-hidden="true" className="mt-1.5 block h-1 rounded-full bg-overlay/8 overflow-hidden">
                          <span className={`block h-full rounded-full ${a.pnl >= 0 ? 'bg-positive' : 'bg-negative'}`} style={{ width: `${Math.max(6, (Math.abs(a.pnl) / maxAporte) * 100)}%` }} />
                        </span>
                        <span className="sr-only">. Ver {a.asset} en Portfolio</span>
                      </Link>
                    ) : (
                      <span key={txt} className="flex items-center gap-2 py-1">
                        <span aria-hidden="true" className="size-[22px] rounded-full border border-dashed border-border" />
                        <span className="min-w-0">
                          <span className="block text-[10px] uppercase tracking-widest text-fg-subtle">{txt}</span>
                          <span className="block text-xs text-fg-muted">{vacio}</span>
                        </span>
                      </span>
                    )
                  ))}
                </span>
              ) : <span className="block h-16 w-full skeleton rounded-lg" />}
            </CeldaResumen>

            {/* Operaciones con fecha en el periodo, con la actividad de cada día */}
            <CeldaResumen indice={2} etiqueta="Operaciones" icono={ListChecks} color={T.info} to={enlaceOperaciones(hoy)} destino="el Historial con estos 7 días">
              {opsQ.data ? (
                <>
                  <span className="flex items-baseline gap-2">
                    <span className="mono text-2xl font-bold tabular-nums text-fg" data-testid="resumen-ops">{opsQ.data.totals.ops}</span>
                    <span className="text-[11px] text-fg-muted">
                      {opsQ.data.totals.ops === 0 ? 'ninguna esta semana' : `${opsQ.data.totals.manual} ${opsQ.data.totals.manual === 1 ? 'manual' : 'manuales'}`}
                    </span>
                  </span>
                  {opsDia && (
                    <span aria-hidden="true" className="mt-auto pt-3 grid grid-cols-7 gap-1 items-end h-10">
                      {opsDia.map((n, i) => (
                        <span key={i} className={`rounded-sm ${n > 0 ? 'bg-info' : 'bg-overlay/10'}`} style={{ height: n > 0 ? `${Math.max(18, (n / maxOps) * 100)}%` : '3px', opacity: n > 0 ? 0.85 : 1 }} />
                      ))}
                    </span>
                  )}
                </>
              ) : opsQ.isError ? (
                <span className="block text-xs text-fg-subtle">No se pudo cargar el recuento; ábrelo en el Historial.</span>
              ) : <span className="block h-12 w-20 skeleton rounded-lg" />}
            </CeldaResumen>

            {/* Avisos pendientes de la campana, por gravedad */}
            <CeldaResumen indice={3} etiqueta="Avisos" icono={Bell} color={avisos.errores ? T.negative : avisos.advertencias ? T.warning : T.brand}
              onSelect={() => abrirCampana(true)} destino="la campana de avisos">
              <span className="flex items-baseline gap-2">
                <span className="mono text-2xl font-bold tabular-nums text-fg">{avisos.total}</span>
                <span className="text-[11px] text-fg-muted">{avisos.total === 0 ? 'sin pendientes' : avisos.total === 1 ? 'pendiente' : 'pendientes'}</span>
              </span>
              {GRAVEDAD.length > 0 ? (
                <span className="mt-auto pt-3 flex flex-wrap gap-1.5">
                  {GRAVEDAD.map(({ n, texto, icono: Icono, clase }) => (
                    <span key={texto} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${clase}`}>
                      <Icono size={11} aria-hidden="true" />{n} {texto}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-auto pt-3 inline-flex items-center gap-1 text-[11px] text-positive-ink"><CheckCircle2 size={12} aria-hidden="true" />Todo en orden</span>
              )}
            </CeldaResumen>

            {/* Plazos fiscales: cuenta atrás del más cercano */}
            <CeldaResumen indice={4} etiqueta="Plazos fiscales" icono={CalendarClock} color={primerPlazo?.urgente ? T.warning : primerPlazo ? T.info : T.muted}
              to={primerPlazo?.enlace ?? '/fiscal'} destino="Fiscal">
              {plazos === null ? (
                calendarioQ.isError ? <span className="block text-xs text-fg-subtle">No se pudo cargar el calendario fiscal</span> : <span className="block h-12 w-24 skeleton rounded-lg" />
              ) : !primerPlazo ? (
                <>
                  <span className="text-sm font-semibold text-fg">Sin plazos cerca</span>
                  <span className="mt-auto pt-3 inline-flex items-center gap-1 text-[11px] text-fg-muted"><CheckCircle2 size={12} aria-hidden="true" />Ninguno en los próximos {VENTANA_PLAZOS} días</span>
                </>
              ) : (
                <>
                  <span className="flex items-baseline gap-2">
                    <span className={`mono text-2xl font-bold tabular-nums ${primerPlazo.urgente ? 'text-warning-ink' : 'text-fg'}`}>{primerPlazo.dias}</span>
                    <span className="text-[11px] text-fg-muted">{primerPlazo.abierto ? (primerPlazo.dias === 1 ? 'día para cerrar' : 'días para cerrar') : (primerPlazo.dias === 1 ? 'día para abrir' : 'días para abrir')}</span>
                  </span>
                  <span className="block text-xs font-medium text-fg truncate">{primerPlazo.titulo}{plazos.length > 1 ? `, y ${plazos.length - 1} más` : ''}</span>
                  <span className="sr-only">{primerPlazo.texto}</span>
                  {primerPlazo.abierto && (
                    <span aria-hidden="true" className="mt-auto pt-3 block">
                      <span className="block h-1.5 rounded-full bg-overlay/8 overflow-hidden">
                        <span className={`block h-full rounded-full ${primerPlazo.urgente ? 'bg-warning' : 'bg-info'}`} style={{ width: `${primerPlazo.progreso * 100}%` }} />
                      </span>
                    </span>
                  )}
                </>
              )}
            </CeldaResumen>
      </ul>
    </section>
  )
}
