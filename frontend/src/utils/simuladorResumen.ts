import type { SimulationResult } from '../api/portfolio'
import { formatAmount, formatEur, formatPercent, formatPrice } from './format'
import { formatLotDate } from './portfolioLots'

// Resultado del simulador de venta presentado (#529): cascada de lo que se
// recibe, barra de los lotes que salen, fecha hasta la que no conviene
// recomprar y resumen en texto plano para copiar. Funciones puras.

export interface LineaCascada {
  key: 'importe' | 'comision' | 'irpf' | 'neto'
  label: string
  /** Importe en céntimos, siempre positivo; el signo lo da `op`. */
  cents: number
  op: '' | '-' | '='
}

export interface Cascada {
  lineas: LineaCascada[]
  /** Neto en mano en céntimos: importe menos comisión menos IRPF, exacto. */
  netoCents: number
  /** Ahorro de IRPF de una venta con pérdida (no entra en el neto); null si no hay. */
  ahorroIrpf: number | null
}

const cents = (eur: number) => Math.round(eur * 100)

/**
 * Cascada de «Qué recibes»: cada línea se redondea al céntimo y el neto se
 * obtiene restando esas mismas líneas, así que la suma cuadra exactamente con
 * lo que se ve. El IRPF solo resta si la venta lo genera; una pérdida que lo
 * ahorra se indica aparte (no es dinero que se reciba en esta venta).
 */
export function cascada(r: SimulationResult): Cascada {
  const importe = cents(r.totalProceeds)
  const comision = cents(r.totalFee)
  const irpf = cents(Math.max(0, r.irpf.marginal))
  const neto = importe - comision - irpf
  return {
    lineas: [
      { key: 'importe', label: 'Importe de la venta', cents: importe, op: '' },
      { key: 'comision', label: `Comisión (${formatPercent(r.feePct, 2)})`, cents: comision, op: '-' },
      { key: 'irpf', label: `IRPF estimado de ${r.irpf.year}`, cents: irpf, op: '-' },
      { key: 'neto', label: 'Neto en mano', cents: neto, op: '=' },
    ],
    netoCents: neto,
    ahorroIrpf: r.irpf.marginal < -0.005 ? Math.abs(r.irpf.marginal) : null,
  }
}

export interface TramoLote {
  lotId: string
  openedAt: string
  quantity: number
  /** Parte de la cantidad vendida (0 a 100). */
  share: number
  /** Parte del lote que se vende (0 a 100): 100 si sale entero. */
  fraccionLote: number
  /** Cantidad del lote antes de vender; mayor que `quantity` si sale solo en parte. */
  available: number
  unitCost: number
  costEur: number
  gainLossEur: number
  partial: boolean
}

/** Tramos de la barra de lotes que salen, en el orden FIFO. */
export function tramosLotes(r: SimulationResult): TramoLote[] {
  const lots = r.lotsConsumed.filter(l => l.qtyConsumed > 0)
  const total = lots.reduce((s, l) => s + l.qtyConsumed, 0)
  return lots.map(l => ({
    lotId: l.lotId,
    openedAt: l.openedAt,
    quantity: l.qtyConsumed,
    share: total > 0 ? (l.qtyConsumed / total) * 100 : 0,
    fraccionLote: l.qtyAvailable > 0 ? Math.min(100, (l.qtyConsumed / l.qtyAvailable) * 100) : 100,
    available: l.qtyAvailable,
    unitCost: l.pricePerUnit,
    costEur: l.costBasisConsumed,
    gainLossEur: l.gainLossEur,
    partial: l.partial,
  }))
}

/** Fecha hasta la que una recompra impediría computar la pérdida: dos meses después de vender. */
export function recompraHasta(venta: Date): Date {
  const d = new Date(venta)
  d.setMonth(d.getMonth() + 2)
  return d
}

const eur = (c: number) => formatEur(c / 100)

/**
 * Resumen en texto plano para copiar. Solo lleva la wallet de venta: nada de
 * las demás wallets (ni sus nombres ni sus saldos), aunque el FIFO global
 * venda lotes que estaban en ellas.
 */
export function resumenTexto(r: SimulationResult, opts: { walletName: string; fecha: Date }): string {
  const c = cascada(r)
  const tramos = tramosLotes(r)
  const linea = (k: LineaCascada['key']) => c.lineas.find(l => l.key === k)!
  const resultado = r.netGainLoss
  const out = [
    `Simulación de venta de ${r.asset} (${formatLotDate(opts.fecha.toISOString())}, estimación)`,
    `Wallet de venta: ${opts.walletName}`,
    `Cantidad: ${formatAmount(r.quantity)} ${r.asset} a ${formatPrice(r.priceEur)} por unidad`,
    `${linea('importe').label}: ${eur(linea('importe').cents)}`,
    `${linea('comision').label}: -${eur(linea('comision').cents)}`,
    `${linea('irpf').label}: -${eur(linea('irpf').cents)}`,
    `Neto en mano: ${eur(c.netoCents)}`,
    `Resultado fiscal: ${resultado >= 0 ? '+' : ''}${formatEur(resultado)} (coste FIFO ${formatEur(r.totalCostBasis)})`,
  ]
  if (c.ahorroIrpf !== null) out.push(`Ahorro de IRPF al compensar ganancias de ${r.irpf.year}: ${formatEur(c.ahorroIrpf)}`)
  if (tramos.length > 0) {
    const primera = formatLotDate(tramos[0].openedAt)
    const ultima = formatLotDate(tramos[tramos.length - 1].openedAt)
    out.push(`Lotes que salen (FIFO): ${tramos.length}, comprados ${primera === ultima ? `el ${primera}` : `del ${primera} al ${ultima}`}`)
  }
  out.push('Estimación orientativa con lo realizado en la app; no incluye otras rentas del ahorro ni deducciones.')
  return out.join('\n')
}
