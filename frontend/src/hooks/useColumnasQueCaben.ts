import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { sinLasMenosPrioritarias, type ColumnDef } from '../utils/portfolioColumns'

/**
 * Columnas de la tabla de posiciones que caben en su panel (#527). Si la tabla
 * es más ancha que el panel, se ocultan una a una las de menor prioridad; al
 * ensanchar la ventana (o plegar el menú) vuelven en cuanto hay sitio. Guarda
 * el ancho natural de la tabla en cada paso para saber cuándo cabe la anterior.
 * `clave` reinicia el cálculo cuando cambian las columnas elegidas o los datos.
 */
export function useColumnasQueCaben(cols: readonly ColumnDef[], clave: string): {
  visibles: ColumnDef[]
  ocultas: ColumnDef[]
  panelRef: RefObject<HTMLDivElement>
  tablaRef: RefObject<HTMLTableElement>
} {
  const panelRef = useRef<HTMLDivElement>(null)
  const tablaRef = useRef<HTMLTableElement>(null)
  const [estado, setEstado] = useState({ clave, n: 0 })
  // Con otra clave se empieza de cero (estado derivado durante el render).
  if (estado.clave !== clave) setEstado({ clave, n: 0 })
  const n = estado.clave === clave ? estado.n : 0

  useLayoutEffect(() => {
    const panel = panelRef.current
    const tabla = tablaRef.current
    if (!panel || !tabla || typeof ResizeObserver === 'undefined') return
    // necesita[i]: ancho natural de la tabla con i columnas ocultas.
    const necesita: number[] = []
    const comprobar = () => {
      const disponible = panel.clientWidth
      const natural = tabla.scrollWidth
      setEstado(prev => {
        if (prev.clave !== clave) return prev
        if (natural > disponible + 1 && prev.n < cols.length) {
          necesita[prev.n] = natural
          return { clave, n: prev.n + 1 }
        }
        if (prev.n > 0 && natural <= disponible + 1) {
          // Vuelven de golpe todas las que caben: el menor número de ocultas
          // cuyo ancho natural medido entra en el panel.
          let i = prev.n
          while (i > 0 && (necesita[i - 1] ?? Infinity) <= disponible) i--
          return i === prev.n ? prev : { clave, n: i }
        }
        return prev
      })
    }
    const ro = new ResizeObserver(comprobar)
    ro.observe(panel)
    ro.observe(tabla)
    return () => ro.disconnect()
  }, [clave, cols.length])

  const { visibles, ocultas } = sinLasMenosPrioritarias(cols, n)
  return { visibles, ocultas, panelRef, tablaRef }
}
