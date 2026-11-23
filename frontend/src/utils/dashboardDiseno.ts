// Diseño del Dashboard (#521): orden de los paneles, ocultos y contraídos,
// guardado en app_config bajo «dashboard_diseno». Funciones puras: lectura
// tolerante, movimientos, alternar y filas de la página (Distribución y Fiscal
// comparten fila si quedan seguidos y abiertos, como antes).

export const DASHBOARD_DISENO_KEY = 'dashboard_diseno'
export const PANELES = ['metas', 'variacion', 'evolucion', 'rendimiento', 'pnl-diario', 'distribucion', 'fiscal', 'actividad', 'ingresos'] as const
export type PanelId = typeof PANELES[number]

export interface Diseno {
  orden: readonly PanelId[]
  ocultos: readonly PanelId[]
  contraidos: readonly PanelId[]
}

export const DISENO_DEFECTO: Diseno = { orden: PANELES, ocultos: [], contraidos: [] }

const esPanel = (v: unknown): v is PanelId => typeof v === 'string' && (PANELES as readonly string[]).includes(v)

/** Paneles conocidos sin repetir, en el orden recibido. */
function limpiar(v: unknown): PanelId[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter(esPanel))]
}

/**
 * Coloca los paneles que falten en el orden (uno nuevo de una versión
 * posterior, por ejemplo) justo después del que los precede por defecto.
 */
export function completarOrden(orden: readonly PanelId[]): PanelId[] {
  const res = [...orden]
  PANELES.forEach((id, i) => {
    if (res.includes(id)) return
    const previos = PANELES.slice(0, i).filter(p => res.includes(p))
    const tras = previos.length > 0 ? res.indexOf(previos[previos.length - 1]) + 1 : 0
    res.splice(tras, 0, id)
  })
  return res
}

/** Diseño guardado en la configuración; sin clave o con JSON roto, el de por defecto. */
export function leerDiseno(config: Readonly<Record<string, string>> | undefined): Diseno {
  const raw = config?.[DASHBOARD_DISENO_KEY]
  if (!raw) return DISENO_DEFECTO
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null
    if (!o || typeof o !== 'object') return DISENO_DEFECTO
    return { orden: completarOrden(limpiar(o.orden)), ocultos: limpiar(o.ocultos), contraidos: limpiar(o.contraidos) }
  } catch {
    return DISENO_DEFECTO
  }
}

export function serializarDiseno(d: Diseno): string {
  return JSON.stringify({ orden: d.orden, ocultos: d.ocultos, contraidos: d.contraidos })
}

export function esPorDefecto(d: Diseno): boolean {
  return serializarDiseno(d) === serializarDiseno(DISENO_DEFECTO)
}

/** Lleva el panel de la posición `desde` a la `hasta` (acotada). */
export function moverA(orden: readonly PanelId[], desde: number, hasta: number): PanelId[] {
  const res = [...orden]
  if (desde < 0 || desde >= res.length) return res
  const destino = Math.max(0, Math.min(res.length - 1, hasta))
  const [id] = res.splice(desde, 1)
  res.splice(destino, 0, id)
  return res
}

/** Sube (-1) o baja (+1) un panel una posición. */
export function mover(orden: readonly PanelId[], id: PanelId, delta: -1 | 1): PanelId[] {
  const i = orden.indexOf(id)
  return i < 0 ? [...orden] : moverA(orden, i, i + delta)
}

/** Añade o quita el panel de una lista (ocultos o contraídos). */
export function alternar(lista: readonly PanelId[], id: PanelId, incluir: boolean): PanelId[] {
  const sin = lista.filter(p => p !== id)
  return incluir ? [...sin, id] : sin
}

export type Fila = { tipo: 'uno'; id: PanelId } | { tipo: 'pareja'; ids: readonly [PanelId, PanelId] }

const PAREJA: readonly PanelId[] = ['distribucion', 'fiscal']

/**
 * Filas de la página con los paneles visibles en su orden. Distribución y
 * Fiscal comparten fila cuando quedan seguidos (en cualquier orden) y ninguno
 * está contraído; si no, cada uno ocupa el ancho completo.
 */
