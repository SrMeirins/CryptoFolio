import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { CryptoIcon } from '../../components/CryptoIcon'
import { usePrivacyStore } from '../../store/privacyStore'
import { niceTicks } from '../../utils/chartAxes'
import { Coins } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { EurOnlyBadge } from '../../components/EurOnlyBadge'
import { NotApplicable, PanelHeader, QueryError, SegmentedControl, Skeleton, SkeletonGroup, StatStrip, panelSurface, type StatStripCell } from '../../components/ui'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { formatEur, formatMoneyCompact } from '../../utils/format'
import { localToday } from '../../utils/pnlChart'
import { colorTipo, TIPOS, type ClaveTipo } from '../../utils/rendimientos'
import { desgloseIngresos, inicioDoceMeses, serieDoceMeses, totalesIngresos, ultimosDoceMeses, type MesSerie } from '../../utils/ingresosPasivos'
import { FISCAL_STALE_TIME } from '../fiscal/constants'

// Ingresos pasivos (#518), bajo Actividad reciente: staking, intereses,
// minería, airdrops y cashback en € al recibirlos, con los mismos datos que
// Rendimientos de Fiscal (#544; misma caché de eventos por ejercicio), así que
// los totales coinciden. Totales del año y de los últimos 12 meses, barras de
// los 12 meses por tipo con la línea del acumulado (estética de los demás
// gráficos del Dashboard: rejilla, ejes compactos, mes actual destacado y
// guías en los meses sin cobros) y desglose por activo o por wallet con una
// barra repartida por tipo; cada fila abre el Historial con esos ingresos.

const OPERACIONES = 'STAKING_REWARD,LENDING_INTEREST,LENDING_INTEREST_LOCKED,MINING_REWARD,AIRDROP,CASHBACK'
const cobros = (n: number) => `${n} ${n === 1 ? 'cobro' : 'cobros'}`

