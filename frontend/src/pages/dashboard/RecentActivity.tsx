import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, History, X } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { OP_META } from '../../constants/operations'
import { useCurrency } from '../../hooks/useDisplayCurrency'
import { localToday } from '../../utils/pnlChart'
import {
  ACTIVITY_MAX, ACTIVITY_STALE_DAYS, agruparRafagas, dayLabel, diasDesde, filterActivity, groupByDay, limitarFilas, selectRecent, type ActivityFilter,
} from '../../utils/recentActivity'
import { semanasMapa, sumarDias } from '../../utils/actividadMapa'
import { activitySubtitle } from '../../utils/panelSubtitles'
import { PanelHeader, SegmentedControl, Skeleton, panelSurface, SkeletonGroup, FilteredEmpty, NotApplicable, QueryError } from '../../components/ui'
import { MapaActividad } from './actividad/MapaActividad'
import { TiraActividad } from './actividad/TiraActividad'
import { FilaActividad, type ItemActividad } from './actividad/FilaActividad'

// Actividad reciente (#237): línea de tiempo agrupada por día en la zona de la
// app, con filtros rápidos por tipo; cada operación abre el Historial. Desde
// #516: mapa de 26 semanas (un cuadro por día, color del tipo dominante) que
// filtra la lista por el día elegido, tira de los últimos 90 días con las
// tarjetas del Historial, ráfagas agrupadas, filtro Ingresos, aviso si la
// última operación es antigua, icono a Portfolio y dos columnas en ancho grande.

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'buy', label: 'Compras' },
  { value: 'sell', label: 'Ventas' },
  { value: 'income', label: 'Ingresos' },
  { value: 'transfer', label: 'Movimientos' },
]

export function RecentActivity() {
  const currency = useCurrency()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [dia, setDia] = useState<string | null>(null)
  const today = localToday()

  const recentQ = useQuery({
    queryKey: ['recent-transactions', currency, 100],
    queryFn: () => portfolioApi.getTransactions({ limit: '100', offset: '0' }, currency),
    refetchInterval: 60_000,
  })
  // Mapa: 26 semanas por días de la zona de la app (#516).
  const semanasVacias = useMemo(() => semanasMapa([], today), [today])
  const inicioMapa = semanasVacias[0]?.[0]?.day ?? today
  // consulta de fondo (#498): sin las estadísticas, el mapa no se muestra y la lista sigue.
  const mapaQ = useQuery({
    queryKey: ['actividad-mapa', inicioMapa, today],
    queryFn: () => portfolioApi.getHistoryStats({ granularidad: 'dia', date_from: inicioMapa, date_to: today }),
    staleTime: 5 * 60_000,
  })
  const semanas = useMemo(() => semanasMapa(mapaQ.data?.chart.buckets ?? [], today), [mapaQ.data, today])
  // Tira: los últimos 90 días con las tarjetas del Historial.
  const desde90 = sumarDias(today, -89)
  // consulta de fondo (#498): sin ella, la tira no se muestra.
  const tiraQ = useQuery({
    queryKey: ['actividad-90', desde90],
    queryFn: () => portfolioApi.getHistoryStats({ date_from: desde90 }),
    staleTime: 5 * 60_000,
  })
  // Día elegido en el mapa: sus operaciones.
  const diaQ = useQuery({
    queryKey: ['actividad-dia', dia, currency],
    queryFn: () => portfolioApi.getTransactions({ date_from: dia!, date_to: dia!, limit: '200', offset: '0' }, currency),
    enabled: dia !== null,
  })

  const fuente = dia ? diaQ : recentQ
  const { data, isLoading } = fuente
  const txs = useMemo(() => (dia ? data?.transactions ?? [] : selectRecent(recentQ.data?.transactions ?? [], today)), [dia, data, recentQ.data, today])
  const items = useMemo<ItemActividad[]>(() => txs.map(tx => ({ tx, group: OP_META[tx.operation_type]?.group ?? 'other' })), [txs])
  // Ráfagas agrupadas dentro de cada día y, como mucho, ACTIVITY_MAX filas.
  const grupos = useMemo(
    () => limitarFilas(groupByDay(filterActivity(items, filter).map(i => ({ ...i, timestamp: i.tx.timestamp })), today)
      .map(g => ({ ...g, filas: agruparRafagas(g.items) })), ACTIVITY_MAX),
    [items, filter, today],
  )
  const ultima = recentQ.data?.transactions[0]
  const antiguedad = ultima ? diasDesde(ultima.timestamp, today) : null

  return (
    <div className={panelSurface('none', 'overflow-hidden')}>
      <PanelHeader
        icon={History}
        title="Actividad reciente"
        className="px-5 py-4 border-b border-border"
        subtitle={isLoading ? undefined : dia ? `${dayLabel(dia, today)} · ${items.length} ${items.length === 1 ? 'operación' : 'operaciones'}` : activitySubtitle(items.length)}
        actions={
          <>
            {/* Con cinco filtros, en estrecho se desplaza en horizontal en vez de cortarse. */}
            <div className="max-w-full overflow-x-auto"><SegmentedControl label="Filtrar la actividad" variant="accent" value={filter} onChange={setFilter} options={FILTERS} /></div>
            <Link to="/history" className="text-xs text-brand-ink hover:underline">Ver todo en el Historial</Link>
          </>
        }
      />

      <div className="px-5 pt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        {mapaQ.data && <MapaActividad semanas={semanas} today={today} seleccionado={dia} onSeleccionar={setDia} />}
        {tiraQ.data && <TiraActividad totals={tiraQ.data.totals} desde={desde90} currency={currency} />}
      </div>

      {dia && (
        <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-fg-muted">
          <span>Mostrando {dayLabel(dia, today).toLowerCase()}</span>
          <button type="button" onClick={() => setDia(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-brand-ink hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <X size={12} aria-hidden="true" /> Quitar el día
          </button>
        </div>
      )}
      {!dia && antiguedad !== null && antiguedad > ACTIVITY_STALE_DAYS && (
        <p className="mx-5 mt-3 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink" data-testid="aviso-antiguedad">
          <AlertTriangle size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span>Tu última operación fue hace {antiguedad} días. Si has operado desde entonces, <Link to="/import" className="underline">importa los datos nuevos</Link>.</span>
        </p>
      )}

      {fuente.isError ? (
        <QueryError what="la actividad reciente" error={fuente.error} onRetry={() => void fuente.refetch()} />
      ) : isLoading ? (
        <SkeletonGroup label="Cargando la actividad" className="p-5 space-y-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </SkeletonGroup>
      ) : grupos.length === 0 ? (
        items.length === 0
          ? <NotApplicable>{dia ? 'Sin operaciones ese día.' : 'Sin operaciones en el periodo.'}</NotApplicable>
          : <FilteredEmpty summary={`Filtro: ${FILTERS.find(f => f.value === filter)?.label ?? filter}.`} onClear={() => setFilter('all')} />
      ) : (
        // Dos columnas en ancho grande: los días se reparten sin partirse.
        <div className="px-5 py-4 xl:columns-2 xl:gap-8" data-testid="lista-actividad">
          {grupos.map(g => (
            <section key={g.day} aria-label={g.label} className="break-inside-avoid mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">{g.label}</h3>
              <ol className="relative ml-1.5 border-l border-border space-y-1">
                {g.filas.map(r => <FilaActividad key={r.key} items={r.items} currency={currency} />)}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
