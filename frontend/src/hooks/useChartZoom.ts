import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { desplazarVentana, encajar, zoomVentana, ZOOM_STEP, type Ventana } from '../utils/chartZoom'

/**
 * Interacción del zoom del gráfico de precio (#528): rueda para acercar o
 * alejar centrando en el cursor, arrastrar para desplazar, teclado (+, -,
 * flechas, Inicio) y doble clic para volver a la vista inicial. `inset` es el
 * margen del área de trazado dentro del contenedor (eje Y a la izquierda).
 * La rueda se escucha con `passive: false` para que no desplace el panel.
 */
export function useChartZoom(extent: Ventana | null, inset: { left: number; right: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ventana, setVentana] = useState<Ventana | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const v = extent ? (ventana ? encajar(ventana, extent) : extent) : null

  // Valores actuales para los manejadores nativos sin volver a registrarlos.
  const actual = useRef({ v, extent, inset })
  useLayoutEffect(() => { actual.current = { v, extent, inset } })

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

  // El contenedor solo existe con historia: se registra la rueda al aparecer.
  const hayHistoria = extent !== null
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { v: cur, extent: ext } = actual.current
      if (!cur || !ext || e.ctrlKey) return
      e.preventDefault()
      // Desplazamiento horizontal del trackpad: mueve la ventana.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const rect = el.getBoundingClientRect()
        setVentana(desplazarVentana(cur, ext, (e.deltaX / Math.max(1, rect.width)) * (cur.to - cur.from)))
        return
      }
      const anchor = instanteEn(e.clientX) ?? (cur.from + cur.to) / 2
      setVentana(zoomVentana(cur, ext, e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [instanteEn, hayHistoria])

  // Arrastrar para desplazar (ratón, lápiz o dedo).
  const inicio = useRef<{ x: number; v: Ventana } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !v) return
    inicio.current = { x: e.clientX, v }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = inicio.current
    const el = containerRef.current
    if (!s || !el || !extent) return
    const dx = e.clientX - s.x
    if (!arrastrando && Math.abs(dx) < 3) return
    if (!arrastrando) setArrastrando(true)
    const width = el.getBoundingClientRect().width - inset.left - inset.right
    setVentana(desplazarVentana(s.v, extent, (-dx / Math.max(1, width)) * (s.v.to - s.v.from)))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    inicio.current = null
    setArrastrando(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const reset = () => setVentana(null)
  const zoom = (factor: number) => { if (v && extent) setVentana(zoomVentana(v, extent, factor, (v.from + v.to) / 2)) }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!v || !extent) return
    const paso = (v.to - v.from) * 0.1
    const acciones: Record<string, () => void> = {
      '+': () => zoom(1 / ZOOM_STEP), '=': () => zoom(1 / ZOOM_STEP), '-': () => zoom(ZOOM_STEP),
      ArrowLeft: () => setVentana(desplazarVentana(v, extent, -paso)),
      ArrowRight: () => setVentana(desplazarVentana(v, extent, paso)),
      Home: reset, '0': reset,
    }
    const accion = acciones[e.key]
    if (!accion) return
    e.preventDefault()
    accion()
  }

  return {
    v, containerRef, arrastrando, setVentana, reset,
    acercar: () => zoom(1 / ZOOM_STEP), alejar: () => zoom(ZOOM_STEP),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: reset, onKeyDown },
  }
}