export function IngresosPasivos() {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const today = localToday()
  const anio = Number(today.slice(0, 4))
  const desde = inicioDoceMeses(today)
  const anioInicio = Number(desde.slice(0, 4))
  const [por, setPor] = useState<'activo' | 'wallet'>('activo')
  const oculto = usePrivacyStore(st => st.hidden)

  // Los ejercicios que tocan los últimos 12 meses (el actual y, si hace falta, el anterior), con la caché de Fiscal.
  const actualQ = useQuery({ queryKey: ['fiscal-events', anio], queryFn: () => portfolioApi.getFiscalEvents(anio), staleTime: FISCAL_STALE_TIME })
  const anteriorQ = useQuery({
    queryKey: ['fiscal-events', anioInicio], queryFn: () => portfolioApi.getFiscalEvents(anioInicio),
    staleTime: FISCAL_STALE_TIME, enabled: anioInicio !== anio,
  })
  // consulta de fondo (#498): sin la lista de wallets, las filas por wallet abren el Historial sin ese filtro.
  const walletsQ = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWallets })
  const rends = useMemo(() => [
    ...(anioInicio !== anio ? anteriorQ.data?.rendimientos ?? [] : []),
    ...(actualQ.data?.rendimientos ?? []),
  ], [actualQ.data, anteriorQ.data, anio, anioInicio])
  const totales = useMemo(() => totalesIngresos(rends, today), [rends, today])
  const serie = useMemo(() => serieDoceMeses(rends, today), [rends, today])
  const doce = useMemo(() => ultimosDoceMeses(rends, today), [rends, today])
  const desglose = useMemo(() => desgloseIngresos(doce, por), [doce, por])
  const tipos = TIPOS.filter(t => serie.some(m => m.porTipo[t.clave] > 0))
  const ticksMes = useMemo(() => niceTicks(0, Math.max(1, ...serie.map(m => m.total)), 3, true), [serie])
  const ticksAcum = useMemo(() => niceTicks(0, Math.max(1, ...serie.map(m => m.acumulado)), 3, true), [serie])
  const mesActual = today.slice(0, 7)
  const colorWallet = (nombre: string) => walletsQ.data?.find(w => w.name === nombre)?.color
  const idWallet = (nombre: string) => walletsQ.data?.find(w => w.name === nombre)?.id
  const historial = (miembros: string[]) => {
    const base = `/history?tipo=${OPERACIONES}&desde=${desde}`
    if (por === 'activo') return `${base}&activo=${miembros.map(encodeURIComponent).join(',')}`
    const id = miembros.length === 1 ? idWallet(miembros[0]) : undefined
    return id ? `${base}&wallet=${id}` : base
  }
  const cargando = actualQ.isLoading || (anioInicio !== anio && anteriorQ.isLoading)
  const fallo = actualQ.isError ? actualQ : anteriorQ.isError ? anteriorQ : null

  const tira: StatStripCell[] = [
    { key: 'anio', label: `Año ${anio}`, value: totales.anio, format: formatEur, sub: cobros(totales.nAnio),
      to: `/fiscal?anio=${anio}&vista=operaciones&seccion=rendimientos`, destination: 'Rendimientos de Fiscal' },
    { key: 'doce', label: 'Últimos 12 meses', value: totales.doceMeses, format: formatEur, sub: cobros(totales.nDoce),
      to: `/history?tipo=${OPERACIONES}&desde=${desde}`, destination: 'el Historial' },
  ]

  return (
    <div className={panelSurface('none', 'px-5 py-5 min-w-0')}>
      <PanelHeader
        icon={Coins}
        title="Ingresos pasivos"
        className="mb-4"
        extra={<EurOnlyBadge />}
        subtitle="Staking, intereses, minería, airdrops y cashback, en € al recibirlos"
        help={<>
          <p>Lo que has cobrado sin vender: recompensas de staking, intereses, minería, airdrops y cashback, valorado en euros el día que lo recibiste.</p>
          <p>Son los mismos datos que Rendimientos de Fiscal, así que el total del año coincide con el suyo.</p>
        </>}
        actions={<Link to={`/fiscal?anio=${anio}&vista=operaciones&seccion=rendimientos`} className="text-xs text-brand-ink hover:underline">Ver Rendimientos en Fiscal</Link>}
      />
      {fallo ? <QueryError what="los ingresos pasivos" error={fallo.error} onRetry={() => void fallo.refetch()} />
        : cargando ? (
          <SkeletonGroup label="Cargando los ingresos pasivos" className="space-y-2">
            <Skeleton className="h-14 w-full" /><Skeleton className="h-40 w-full" />
          </SkeletonGroup>
        ) : totales.nDoce === 0 && totales.nAnio === 0 ? <NotApplicable>Sin ingresos pasivos en los últimos 12 meses.</NotApplicable>
        : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-3 min-w-0">
              <StatStrip cells={tira} label="Totales de ingresos pasivos" columnas={2} />
              <figure aria-labelledby="ingresos-barras-titulo" className="space-y-1.5" data-testid="ingresos-barras">
                <figcaption id="ingresos-barras-titulo" className="text-[10.5px] uppercase tracking-widest text-fg-subtle">Por mes y tipo, últimos 12 meses</figcaption>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted" aria-label="Leyenda">
                  {tipos.map(t => (
                    <li key={t.clave} className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: colorTipo(c, t.clave) }} />{t.label}
                    </li>
                  ))}
                  <li className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block w-3.5 h-0.5 rounded-full bg-brand" />Acumulado (eje derecho)</li>
                </ul>
                <div className="h-52" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serie} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
                      <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.7} />
                      <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: c.axis }} axisLine={false} tickLine={false} interval={0} tickMargin={6}
                        tickFormatter={(l: string) => l.charAt(0).toUpperCase() + l.slice(1)} />
                      <YAxis yAxisId="mes" domain={[0, ticksMes[ticksMes.length - 1]]} ticks={ticksMes} interval={0} width={oculto ? 8 : 52}
                        tick={oculto ? false : { fontSize: 10.5, fill: c.axis }} tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="acum" orientation="right" domain={[0, ticksAcum[ticksAcum.length - 1]]} ticks={ticksAcum} interval={0} width={oculto ? 8 : 52}
                        tick={oculto ? false : { fontSize: 10.5, fill: c.axis }} tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} axisLine={false} tickLine={false} />
                      <RechartsTooltip cursor={{ fill: c.cursorSoft }} content={({ active, payload }) => {
                        const m = active && payload?.[0]?.payload as MesSerie | undefined
                        return m ? (
                          <div className="bg-background-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl min-w-40">
                            <p className="text-fg-subtle capitalize">{m.label} {m.anio}{m.ym === mesActual ? ', en curso' : ''}</p>
                            <p className="mt-0.5 mb-1 mono text-sm font-bold text-fg">{formatEur(m.total)}</p>
                            {tipos.filter(t => m.porTipo[t.clave] > 0).map(t => (
                              <p key={t.clave} className="flex justify-between gap-4">
                                <span className="inline-flex items-center gap-1.5 text-fg-subtle"><span className="inline-block size-2 rounded-sm" style={{ background: colorTipo(c, t.clave) }} />{t.label}</span>
                                <span className="mono">{formatEur(m.porTipo[t.clave])}</span>
                              </p>
                            ))}
                            <p className="mt-1 pt-1 border-t border-border flex justify-between gap-4"><span className="text-fg-subtle">Acumulado</span><span className="mono">{formatEur(m.acumulado)}</span></p>
                          </div>
                        ) : null
                      }} />
                      {tipos.map((t, i) => (
                        <Bar key={t.clave} yAxisId="mes" dataKey={(m: MesSerie) => m.porTipo[t.clave as ClaveTipo]} name={t.label} stackId="tipo" fill={colorTipo(c, t.clave)}
                          maxBarSize={28} radius={i === tipos.length - 1 ? [4, 4, 0, 0] : 0}
                          // Guía tenue en cada mes (también sin cobros) bajo la primera serie.
                          background={i === 0 ? { fill: c.cursorSoft, radius: 4 } : undefined}
                          isAnimationActive={!reduceMotion} animationDuration={650} animationEasing="ease-out">
                          {/* El mes en curso, a pleno color; el resto, un poco más suave. */}
                          {serie.map(m => <Cell key={m.ym} fillOpacity={m.ym === mesActual ? 1 : 0.78} />)}
                        </Bar>
                      ))}
                      <Line yAxisId="acum" type="monotone" dataKey="acumulado" name="Acumulado" stroke={c.brand} strokeWidth={2}
                        dot={false} activeDot={{ r: 3.5, fill: c.brand, strokeWidth: 0 }} isAnimationActive={!reduceMotion} animationDuration={800} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* Los datos del gráfico, para lectores de pantalla. */}
                <div className="sr-only">
                  <table>
                    <caption>Ingresos pasivos por mes, últimos 12 meses</caption>
                    <thead><tr><th scope="col">Mes</th><th scope="col">Total</th></tr></thead>
                    <tbody>{serie.map(m => <tr key={m.ym}><th scope="row">{m.label} {m.anio}</th><td>{formatEur(m.total)}</td></tr>)}</tbody>
                  </table>
                </div>
              </figure>
            </div>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10.5px] uppercase tracking-widest text-fg-subtle">Desglose, últimos 12 meses</p>
                <SegmentedControl label="Desglosar los ingresos por" value={por} onChange={setPor}
                  options={[{ value: 'activo', label: 'Activo' }, { value: 'wallet', label: 'Wallet' }]} />
              </div>
              <ul className="space-y-1.5" data-testid="ingresos-desglose">
                {desglose.map(f => {
                  const otros = f.clave === 'Otros'
                  return (
                    <li key={f.clave}>
                      <Link to={historial(f.miembros)}
                        aria-label={`${otros ? `Otros (${f.miembros.join(', ')})` : f.clave}: ${formatEur(f.total)}, ${Math.round(f.parte * 100)} % del total, ${cobros(f.n)}. Ver en el Historial`}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                        <span aria-hidden="true" className="shrink-0">
                          {otros ? <span className="flex size-6 items-center justify-center rounded-full bg-overlay/8 text-[10px] font-semibold text-fg-muted">+{f.miembros.length}</span>
                            : por === 'activo' ? <CryptoIcon symbol={f.clave} size={24} />
                            : <span className="block size-6 rounded-md" style={{ background: colorWallet(f.clave) ?? 'var(--cf-fg-subtle)' }} />}
                        </span>
                        <span aria-hidden="true" className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-semibold text-fg truncate">{f.clave}</span>
                            <span className="shrink-0 mono text-fg">{formatEur(f.total)}</span>
                          </span>
                          {/* Barra con el ancho de su importe frente al mayor, repartida por tipo con los colores del gráfico. */}
                          <span className="mt-1.5 flex h-2 rounded-full bg-overlay/6 overflow-hidden">
                            <span className="flex h-full rounded-full overflow-hidden transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.max(2, f.fraccion * 100)}%` }}>
                              {tipos.filter(t => f.porTipo[t.clave] > 0).map(t => (
                                <span key={t.clave} className="h-full" style={{ width: `${(f.porTipo[t.clave] / (f.total || 1)) * 100}%`, background: colorTipo(c, t.clave) }} />
                              ))}
                            </span>
                          </span>
                          <span className="mt-1 flex justify-between gap-3 text-[10.5px] text-fg-subtle">
                            <span>{cobros(f.n)}</span><span className="mono">{Math.round(f.parte * 100)} %</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
    </div>
  )
}
