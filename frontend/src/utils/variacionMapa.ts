import type { Rect } from './squarify'
import type { HeatCell } from './topMovers'

// Panel Variación (#513): referencias de «Hoy», resumen que cuadra con el P&L
// del día, escala de las barras por impacto en euros, foco itinerante
// del mapa con las flechas (por posición en pantalla), destino de cada casilla
// en Portfolio y distintivos de mejor y peor. Funciones puras.

/** Unidades de periodo de cada métrica, para los textos: «hoy», «en 24 h», «desde la compra». */
export const PERIODO_METRICA: Record<'hoy' | '24h' | 'total', string> = { hoy: 'hoy', '24h': 'en 24 h', total: 'desde la compra' }

/**
 * Precio de referencia de «Hoy» (#513): el cierre de ayer (día de la zona de
 * la app) de cada activo, en la moneda de visualización. En USD se divide por
 * el cierre de USDT del mismo día, como el P&L diario del servidor. Sin cierre
 * de ayer, el activo no tiene referencia.
 */
export function referenciasHoy(
  closes: Readonly<Record<string, ReadonlyArray<{ date: string; price: number }>>> | undefined,
  ayer: string,
  currency: 'EUR' | 'USD',
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!closes) return out
  const de = (asset: string) => closes[asset]?.find(c => c.date === ayer)?.price
  const usdt = de('USDT')
  if (currency === 'USD' && !(usdt && usdt > 0)) return out
  for (const asset of Object.keys(closes)) {
    const p = de(asset)
    if (p && p > 0) out[asset] = currency === 'USD' ? p / usdt! : p
  }
  return out
}

export interface ResumenMovimiento {
  /** Suma de los impactos positivos y de los negativos (este, negativo). */
  suben: number
  bajan: number
  /** En «Hoy», lo que no explica el precio de estos activos (operaciones de hoy, polvo, estables); null en el resto. */
  otros: number | null
  /** Resultado del periodo: en «Hoy», el P&L del día (el de la tarjeta); en el resto, la suma de impactos. */
  neto: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Resumen bajo el mapa; en «Hoy», con el P&L del día para que el neto cuadre con la tarjeta. */
export function resumenMovimiento(items: ReadonlyArray<{ impact: number }>, pnlHoy: number | null): ResumenMovimiento {
  const suben = round2(items.reduce((s, i) => s + Math.max(0, i.impact), 0))
  const bajan = round2(items.reduce((s, i) => s + Math.min(0, i.impact), 0))
  if (pnlHoy === null) return { suben, bajan, otros: null, neto: round2(suben + bajan) }
  return { suben, bajan, otros: round2(pnlHoy - suben - bajan), neto: round2(pnlHoy) }
}

/** Ancho de la barra de cada activo: su |impacto| sobre el mayor |impacto| de todos los comparables. */
export function escalaImpacto(items: ReadonlyArray<{ asset: string; impact: number }>): Map<string, number> {
  const max = items.reduce((m, i) => Math.max(m, Math.abs(i.impact)), 0)
  return new Map(items.map(i => [i.asset, max > 0 ? Math.abs(i.impact) / max : 0]))
}

const centro = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/**
 * Casilla a la que mueve una tecla desde la actual (patrón de foco itinerante):
 * en la dirección de la flecha, primero las casillas que solapan con la actual
 * en el otro eje, la más pegada y, a igualdad, la primera en orden de lectura
 * (arriba o a la izquierda); si ninguna solapa, la más cercana penalizando el
 * desvío lateral. Inicio y Fin van a la primera y a la última. null si no hay
 * ninguna en esa dirección o la tecla no aplica.
 */
export function vecinoEnDireccion(rects: readonly Rect[], actual: number, key: string): number | null {
  if (key === 'Home') return rects.length ? 0 : null
  if (key === 'End') return rects.length ? rects.length - 1 : null
  const o = rects[actual]
  const horizontal = key === 'ArrowRight' || key === 'ArrowLeft'
  const adelante = key === 'ArrowRight' || key === 'ArrowDown'
  if (!o || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(key)) return null
  const EPS = 0.01
  // Hueco desde el borde de la actual hasta el borde cercano de la otra (negativo: no está en esa dirección).
  const hueco = (r: Rect) => horizontal
    ? (adelante ? r.x - (o.x + o.w) : o.x - (r.x + r.w))
    : (adelante ? r.y - (o.y + o.h) : o.y - (r.y + r.h))
  const solapa = (r: Rect) => horizontal
    ? Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > EPS
    : Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > EPS
  const inicioLateral = (r: Rect) => (horizontal ? r.y : r.x)
  const c0 = centro(o)
  let mejor: number | null = null
  let clave: [number, number, number] = [Infinity, Infinity, Infinity]
  rects.forEach((r, i) => {
    if (i === actual || hueco(r) < -EPS) return
    const c = centro(r)
    const lateral = Math.abs(horizontal ? c.y - c0.y : c.x - c0.x)
    const k: [number, number, number] = solapa(r)
      ? [0, hueco(r), inicioLateral(r)]
      : [1, Math.abs(horizontal ? c.x - c0.x : c.y - c0.y) + 2 * lateral, inicioLateral(r)]
    if (k[0] < clave[0] || (k[0] === clave[0] && (k[1] < clave[1] - EPS || (Math.abs(k[1] - clave[1]) <= EPS && k[2] < clave[2])))) {
      clave = k
      mejor = i
    }
  })
  return mejor
}

/** Destino en Portfolio: el activo o, en «Otros», el filtro con todos sus activos (#524). */
export function enlaceCelda(cell: Pick<HeatCell, 'asset' | 'members'>): string {
  return cell.members.length
    ? `/portfolio?activos=${cell.members.map(encodeURIComponent).join(',')}`
    : `/portfolio?activo=${encodeURIComponent(cell.asset)}`
}

/** Índices de la casilla del mejor (sube) y del peor (baja) activo; «Otros» no cuenta. */
export function distintivos(cells: readonly HeatCell[]): { mejor: number | null; peor: number | null } {
  let mejor: number | null = null
  let peor: number | null = null
  cells.forEach((c, i) => {
    if (c.members.length) return
    if (c.pct > 0 && (mejor === null || c.pct > cells[mejor].pct)) mejor = i
    if (c.pct < 0 && (peor === null || c.pct < cells[peor].pct)) peor = i
  })
  return { mejor, peor }
}

/** Texto de los contadores: «7 suben» o, si todos van igual, «Todos suben (7)». En Total, «en ganancia» y «en pérdida». */
export function textoContadores(gains: number, losses: number, mode: 'hoy' | '24h' | 'total'): { up: string; down: string | null } {
  const sube = mode !== 'total' ? (n: number) => (n === 1 ? 'sube' : 'suben') : () => 'en ganancia'
  const baja = mode !== 'total' ? (n: number) => (n === 1 ? 'baja' : 'bajan') : () => 'en pérdida'
  if (gains > 0 && losses === 0) return { up: `Todos ${sube(2)} (${gains})`, down: null }
  if (losses > 0 && gains === 0) return { up: `Todos ${baja(2)} (${losses})`, down: null }
  return { up: `${gains} ${sube(gains)}`, down: `${losses} ${baja(losses)}` }
}
