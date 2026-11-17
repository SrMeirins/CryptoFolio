import type { LotView } from './portfolioLots'

// Regla de precios de compra (#528): una línea de precio, de barato a caro,
// con el precio actual marcado. Cada compra abierta es un círculo en su precio
// de compra, de tamaño proporcional a la cantidad. Lo que queda a la izquierda
// del precio actual se compró más barato (en beneficio); a la derecha, más
// caro (en pérdida). Con precios muy dispersos la escala es logarítmica para
// que las compras baratas no se amontonen.

export interface CirculoRegla {
  lotId: string
  openedAt: string
  price: number
  quantity: number
  /** Posición en la línea, de 0 a 100. */
  pos: number
  /** Radio en px, proporcional a la raíz de la cantidad. */
  radio: number
  enBeneficio: boolean | null
}

export interface LadoRegla { compras: number; cantidad: number; precioMedio: number | null }

export interface ReglaPrecios {
  circulos: CirculoRegla[]
  min: number
  max: number
  log: boolean
  /** Posición del precio actual y del precio medio (0 a 100); null sin dato. */
  posPrecio: number | null
  posMedio: number | null
  beneficio: LadoRegla
  perdida: LadoRegla
  /** Porcentaje de la cantidad comprada por debajo del precio actual; null sin precio. */
  pctBeneficio: number | null
}

export const RADIO_MIN = 4
export const RADIO_MAX = 13

function lado(lots: readonly LotView[]): LadoRegla {
  const cantidad = lots.reduce((s, l) => s + l.quantity, 0)
  const coste = lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
  return { compras: lots.length, cantidad, precioMedio: cantidad > 0 ? coste / cantidad : null }
}

export function reglaPrecios(lots: readonly LotView[], price: number, avg: number | null): ReglaPrecios | null {
  const validos = lots.filter(l => l.quantity > 0 && l.unitCost > 0)
  if (validos.length === 0) return null
  const hasPrice = price > 0
  const valores = [...validos.map(l => l.unitCost), ...(hasPrice ? [price] : []), ...(avg && avg > 0 ? [avg] : [])]
  const lo = Math.min(...valores)
  const hi = Math.max(...valores)
  const log = lo > 0 && hi / lo > 20
  // Margen a cada lado para que los círculos de los extremos no se corten.
  const f = (x: number) => (log ? Math.log(x) : x)
  const a = f(lo), b = f(hi)
  const pad = (b - a || Math.abs(a) || 1) * 0.06
  const pos = (x: number) => ((f(x) - (a - pad)) / (b - a + 2 * pad)) * 100
  const maxQty = Math.max(...validos.map(l => l.quantity))
  const circulos = validos
    .map(l => ({
      lotId: l.lotId,
      openedAt: l.openedAt,
      price: l.unitCost,
      quantity: l.quantity,
      pos: pos(l.unitCost),
      radio: RADIO_MIN + (RADIO_MAX - RADIO_MIN) * Math.sqrt(l.quantity / maxQty),
      enBeneficio: hasPrice ? l.unitCost <= price : null,
    }))
    // Los grandes primero: los pequeños quedan encima y se pueden señalar.
    .sort((x, y) => y.quantity - x.quantity)
  const ben = hasPrice ? validos.filter(l => l.unitCost <= price) : []
  const per = hasPrice ? validos.filter(l => l.unitCost > price) : []
  const total = validos.reduce((s, l) => s + l.quantity, 0)
  const beneficio = lado(ben)
  return {
    circulos, min: lo, max: hi, log,
    posPrecio: hasPrice ? pos(price) : null,
    posMedio: avg && avg > 0 ? pos(avg) : null,
    beneficio,
    perdida: lado(per),
    pctBeneficio: hasPrice && total > 0 ? (beneficio.cantidad / total) * 100 : null,
  }
}
