import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { optionForKey } from '../../utils/segmented'
import { ESTADO_EJERCICIO_LABEL, encajeCarrusel, estadoEjercicio, repartoGananciasPerdidas, type EstadoEjercicio } from '../../utils/fiscalNav'
import { formatEur, formatNumber } from '../../utils/format'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { IconButton } from '../../components/ui'
import type { YearOverview } from './types'

// Ejercicios como tarjetas con estado (#536), en Resumen: estado (en curso,
// por declarar, declarado, según la marca de la renta), neto, operaciones y
// barra de ganancias frente a pérdidas con su reparto en texto. Son el
// selector de año de la vista (patrón tablist: flechas, Inicio y Fin) y la
// elegida se refleja en ?anio=.
//
// Carrusel ajustado: solo se ven tarjetas completas, todas del mismo ancho y
// alineadas a los dos bordes del contenido (encajeCarrusel); los botones
// anterior y siguiente avanzan tarjeta a tarjeta. Con pocos ejercicios, se
// reparten toda la fila y no hay botones.

const HUECO = 12

const TONO_ESTADO: Record<EstadoEjercicio, string> = {
  'en-curso': 'text-brand-ink',
  'por-declarar': 'text-warning-ink',
  declarado: 'text-positive-ink',
}

export function YearCards({ years, activeYear, overview, declarados, onSelect }: {
  years: number[]
  activeYear: number
  overview: YearOverview[]
  declarados: ReadonlySet<number>
  onSelect: (year: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})
  const reduceMotion = useReducedMotion()
  const [ancho, setAncho] = useState(0)
  const [inicio, setInicio] = useState(0)

  // Ancho real del contenido: de él sale cuántas tarjetas completas caben.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const medir = () => setAncho(el.clientWidth)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { visibles, anchoTarjeta } = encajeCarrusel(ancho, years.length, 208, HUECO)
  const paso = anchoTarjeta + HUECO
  const hayMas = visibles > 0 && years.length > visibles

  // Primera tarjeta visible según el desplazamiento (para los botones y el «1 a 4 de 5»).
  const alDesplazar = useCallback(() => {
    const el = listRef.current
    if (el && paso > 0) setInicio(Math.round(el.scrollLeft / paso))
  }, [paso])

  const ir = useCallback((indice: number) => {
    const el = listRef.current
    if (!el) return
    const destino = Math.max(0, Math.min(indice, years.length - visibles))
    el.scrollTo({ left: destino * paso, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [paso, years.length, visibles, reduceMotion])

  // La tarjeta elegida siempre entera a la vista.
  useEffect(() => {
    if (!hayMas) return
    const i = years.indexOf(activeYear)
    if (i < inicio) ir(i)
    else if (i >= inicio + visibles) ir(i - visibles + 1)
    // Solo al cambiar de año o de encaje: el desplazamiento manual no debe volver a la elegida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeYear, visibles, hayMas])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(years, activeYear, e.key)
    if (next === null) return
    e.preventDefault()
    onSelect(next)
    refs.current[next]?.focus({ preventScroll: true })
  }

  // Botón izquierdo: tarjetas del principio de la lista (los ejercicios van del más reciente al más antiguo).
  const recientesPrimero = years.length > 1 && years[0] > years[years.length - 1]
  const fin = Math.min(inicio + visibles, years.length)

  return (
    // flow-root: los márgenes de 4 px de la fila no colapsan con el espaciado común (20 px exactos arriba y abajo).
    <div ref={wrapRef} className="flow-root">
      {hayMas && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs text-fg-subtle" aria-live="polite">
            Ejercicios {inicio + 1} a {fin} de {years.length}
          </p>
          <div className="flex items-center gap-1">
            <IconButton label={recientesPrimero ? 'Ejercicios más recientes' : 'Ejercicios anteriores'} size="sm"
              icon={<ChevronLeft size={15} aria-hidden="true" />} disabled={inicio <= 0} onClick={() => ir(inicio - visibles)} />
            <IconButton label={recientesPrimero ? 'Ejercicios más antiguos' : 'Ejercicios siguientes'} size="sm"
              icon={<ChevronRight size={15} aria-hidden="true" />} disabled={fin >= years.length} onClick={() => ir(inicio + visibles)} />
          </div>
        </div>
      )}
      {/* El margen interior de 4 px, compensado por fuera, deja ver el anillo de foco sin recortarlo. */}
      <div ref={listRef} role="tablist" aria-label="Ejercicios fiscales" onKeyDown={onKeyDown} onScroll={alDesplazar}
        className="flex overflow-x-auto p-1 -m-1 snap-x snap-mandatory scroll-px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: HUECO }}>
        {years.map(year => {
          const ov = overview.find(o => o.year === year)
          const estado = estadoEjercicio(ov?.esAnioEnCurso ?? false, declarados.has(year))
          const neto = ov?.netoPatrimonial ?? 0
          const reparto = ov ? repartoGananciasPerdidas(ov.totalGanancias, ov.totalPerdidas) : null
          const active = year === activeYear
          return (
            <button key={year} ref={el => { refs.current[year] = el }} type="button" role="tab"
              aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onSelect(year)}
              style={{ width: anchoTarjeta || undefined }}
              className={`shrink-0 snap-start text-left rounded-xl border p-3.5 space-y-2 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
                anchoTarjeta ? '' : 'w-52'} ${active ? 'border-brand/50 bg-brand/8 ring-1 ring-brand/30' : 'border-border bg-background-card hover:border-fg-subtle/60'}`}>
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-base font-semibold mono ${active ? 'text-fg' : 'text-fg-muted'}`}>{year}</span>
                <span className={`text-[11px] font-semibold ${TONO_ESTADO[estado]}`}>{ESTADO_EJERCICIO_LABEL[estado]}</span>
              </span>
              <span className="block">
                <span className={`block text-lg font-bold mono tabular-nums leading-tight ${neto > 0.005 ? 'text-positive-ink' : neto < -0.005 ? 'text-negative-ink' : 'text-fg'}`}>
                  {neto > 0.005 ? '+' : ''}{formatEur(neto)}
                </span>
                <span className="block text-[11px] text-fg-subtle">
                  {formatNumber(ov?.numOperaciones ?? 0, 0)} {(ov?.numOperaciones ?? 0) === 1 ? 'operación' : 'operaciones'}
                </span>
              </span>
              {reparto ? (
                <span className="block space-y-1">
                  <span aria-hidden="true" className="flex h-1.5 rounded-full overflow-hidden bg-overlay/6 gap-px">
                    {reparto.ganancias > 0 && <span className="h-full bg-positive" style={{ width: `${reparto.ganancias}%` }} />}
                    {reparto.perdidas > 0 && <span className="h-full bg-negative" style={{ width: `${reparto.perdidas}%` }} />}
                  </span>
                  <span className="block text-[11px] text-fg-subtle whitespace-nowrap">
                    Ganancias {reparto.ganancias} % · pérdidas {reparto.perdidas} %
                  </span>
                </span>
              ) : (
                <span className="block text-[11px] text-fg-subtle">Sin ganancias ni pérdidas</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
