import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronUp, EyeOff, GripVertical, Maximize2, PanelTop } from 'lucide-react'
import { iconButtonClasses, SegmentedControl } from '../ui'
import { PANEL_INFO } from '../../constants/dashboardPaneles'
import {
  anuncioMovimiento, desplazamientoFila, destinoArrastre, estadoPanel, fijarEstado, mover, moverA, type Diseno, type EstadoPanel, type PanelId,
} from '../../utils/dashboardDiseno'
import { MiniaturaPanel } from './MiniaturaPanel'

// Editor del diseño del Dashboard (#521). Cada panel es una tarjeta con el
// estilo de las métricas: asa, posición, miniatura de su forma, nombre y qué
// muestra, su estado (Completo, Solo título u Oculto) y subir y bajar para el
// teclado (anunciados al lector de pantalla).
// Arrastre fluido con eventos de puntero propios (ratón y táctil): la tarjeta
// sigue al puntero, las demás se apartan deslizando, un hueco discontinuo marca
// dónde caerá y al soltar se asienta con animación (FLIP). Subir y bajar
// también deslizan. Con «reducir movimiento», sin animaciones. Escape cancela.
// Común al modo Personalizar del Dashboard y a Ajustes › General.

interface Arrastre {
  id: PanelId
  pointerId: number
  inicioY: number
  dy: number
  desde: number
  hasta: number
  /** Posiciones y altos de las filas al empezar, relativos a la lista. */
  tops: number[]
  altos: number[]
  /** Lo que se apartan las demás: alto de la arrastrada más el hueco entre filas. */
  paso: number
}

const FACIL = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const sinMovimiento = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const ESTADOS: ReadonlyArray<{ value: EstadoPanel; texto: string; icono: typeof Maximize2 }> = [
  { value: 'completo', texto: 'Completo', icono: Maximize2 },
  { value: 'titulo', texto: 'Solo título', icono: PanelTop },
  { value: 'oculto', texto: 'Oculto', icono: EyeOff },
]

