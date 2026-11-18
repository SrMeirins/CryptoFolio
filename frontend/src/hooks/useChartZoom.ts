import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { desplazarVentana, encajar, zoomVentana, ZOOM_STEP, type Ventana } from '../utils/chartZoom'

const mismaVentana = (a: Ventana | null, b: Ventana | null) => (a === null || b === null ? a === b : a.from === b.from && a.to === b.to)

/**
 * Interacción del zoom de los gráficos (#528, #509): rueda para acercar o
 * alejar centrando en el cursor, arrastrar para desplazar, Mayús y arrastrar
 * para elegir un tramo, teclado (+, -, flechas, Inicio, Escape) y doble clic
 * para volver a la vista inicial. Cada zoom deja un paso en el historial y
 * «Atrás» (o Retroceso) lo deshace; desplazar no deja pasos, y una racha de
 * rueda cuenta como uno. `inset` es el margen del área de trazado dentro del
 * contenedor (eje Y a la izquierda). La rueda se escucha con
 * `passive: false` para que no desplace la página.
 */
export function useChartZoom(
  extent: Ventana | null,
  inset: { left: number; right: number },
  /** Ventana controlada desde fuera (#508: el rango de la URL); sin ella, estado propio. */
  control?: { ventana: Ventana | null; set: (v: Ventana | null) => void },
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // El contenedor puede montarse más tarde que la historia (p. ej. tras la
  // preparación de los cierres): se guarda en estado para registrar la rueda
  // en cuanto aparece, y en la referencia para los manejadores.
  const [contenedor, setContenedor] = useState<HTMLDivElement | null>(null)
  const refContenedor = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    setContenedor(el)
  }, [])
  const [propia, setPropia] = useState<Ventana | null>(null)
  const ventana = control ? control.ventana : propia
  const setVentana = control ? control.set : setPropia
  const [arrastrando, setArrastrando] = useState(false)
  const v = extent ? (ventana ? encajar(ventana, extent) : extent) : null
  // Historial de zoom: la ventana anterior a cada paso (null es la vista completa).
  const [pila, setPila] = useState<(Ventana | null)[]>([])
  const guardar = useCallback(() => {
    setPila(prev => (prev.length > 0 && mismaVentana(prev[prev.length - 1], ventana) ? prev : [...prev.slice(-29), ventana]))
  }, [ventana])
  const ultimaRueda = useRef(0)
  const rueda = useRef<{ delta: number; ancla: number; frame: number | null }>({ delta: 0, ancla: 0, frame: null })

  // Valores actuales para los manejadores nativos sin volver a registrarlos.
  const actual = useRef({ v, extent, inset, setVentana, guardar })
  useLayoutEffect(() => { actual.current = { v, extent, inset, setVentana, guardar } })

  /** Instante bajo una coordenada X de pantalla. */
  const instanteEn = useCallback((clientX: number): number | null => {
    const el = containerRef.current
    const { v: cur, inset: ins } = actual.current
    if (!el || !cur) return null
    const rect = el.getBoundingClientRect()
    const width = rect.width - ins.left - ins.right
    if (width <= 0) return null
    const frac = Math.min(1, Math.max(0, (clientX - rect.left - ins.left) / width))
    return cur.from + frac * (cur.to - cur.from)
  }, [])

  // La rueda se registra sobre el contenedor en cuanto se monta.
  useEffect(() => {
    const el = contenedor
    if (!el) return
    const estadoRueda = rueda.current
    const onWheel = (e: WheelEvent) => {
      const { v: cur, extent: ext } = actual.current
      if (!cur || !ext || e.ctrlKey) return
      e.preventDefault()
      // Desplazamiento horizontal del trackpad: mueve la ventana.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const rect = el.getBoundingClientRect()
        actual.current.setVentana(desplazarVentana(cur, ext, (e.deltaX / Math.max(1, rect.width)) * (cur.to - cur.from)))
        return
      }
      // Una racha de rueda es un solo paso del historial.
      if (e.timeStamp - ultimaRueda.current > 600) actual.current.guardar()
      ultimaRueda.current = e.timeStamp
      // Zoom continuo (#510): proporcional al giro (líneas a píxeles) y agrupado
      // por fotograma, para que la rueda y el trackpad vayan suaves.
      rueda.current.delta += e.deltaY * (e.deltaMode === 1 ? 16 : 1)
      rueda.current.ancla = instanteEn(e.clientX) ?? (cur.from + cur.to) / 2
      if (rueda.current.frame !== null) return
      rueda.current.frame = requestAnimationFrame(() => {
        const r = rueda.current
        r.frame = null
        const base = actual.current.v
        const extNow = actual.current.extent
        if (!base || !extNow) { r.delta = 0; return }
        const factor = Math.min(2, Math.max(0.5, Math.exp(r.delta * 0.0015)))
        r.delta = 0
        actual.current.setVentana(zoomVentana(base, extNow, factor, r.ancla))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (estadoRueda.frame !== null) cancelAnimationFrame(estadoRueda.frame)
    }
  }, [instanteEn, contenedor])

  // Arrastrar para desplazar (ratón, lápiz o dedo); con Mayús, elegir un tramo.
  const inicio = useRef<{ x: number; v: Ventana } | null>(null)
  const arrastre = useRef<{ destino: Ventana | null; frame: number | null }>({ destino: null, frame: null })
  // Tramo que se elige: x en pantalla y el borde izquierdo del contenedor al empezar.
  const [seleccion, setSeleccion] = useState<{ x0: number; x1: number; left: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !v) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.shiftKey) {
      const left = e.currentTarget.getBoundingClientRect().left
      setSeleccion({ x0: e.clientX, x1: e.clientX, left })
      return
    }
    inicio.current = { x: e.clientX, v }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (seleccion) { setSeleccion({ ...seleccion, x1: e.clientX }); return }
    const s = inicio.current
    const el = containerRef.current
    if (!s || !el || !extent) return
    const dx = e.clientX - s.x
    if (!arrastrando && Math.abs(dx) < 3) return
    if (!arrastrando) setArrastrando(true)
    const width = el.getBoundingClientRect().width - inset.left - inset.right
    const destino = desplazarVentana(s.v, extent, (-dx / Math.max(1, width)) * (s.v.to - s.v.from))
    // Un repintado por fotograma al arrastrar.
    arrastre.current.destino = destino
    if (arrastre.current.frame === null) {
      arrastre.current.frame = requestAnimationFrame(() => {
        arrastre.current.frame = null
        if (arrastre.current.destino) setVentana(arrastre.current.destino)
      })
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (seleccion && extent && Math.abs(seleccion.x1 - seleccion.x0) > 6) {
      const a = instanteEn(Math.min(seleccion.x0, seleccion.x1))
      const b = instanteEn(Math.max(seleccion.x0, seleccion.x1))
      if (a !== null && b !== null) { guardar(); setVentana(encajar({ from: a, to: b }, extent)) }
    }
    setSeleccion(null)
    inicio.current = null
    setArrastrando(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const reset = () => { if (ventana !== null) { guardar(); setVentana(null) } }
  const zoom = (factor: number) => { if (v && extent) { guardar(); setVentana(zoomVentana(v, extent, factor, (v.from + v.to) / 2)) } }
  const atras = () => {
    const previa = pila[pila.length - 1]
    if (previa === undefined) return
    setPila(pila.slice(0, -1))
    setVentana(previa)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!v || !extent) return
    const paso = (v.to - v.from) * 0.1
    const acciones: Record<string, () => void> = {
      '+': () => zoom(1 / ZOOM_STEP), '=': () => zoom(1 / ZOOM_STEP), '-': () => zoom(ZOOM_STEP),
      ArrowLeft: () => setVentana(desplazarVentana(v, extent, -paso)),
      ArrowRight: () => setVentana(desplazarVentana(v, extent, paso)),
      Home: reset, '0': reset, Escape: reset, Backspace: atras,
    }
    const accion = acciones[e.key]
    if (!accion) return
    e.preventDefault()
    accion()
  }

  // Tramo que se está eligiendo, en px dentro del contenedor (para dibujarlo).
  const tramo = seleccion
    ? { left: Math.min(seleccion.x0, seleccion.x1) - seleccion.left, width: Math.abs(seleccion.x1 - seleccion.x0) }
    : null

  return {
    v, containerRef: refContenedor, arrastrando, setVentana, reset, atras, puedeAtras: pila.length > 0, tramo,
    acercar: () => zoom(1 / ZOOM_STEP), alejar: () => zoom(ZOOM_STEP),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: reset, onKeyDown },
  }
}
