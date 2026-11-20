import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { StatsCategory } from '../../../api/portfolio'
import { CATEGORIA_LABEL, desglose, moverDia, nivel, type Celda } from '../../../utils/actividadMapa'
import { dayLabel } from '../../../utils/recentActivity'

// Mapa de actividad de 26 semanas (#516): un cuadro por día de la zona de la
// app con el color del tipo dominante y la intensidad por número de
// operaciones. Es una rejilla con un solo punto de foco (aria-activedescendant):
// los cuadros miden unos 12 px, así que no son botones sueltos; las flechas
// mueven el día activo (arriba y abajo, día a día; izquierda y derecha, semana
// a semana), Intro o Espacio lo elige y el clic también. Elegir un día filtra
// la lista; volver a elegirlo, o Escape, quita el filtro.

const COLOR_CATEGORIA: Record<StatsCategory, string> = {
  compras: 'var(--cf-positive)',
  ventas: 'var(--cf-negative)',
  ingresos: 'var(--cf-accent-purple)',
  transferencias: 'var(--cf-info)',
  otras_salidas: 'var(--cf-warning)',
  otros: 'var(--cf-fg-subtle)',
}
const MEZCLA = [0, 30, 50, 72, 95] as const
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MES = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' })

function fondo(c: Celda | null, max: number): string | undefined {
  if (!c) return undefined
  const n = nivel(c.total, max)
  if (n === 0 || !c.dominante) return 'color-mix(in srgb, var(--cf-overlay) 7%, transparent)'
  return `color-mix(in srgb, ${COLOR_CATEGORIA[c.dominante]} ${MEZCLA[n]}%, var(--cf-bg-tertiary))`
}

export function MapaActividad({ semanas, today, seleccionado, onSeleccionar }: {
  semanas: Array<Array<Celda | null>>
  today: string
  seleccionado: string | null
  onSeleccionar: (day: string | null) => void
}) {
  const id = useId().replace(/:/g, '')
  const celdas = useMemo(() => semanas.flat().filter((c): c is Celda => !!c), [semanas])
  const max = celdas.reduce((m, c) => Math.max(m, c.total), 0)
  const desde = celdas[0]?.day ?? today
  const hasta = celdas[celdas.length - 1]?.day ?? today
  const [activo, setActivo] = useState<string | null>(null)
  const dia = activo ?? seleccionado ?? hasta
  const porDia = useMemo(() => new Map(celdas.map(c => [c.day, c])), [celdas])
  const etiqueta = (c: Celda) => `${dayLabel(c.day, today)}: ${c.total === 0 ? 'sin operaciones' : `${c.total} ${c.total === 1 ? 'operación' : 'operaciones'} (${desglose(c.ops)})`}${c.day === seleccionado ? ', elegido' : ''}`
  const elegir = (d: string) => onSeleccionar(d === seleccionado ? null : d)

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(dia); return }
    if (e.key === 'Escape' && seleccionado) { e.preventDefault(); onSeleccionar(null); return }
    const next = moverDia(dia, e.key, desde, hasta)
    if (!next) return
    e.preventDefault()
    setActivo(next)
  }

  // Etiquetas de mes sobre la primera semana de cada mes.
  const crudos = semanas.map((s, w) => {
    const primero = s.find(Boolean)
    if (!primero) return ''
    const anterior = w > 0 ? semanas[w - 1].find(Boolean) : null
    return !anterior || anterior.day.slice(5, 7) !== primero.day.slice(5, 7) ? MES.format(new Date(`${primero.day}T00:00:00Z`)).replace('.', '') : ''
  })
  // Un mes con una sola semana visible al principio taparía al siguiente: se omite.
  const meses = crudos.map((m, w) => (m && (crudos[w + 1] || crudos[w + 2]) ? '' : m))
  const activoCelda = porDia.get(dia)

  return (
    <div className="min-w-0 max-w-[32rem]" data-testid="mapa-actividad">
      <div className="flex gap-1.5">
        <div aria-hidden="true" className="flex flex-col justify-between pt-4 pb-px text-[9px] leading-none text-fg-subtle">
          {DIAS.map((d, i) => <span key={d} className={i % 2 ? 'invisible' : ''}>{d}</span>)}
        </div>
        <div className="flex-1 min-w-0">
          <div aria-hidden="true" className="grid gap-[3px] mb-1 text-[9px] leading-none text-fg-subtle capitalize" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))` }}>
            {meses.map((m, i) => <span key={i} className="whitespace-nowrap overflow-visible">{m}</span>)}
          </div>
          <div role="grid" tabIndex={0} aria-label="Actividad de las últimas 26 semanas: flechas para moverse, Intro para filtrar la lista por ese día"
            aria-activedescendant={activoCelda ? `${id}-${dia}` : undefined}
            onKeyDown={onKey} onBlur={() => setActivo(null)}
            className="group/mapa grid gap-[3px] rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background-card"
            style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)' }}>
            {/* Una fila ARIA por día de la semana (display: contents); cada celda se coloca en su semana. */}
            {DIAS.map((nombre, d) => (
              <div key={nombre} role="row" className="contents">
                {semanas.map((s, w) => {
                  const c = s[d]
                  return c ? (
                    <span key={c.day} id={`${id}-${c.day}`} role="gridcell" aria-label={etiqueta(c)} aria-selected={c.day === seleccionado}
                      onClick={() => elegir(c.day)}
                      style={{ background: fondo(c, max), gridColumn: w + 1, gridRow: d + 1 }}
                      className={`block aspect-square max-w-4 w-full rounded-[3px] cursor-pointer transition-transform hover:scale-125 motion-reduce:transition-none
                        ${c.day === seleccionado ? 'ring-2 ring-fg' : ''} ${c.day === dia ? 'group-focus-visible/mapa:ring-2 group-focus-visible/mapa:ring-brand' : ''}`} />
                  ) : <span key={`vacio-${w}`} role="gridcell" aria-hidden="true" style={{ gridColumn: w + 1, gridRow: d + 1 }} />
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] text-fg-subtle">
        <span aria-live="polite">{activoCelda ? etiqueta(activoCelda) : ' '}</span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {(['compras', 'ventas', 'ingresos', 'transferencias'] as const).map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-[2px]" style={{ background: COLOR_CATEGORIA[k] }} />
              {CATEGORIA_LABEL[k].varios.charAt(0).toUpperCase() + CATEGORIA_LABEL[k].varios.slice(1)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">menos
            <span aria-hidden="true" className="inline-flex gap-0.5">
              {MEZCLA.slice(1).map(m => <span key={m} className="inline-block size-2.5 rounded-[2px]" style={{ background: `color-mix(in srgb, var(--cf-fg-muted) ${m}%, var(--cf-bg-tertiary))` }} />)}
            </span>
            más</span>
        </span>
      </div>
    </div>
  )
}