export function filasDashboard(d: Diseno): Fila[] {
  const visibles = d.orden.filter(id => !d.ocultos.includes(id))
  const filas: Fila[] = []
  for (let i = 0; i < visibles.length; i++) {
    const a = visibles[i]
    const b = visibles[i + 1]
    if (b && PAREJA.includes(a) && PAREJA.includes(b) && !d.contraidos.includes(a) && !d.contraidos.includes(b)) {
      filas.push({ tipo: 'pareja', ids: [a, b] })
      i++
    } else {
      filas.push({ tipo: 'uno', id: a })
    }
  }
  return filas
}

/** Posición de destino al arrastrar: cuántos centros de las demás filas quedan por encima del puntero. */
export function destinoArrastre(centros: readonly number[], indiceArrastrado: number, y: number): number {
  return centros.filter((c, i) => i !== indiceArrastrado && c < y).length
}

/** Anuncio para el lector de pantalla tras mover un panel. */
export function anuncioMovimiento(titulo: string, posicion: number, total: number): string {
  return `${titulo}, posición ${posicion} de ${total}`
}

/** Estado de un panel: completo, solo su título (contraído) u oculto. */
export type EstadoPanel = 'completo' | 'titulo' | 'oculto'

export function estadoPanel(d: Diseno, id: PanelId): EstadoPanel {
  if (d.ocultos.includes(id)) return 'oculto'
  return d.contraidos.includes(id) ? 'titulo' : 'completo'
}

/** Diseño con el panel en el estado pedido (oculto y contraído son excluyentes). */
export function fijarEstado(d: Diseno, id: PanelId, estado: EstadoPanel): Diseno {
  return {
    ...d,
    ocultos: alternar(d.ocultos, id, estado === 'oculto'),
    contraidos: alternar(d.contraidos, id, estado === 'titulo'),
  }
}

/** Alto relativo de cada panel abierto en el minimapa (aprox. al real). */
export const ALTO_PANEL: Record<PanelId, number> = {
  metas: 3, variacion: 6, evolucion: 9, rendimiento: 6, 'pnl-diario': 8, distribucion: 7, fiscal: 7, actividad: 6, ingresos: 6,
}
const ALTO_TITULO = 1.4
const HUECO = 0.8

export interface BloqueMinimapa {
  id: PanelId
  /** Posición y tamaño en unidades del minimapa; x y ancho, de 0 a 1. */
  x: number
  ancho: number
  y: number
  alto: number
  estado: Exclude<EstadoPanel, 'oculto'>
}

/** Bloques del minimapa a partir de las filas de la página, y su alto total. */
export function bloquesMinimapa(d: Diseno): { bloques: BloqueMinimapa[]; total: number } {
  const bloques: BloqueMinimapa[] = []
  let y = 0
  for (const fila of filasDashboard(d)) {
    if (fila.tipo === 'pareja') {
      const [a, b] = fila.ids
      const alto = Math.max(ALTO_PANEL[a], ALTO_PANEL[b])
      const anchoA = a === 'distribucion' ? 2 / 3 : 1 / 3
      bloques.push({ id: a, x: 0, ancho: anchoA, y, alto, estado: 'completo' })
      bloques.push({ id: b, x: anchoA, ancho: 1 - anchoA, y, alto, estado: 'completo' })
      y += alto + HUECO
    } else {
      const titulo = d.contraidos.includes(fila.id)
      const alto = titulo ? ALTO_TITULO : ALTO_PANEL[fila.id]
      bloques.push({ id: fila.id, x: 0, ancho: 1, y, alto, estado: titulo ? 'titulo' : 'completo' })
      y += alto + HUECO
    }
  }
  return { bloques, total: Math.max(0, y - HUECO) }
}

/**
 * Desplazamiento de cada fila mientras se arrastra otra (efecto de «apartarse»):
 * las que quedan entre el origen y el destino se mueven el alto de la arrastrada.
 */
export function desplazamientoFila(i: number, desde: number, hasta: number, alto: number): number {
  if (i === desde) return 0
  if (desde < hasta && i > desde && i <= hasta) return -alto
  if (hasta < desde && i >= hasta && i < desde) return alto
  return 0
}