export function EditorDiseno({ diseno, onCambiar, onResaltar, onOrdenVivo }: {
  diseno: Diseno
  onCambiar: (d: Diseno) => Promise<void> | void
  /** Panel bajo el puntero, con el foco o arrastrado (para el minimapa). */
  onResaltar?: (id: PanelId | null) => void
  /** Orden provisional mientras se arrastra (null al soltar), para el minimapa. */
  onOrdenVivo?: (orden: PanelId[] | null) => void
}) {
  const [arrastre, setArrastre] = useState<Arrastre | null>(null)
  // Orden aplicado hasta que termina el guardado (`onCambiar` debe devolver su
  // promesa): si se quitara antes de que la caché avise del cambio, la lista
  // volvería un instante al orden anterior y otro movimiento seguido se
  // calcularía sobre él.
  const [pendiente, setPendiente] = useState<PanelId[] | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const lista = useRef<HTMLOListElement>(null)
  const filas = useRef(new Map<PanelId, HTMLLIElement>())
  const botones = useRef(new Map<string, HTMLButtonElement>())
  const foco = useRef<string | null>(null)
  const antes = useRef(new Map<PanelId, number>())
  const orden = pendiente ?? diseno.orden
  const total = orden.length

  /** Guarda dónde se ve cada fila antes de un cambio de orden (FLIP). */
  function capturar() {
    antes.current.clear()
    filas.current.forEach((el, id) => antes.current.set(id, el.getBoundingClientRect().top))
  }

  function aplicar(nuevo: PanelId[]) {
    capturar()
    setPendiente(nuevo)
    void Promise.resolve(onCambiar({ ...diseno, orden: nuevo })).finally(() => setPendiente(null))
  }

  // FLIP: cada fila parte de donde se veía y desliza hasta su nuevo sitio.
  const claveOrden = orden.join()
  useLayoutEffect(() => {
    if (antes.current.size === 0) return
    const quieto = sinMovimiento()
    filas.current.forEach((el, id) => {
      const previo = antes.current.get(id)
      if (previo === undefined || quieto) return
      const d = previo - el.getBoundingClientRect().top
      if (Math.abs(d) < 1) return
      el.style.transition = 'none'
      el.style.transform = `translateY(${d}px)`
      void el.getBoundingClientRect()
      el.style.transition = `transform 260ms ${FACIL}`
      el.style.transform = ''
    })
    antes.current.clear()
  }, [claveOrden])

  // Tras subir o bajar, el foco vuelve al botón pulsado (o al otro si ese
  // quedó desactivado en un extremo), para encadenar movimientos.
  useEffect(() => {
    const clave = foco.current
    if (!clave) return
    const [id, dir] = clave.split('|')
    const b = botones.current.get(clave)
    const otro = botones.current.get(`${id}|${dir === 'subir' ? 'bajar' : 'subir'}`)
    ;(b && !b.disabled ? b : otro)?.focus()
    foco.current = null
  }, [claveOrden])

  function moverCon(id: PanelId, delta: -1 | 1) {
    const nuevo = mover(orden, id, delta)
    foco.current = `${id}|${delta < 0 ? 'subir' : 'bajar'}`
    aplicar(nuevo)
    setAnuncio(anuncioMovimiento(PANEL_INFO[id].titulo, nuevo.indexOf(id) + 1, total))
  }

  // Arrastre: se escucha en window mientras dura (no depende de la captura
  // del puntero) y las referencias se sincronizan tras cada render.
  const arrastreRef = useRef<Arrastre | null>(null)
  const terminarRef = useRef<(cancelar: boolean) => void>(() => {})
  useLayoutEffect(() => {
    arrastreRef.current = arrastre
    terminarRef.current = (cancelar: boolean) => {
      const a = arrastreRef.current
      if (!a) return
      capturar()
      setArrastre(null)
      onResaltar?.(null)
      if (cancelar || a.hasta === a.desde) return
      aplicar(moverA(orden, a.desde, a.hasta))
      setAnuncio(anuncioMovimiento(PANEL_INFO[a.id].titulo, a.hasta + 1, total))
    }
  })
  const activo = arrastre !== null
  useEffect(() => {
    if (!activo) return
    const mueve = (e: PointerEvent) => {
      const a = arrastreRef.current
      if (!a || e.pointerId !== a.pointerId) return
      const dy = e.clientY - a.inicioY
      const centros = a.tops.map((t, i) => t + a.altos[i] / 2)
      const hasta = destinoArrastre(centros, a.desde, centros[a.desde] + dy)
      setArrastre({ ...a, dy, hasta })
    }
    const suelta = (e: PointerEvent) => { if (e.pointerId === arrastreRef.current?.pointerId) terminarRef.current(false) }
    const cancela = (e: PointerEvent) => { if (e.pointerId === arrastreRef.current?.pointerId) terminarRef.current(true) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') terminarRef.current(true) }
    window.addEventListener('pointermove', mueve)
    window.addEventListener('pointerup', suelta)
    window.addEventListener('pointercancel', cancela)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('pointermove', mueve)
      window.removeEventListener('pointerup', suelta)
      window.removeEventListener('pointercancel', cancela)
      window.removeEventListener('keydown', tecla)
    }
  }, [activo])

  // El minimapa sigue el orden provisional mientras se arrastra.
  const destino = arrastre ? `${arrastre.desde}>${arrastre.hasta}` : null
  useEffect(() => {
    const a = arrastreRef.current
    onOrdenVivo?.(a && destino ? moverA(orden, a.desde, a.hasta) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el destino
  }, [destino])

  function empezar(e: ReactPointerEvent<HTMLElement>, id: PanelId) {
    if (e.button !== 0 || !lista.current) return
    e.preventDefault()
    const base = lista.current.getBoundingClientRect().top
    const rects = orden.map(p => filas.current.get(p)?.getBoundingClientRect())
    const tops = rects.map(r => (r ? r.top - base : 0))
    const altos = rects.map(r => r?.height ?? 0)
    const desde = orden.indexOf(id)
    const hueco = tops.length > 1 ? Math.max(0, tops[1] - (tops[0] + altos[0])) : 0
    setArrastre({ id, pointerId: e.pointerId, inicioY: e.clientY, dy: 0, desde, hasta: desde, tops, altos, paso: altos[desde] + hueco })
    onResaltar?.(id)
  }

  function estiloFila(i: number, id: PanelId): CSSProperties {
    if (!arrastre) return {}
    if (id === arrastre.id) return { transform: `translateY(${arrastre.dy}px) scale(1.015)`, transition: 'box-shadow 150ms', zIndex: 20 }
    const d = desplazamientoFila(i, arrastre.desde, arrastre.hasta, arrastre.paso)
    return { transform: d ? `translateY(${d}px)` : undefined, transition: sinMovimiento() ? 'none' : `transform 200ms ${FACIL}` }
  }

  /** Posición que tendrá cada fila si se suelta ahora. */
  function posicion(i: number, id: PanelId): number {
    if (!arrastre) return i
    if (id === arrastre.id) return arrastre.hasta
    return i + Math.sign(desplazamientoFila(i, arrastre.desde, arrastre.hasta, 1))
  }

  // Hueco donde caerá la tarjeta arrastrada.
  const hueco = arrastre && (() => {
    const { desde, hasta, tops, altos } = arrastre
    const top = hasta > desde ? tops[hasta] + altos[hasta] - altos[desde] : tops[hasta]
    return { top, height: altos[desde] }
  })()

  const accion = iconButtonClasses('sm')
  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>
      <ol ref={lista} className={`relative space-y-2 ${arrastre ? 'select-none' : ''}`} aria-label="Paneles del Dashboard" data-testid="editor-diseno">
        {hueco && (
          <li aria-hidden="true" className="absolute inset-x-0 rounded-2xl border-2 border-dashed border-brand/50 bg-brand/5 transition-[top] duration-200"
            style={{ top: hueco.top, height: hueco.height }} />
        )}
        {orden.map((id, i) => {
          const { titulo, detalle, color } = PANEL_INFO[id]
          const estado = estadoPanel(diseno, id)
          const oculto = estado === 'oculto'
          const arrastrando = arrastre?.id === id
          return (
            <li key={id} ref={el => { if (el) filas.current.set(id, el); else filas.current.delete(id) }}
              style={{ ...estiloFila(i, id), '--card': oculto ? 'var(--cf-border)' : color } as CSSProperties}
              onPointerEnter={() => { if (!arrastre) onResaltar?.(id) }} onPointerLeave={() => { if (!arrastre) onResaltar?.(null) }}
              onFocus={() => onResaltar?.(id)} onBlur={() => onResaltar?.(null)}
              className={`stat-card relative rounded-2xl p-px ${arrastrando ? 'shadow-2xl' : ''}`}
              data-testid="fila-panel" data-panel={id} data-estado={estado}>
              <div className="stat-card-body rounded-[15px] flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pl-1.5 pr-3">
                {/* Asa solo para ratón y táctil; con teclado, subir y bajar. */}
                <span aria-hidden="true" onPointerDown={e => empezar(e, id)}
                  className={`flex h-10 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:text-fg hover:bg-overlay/6 touch-none select-none ${arrastrando ? 'cursor-grabbing text-fg' : 'cursor-grab'}`}>
                  <GripVertical size={18} />
                </span>
                <span className="w-5 shrink-0 text-right mono text-base font-bold tabular-nums text-fg-subtle" aria-hidden="true">{posicion(i, id) + 1}</span>
                <MiniaturaPanel id={id} apagada={oculto} className="h-11 w-[4.5rem] shrink-0" />
                <span className="flex-1 min-w-[9rem]">
                  <span className={`block truncate text-sm font-semibold ${oculto ? 'text-fg-muted' : 'text-fg'}`}>{titulo}</span>
                  <span className="block truncate text-[11px] text-fg-subtle">{oculto ? 'Oculto: no aparece ni pide datos' : estado === 'titulo' ? 'Solo su título: se abre con un clic' : detalle}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 ml-auto">
                  <SegmentedControl label={`Estado de ${titulo}`} value={estado} onChange={v => void onCambiar(fijarEstado(diseno, id, v))}
                    options={ESTADOS.map(({ value, texto, icono: Icono }) => ({
                      value, title: texto,
                      label: <span className="inline-flex items-center gap-1.5"><Icono size={13} aria-hidden="true" /><span className="hidden lg:inline">{texto}</span></span>,
                    }))} />
                  <span className="flex flex-col">
                    <button type="button" ref={el => { if (el) botones.current.set(`${id}|subir`, el) }} className={`${accion} h-6`}
                      aria-label={`Subir ${titulo}`} disabled={i === 0} onClick={() => moverCon(id, -1)}>
                      <ChevronUp size={15} aria-hidden="true" />
                    </button>
                    <button type="button" ref={el => { if (el) botones.current.set(`${id}|bajar`, el) }} className={`${accion} h-6`}
                      aria-label={`Bajar ${titulo}`} disabled={i === total - 1} onClick={() => moverCon(id, 1)}>
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                  </span>
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
