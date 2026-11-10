import { useRef, useState } from 'react'
import { BookOpen, Hourglass } from 'lucide-react'
import { formatEur } from '../../utils/format'
import { appToday } from '../../utils/datePresets'
import { anchoEscalaComun, caducanEsteAnio, origenesView, totalCaducado } from '../../utils/perdidasPendientes'
import { buttonClasses, Notice, StatStrip, tableHeadRowClasses, type StatStripCell } from '../../components/ui'
import { ComoCalculamos } from '../../components/metodologia'
import { FiscalChartCard } from './FiscalChartCard'
import { FilaPerdida, PROVISIONAL_CLS } from './perdidas/FilaPerdida'
import type { Carryforward } from './types'

// Pérdidas pendientes por año de origen (#305, #541): tira pulsable con el
// total pendiente, la provisional del año en curso y lo que caduca este año;
// barras en una escala común con lo compensado, pendiente y caducado; cuenta
// atrás hasta la caducidad; consejo de ir a Planificar si algo caduca este
// año; detalle año a año y «¿Cómo funciona?» con la regla (#493).

/** Aviso de las pérdidas que caducan el 31 de diciembre; también lo usa la cabecera del año. */
export function AvisoCaducidad({ importe, years, compact = false }: { importe: number; years: number[]; compact?: boolean }) {
  return (
    <Notice tipo="aviso" icon={Hourglass} compact={compact}>
      <span className="mono font-semibold text-warning-ink">{formatEur(importe)}</span> de pérdidas de {years.join(' y ')} caducan el 31 de diciembre:
      puedes realizar esa ganancia este año sin tributar por ella.
    </Notice>
  )
}

export function PerdidasPendientes({ data, onPlanificar, hoy = appToday() }: {
  data: Carryforward
  /** Abre Planificar, para aprovechar lo que caduca este año. */
  onPlanificar: () => void
  /** Hoy en la zona de la app (AAAA-MM-DD); se inyecta en los tests. */
  hoy?: string
}) {
  const [ayuda, setAyuda] = useState(false)
  const [resaltada, setResaltada] = useState<number | null>(null)
  const filas = useRef(new Map<number, HTMLTableRowElement>())
  const origenes = data.origenes ?? []
  if (origenes.length === 0) return null
  // El último ejercicio del cálculo es el año en curso (Madrid), según el backend.
  const currentYear = data.detalle.at(-1)?.year ?? new Date().getFullYear()
  const view = origenesView(origenes, currentYear)
  const ancho = anchoEscalaComun(view)
  const caducado = totalCaducado(origenes)
  const caducan = caducanEsteAnio(origenes, currentYear)
  const provisional = data.pendienteProvisional ?? 0

  // Baja a la fila, le pasa el foco y la destaca un momento.
  const irA = (year: number | undefined) => {
    if (year === undefined) return
    const el = filas.current.get(year)
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
    setResaltada(year)
    window.setTimeout(() => setResaltada(r => (r === year ? null : r)), 2000)
  }
  const primeraPendiente = view.find(o => o.estado === 'vigente' || o.estado === 'caduca-este-anio')?.year
  const filaProvisional = view.find(o => o.estado === 'provisional')?.year

  const tira: StatStripCell[] = [
    { key: 'pendiente', label: 'Pendiente', value: data.pendienteTotal, format: formatEur, sub: 'de ejercicios cerrados',
      ...(primeraPendiente !== undefined && { onSelect: () => irA(primeraPendiente), destination: 'la lista de pérdidas' }) },
    ...(provisional > 0.005 ? [{ key: 'provisional', label: 'Provisional', value: provisional, format: formatEur, sub: 'año en curso, no suma',
      ...(filaProvisional !== undefined && { onSelect: () => irA(filaProvisional), destination: 'la lista de pérdidas' }) }] : []),
    { key: 'caducan', label: 'Caduca este año', value: caducan?.importe ?? 0, format: formatEur,
      tone: caducan ? 'warning' as const : undefined, sub: caducan ? `de ${caducan.years.join(' y ')}` : 'nada',
      ...(caducan && { onSelect: onPlanificar, destination: 'Planificar' }) },
  ]

  return (
    <FiscalChartCard icon={Hourglass} title="Pérdidas pendientes de compensar"
      right={
        <button type="button" onClick={() => setAyuda(true)} aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 text-xs text-brand-ink hover:underline rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <BookOpen size={13} aria-hidden="true" /> ¿Cómo funciona?
        </button>
      }>
      <StatStrip label="Resumen de pérdidas pendientes" cells={tira} className="mb-4" />
      {caducan && (
        <Notice tipo="consejo" compact className="mb-4"
          action={<button type="button" onClick={onPlanificar} className={buttonClasses('primary', 'sm')}>Planificar</button>}>
          <span className="mono font-semibold">{formatEur(caducan.importe)}</span> de {caducan.years.join(' y ')} caducan el 31 de diciembre.
          En Planificar puedes ver qué ventas con ganancia las aprovecharían sin tributar.
        </Notice>
      )}
      {/* Tabla alineada (#541). relative: el texto oculto de las cabeceras no ensancha la página (#540). */}
      <div className="relative overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Pérdidas por año de origen</caption>
          <colgroup>
            <col className="w-16" /><col className="w-36" /><col /><col className="w-32" /><col className="w-36" /><col className="w-10" />
          </colgroup>
          <thead>
            <tr className={tableHeadRowClasses()}>
              <th scope="col" className="py-2 pl-3 pr-2 text-left font-medium">Año</th>
              <th scope="col" className="py-2 px-2 text-left font-medium">Estado</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Escala común</th>
              <th scope="col" className="py-2 px-3 text-right font-medium">Pendiente</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Caduca</th>
              <th scope="col" className="py-2 pr-2"><span className="sr-only">Detalle</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {view.map(o => (
              <FilaPerdida key={o.year} o={o} ancho={ancho(o.original)} hoy={hoy} resaltada={resaltada === o.year}
                ref={el => { if (el) filas.current.set(o.year, el); else filas.current.delete(o.year) }} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-[11px] text-fg-subtle">
        <p className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive/70" aria-hidden="true" />Compensado</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-info/70" aria-hidden="true" />Pendiente</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning" aria-hidden="true" />Caduca este año</span>
          {view.some(o => o.estado === 'provisional') && (
            <span className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${PROVISIONAL_CLS}`} aria-hidden="true" />Año en curso (provisional)</span>
          )}
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-fg-subtle/30" aria-hidden="true" />Caducado</span>
        </p>
        <p>Todas las barras usan la misma escala: su longitud es la pérdida de ese año frente a la mayor.</p>
        {caducado > 0.005 && <p>Caducadas sin usar en total: <span className="mono text-fg-muted">{formatEur(caducado)}</span>.</p>}
      </div>
      {ayuda && <ComoCalculamos inicial="compensacion" onClose={() => setAyuda(false)} />}
    </FiscalChartCard>
  )
}
