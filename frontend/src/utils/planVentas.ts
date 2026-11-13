import type { EfectoPlan, FiscalPlanner, VentaPlanGuardada, VentaPlanSimular } from '../api/portfolio'
import { formatEur, formatEurSigned, formatNumber } from './format'
import type { PlanLot } from './planificador'

// Plan de ventas de fin de año (#546): precio de cada venta (propio o en vivo),
// composición del colchón, saldos por activo y wallet, y el texto para copiar.
// Funciones puras.

/** Precio de una venta: el propio si lo tiene; si no, el en vivo (null si aún no hay). */
export function precioDe(v: Pick<VentaPlanGuardada, 'asset' | 'precioEur'>, prices: Readonly<Record<string, number>>): number | null {
  if (v.precioEur !== null) return v.precioEur
  const p = prices[v.asset]
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Ventas listas para simular, o null si a alguna aún le falta precio. */
export function ventasParaSimular(ventas: readonly VentaPlanGuardada[], prices: Readonly<Record<string, number>>): VentaPlanSimular[] | null {
  const out: VentaPlanSimular[] = []
  for (const v of ventas) {
    const precioEur = precioDe(v, prices)
    if (precioEur === null) return null
    out.push({ asset: v.asset, walletId: v.walletId, cantidad: v.cantidad, precioEur })
  }
  return out
}

export interface ComposicionColchon {
  /** Pérdida neta del año (0 si el año va en ganancia). */
  perdidaAnio: number
  /** Pérdidas pendientes de años anteriores que no caducan este año. */
  pendientes: number
  /** Pérdidas pendientes que caducan el 31 de diciembre. */
  caducan: number
  /** Lo que ya no queda: absorbido por las ganancias del año o no aprovechable con las reglas de compensación. */
  usado: number
  colchon: number
}

/** De dónde sale el colchón y qué queda: los orígenes menos lo ya usado. */
export function composicionColchon(d: Pick<FiscalPlanner, 'netoAnio' | 'pendienteVigente' | 'caducanEsteAnio' | 'colchon'>): ComposicionColchon {
  const perdidaAnio = Math.max(0, -d.netoAnio)
  const caducan = Math.min(d.caducanEsteAnio, d.pendienteVigente)
  const pendientes = Math.max(0, d.pendienteVigente - caducan)
  const usado = Math.max(0, perdidaAnio + pendientes + caducan - d.colchon)
  return { perdidaAnio, pendientes, caducan, usado, colchon: d.colchon }
}

/** Activos con saldo, y por cada uno sus wallets con la cantidad, para la venta libre. */
export function saldos(lotes: readonly PlanLot[]): { asset: string; total: number; wallets: { id: string; nombre: string; cantidad: number }[] }[] {
  const porActivo = new Map<string, Map<string, { id: string; nombre: string; cantidad: number }>>()
  for (const l of lotes) {
    const ws = porActivo.get(l.asset) ?? new Map()
    const w = ws.get(l.walletId) ?? { id: l.walletId, nombre: l.walletName, cantidad: 0 }
    w.cantidad += l.quantity
    ws.set(l.walletId, w)
    porActivo.set(l.asset, ws)
  }
  return [...porActivo].map(([asset, ws]) => {
    const wallets = [...ws.values()].sort((a, b) => b.cantidad - a.cantidad)
    return { asset, total: wallets.reduce((s, w) => s + w.cantidad, 0), wallets }
  }).sort((a, b) => a.asset.localeCompare(b.asset))
}

/** Plan en texto legible para pegar en notas o un mensaje. */
export function textoPlan(opts: {
  ejercicio: number
  fecha: string
  ventas: readonly VentaPlanGuardada[]
  prices: Readonly<Record<string, number>>
  efecto: EfectoPlan | null
  comisionPct: number
}): string {
  const lineas = [`Plan de fin de año ${opts.ejercicio} (${opts.fecha})`]
  opts.ventas.forEach((v, i) => {
    const precio = precioDe(v, opts.prices)
    const r = opts.efecto?.ventas[i]
    lineas.push(`- Vender ${formatNumber(v.cantidad, 8)} ${v.asset} de ${v.walletNombre}`
      + (precio !== null ? ` a ${formatEur(precio)}${v.precioEur !== null ? ' (precio propio)' : ''}` : '')
      + (r ? `: ${formatEurSigned(r.resultado)}` : ''))
  })
  const e = opts.efecto
  if (e) {
    lineas.push(`Ganancia ${formatEur(e.ganancia)} | Pérdida ${formatEur(Math.abs(e.perdida))} | Neto ${formatEurSigned(e.neto)}`)
    lineas.push(`Cuota: ${formatEur(e.cuotaAntes)}, con el plan ${formatEur(e.cuotaDespues)} (${formatEurSigned(e.cuotaDespues - e.cuotaAntes)})`)
  }
  lineas.push(`Comisión estimada ${String(opts.comisionPct).replace('.', ',')} %. Calculado con FIFO global.`)
  return lineas.join('\n')
}

/**
 * Cantidad o precio escritos a mano: coma o punto como decimal y sin
 * separador de miles (en cripto «0.123» son 0,123 unidades, no 123). NaN si no es un número.
 */
export function parseCantidad(raw: string): number {
  const t = raw.trim().replace(/\s|€/g, '')
  if (!/^\d+([.,]\d+)?$/.test(t)) return Number.NaN
  return Number(t.replace(',', '.'))
}

/** Cantidad para escribir en un campo: coma decimal, sin miles y sin ceros sobrantes (hasta 8 decimales). */
export function cantidadEnCampo(n: number): string {
  return String(Math.round(n * 1e8) / 1e8).replace('.', ',')
}

export type ClavePaso = 'perdidaAnio' | 'pendientes' | 'caducan' | 'usado' | 'colchon'

export interface PasoColchon { clave: ClavePaso; titulo: string; importe: number; desde: number; hasta: number; tipo: 'suma' | 'resta' | 'total' }

/**
 * Cascada del colchón: cada origen sube, lo ya usado baja y el último paso es
 * el colchón (desde 0). Los orígenes a cero no se dibujan; el colchón, siempre.
 */
export function cascadaColchon(c: ComposicionColchon): PasoColchon[] {
  const pasos: PasoColchon[] = []
  let nivel = 0
  const suma = (clave: ClavePaso, titulo: string, importe: number) => {
    if (importe <= 0.005) return
    pasos.push({ clave, titulo, importe, desde: nivel, hasta: nivel + importe, tipo: 'suma' })
    nivel += importe
  }
  suma('perdidaAnio', 'Pérdida del año', c.perdidaAnio)
  suma('pendientes', 'Pendientes de años anteriores', c.pendientes)
  suma('caducan', 'Caducan el 31 de diciembre', c.caducan)
  if (c.usado > 0.005) {
    pasos.push({ clave: 'usado', titulo: 'Ya usado', importe: -c.usado, desde: nivel, hasta: nivel - c.usado, tipo: 'resta' })
    nivel -= c.usado
  }
  pasos.push({ clave: 'colchon', titulo: 'Colchón', importe: c.colchon, desde: 0, hasta: c.colchon, tipo: 'total' })
  return pasos
}

/** Importe en euros escrito a mano, con signo opcional (una pérdida es negativa). NaN si no es un número. */
export function parseImporteConSigno(raw: string, parse: (s: string) => number): number {
  const t = raw.trim()
  const negativo = /^[-−]/.test(t)
  const n = parse(t.replace(/^[-−+]\s*/, ''))
  return negativo ? -n : n
}
