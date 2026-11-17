import type { UnifiedRow } from './assetTable'
import { formatMoney, type Currency } from './format'

// Saldos residuales de Portfolio (#530): fichas por activo y wallet, valor sin
// «0,00 €» y reparto de lo recibido al registrar su conversión. Puras.

export const NOMBRE_RESTOS = 'Saldos residuales'
/** Antigüedad a partir de la cual un resto lleva la marca «Más de 1 año». */
export const DIAS_RESTO_VIEJO = 365
const DAY_MS = 86_400_000

export interface FichaResto {
  /** activo|wallet: identifica la ficha y su selección. */
  key: string
  asset: string
  walletId: string
  walletName: string
  walletColor: string
  quantity: number
  /** Valor en la moneda de visualización; 0 sin precio. */
  value: number
  ageDays: number | null
  viejo: boolean
}

/**
 * Una ficha por activo y wallet: la conversión de restos se hace dentro de
 * una wallet, así que cada parte se selecciona por separado. El valor se
 * reparte según la cantidad de cada wallet. Orden: de más a menos valor.
 */
export function fichasRestos(rows: readonly UnifiedRow[], now: Date = new Date()): FichaResto[] {
  const out: FichaResto[] = []
  for (const r of rows) {
    if (r.kind !== 'crypto') continue
    const unit = r.totalQuantity > 0 ? r.value / r.totalQuantity : 0
    const ageDays = r.firstOpenedAt ? Math.max(0, Math.floor((now.getTime() - r.firstOpenedAt) / DAY_MS)) : null
    for (const w of r.wallets) {
      if (!(w.quantity > 0)) continue
      out.push({
        key: `${r.asset}|${w.wallet_id}`,
        asset: r.asset,
        walletId: w.wallet_id,
        walletName: w.wallet_name,
        walletColor: w.wallet_color,
        quantity: w.quantity,
        value: w.quantity * unit,
        ageDays,
        viejo: ageDays !== null && ageDays > DIAS_RESTO_VIEJO,
      })
    }
  }
  return out.sort((a, b) => b.value - a.value || a.asset.localeCompare(b.asset))
}

/** Valor de un resto: «< 0,01 €» si no llega (#489) y «Sin precio» si no lo hay; nunca «0,00 €». */
export function valorResto(value: number, currency: Currency): string {
  // Por debajo de 1e-9 es ruido de coma flotante: formatMoney lo daría como «0,00 €».
  return value > 1e-9 ? formatMoney(value, currency) : 'Sin precio'
}

/**
 * Reparte el total recibido entre los restos según su valor; sin valor en
 * ninguno, a partes iguales. Redondea a 8 decimales y deja el resto del
 * redondeo en el mayor, para que la suma sea exactamente el total.
 */
export function repartirRecibido(fichas: readonly Pick<FichaResto, 'key' | 'value'>[], total: number): Record<string, number> {
  if (fichas.length === 0 || !(total > 0)) return {}
  const suma = fichas.reduce((s, f) => s + Math.max(0, f.value), 0)
  const pesos = fichas.map(f => (suma > 0 ? Math.max(0, f.value) / suma : 1 / fichas.length))
  const r8 = (n: number) => Math.round(n * 1e8) / 1e8
  const partes = pesos.map(p => r8(total * p))
  const mayor = pesos.indexOf(Math.max(...pesos))
  partes[mayor] = r8(partes[mayor] + (total - partes.reduce((s, x) => s + x, 0)))
  return Object.fromEntries(fichas.map((f, i) => [f.key, partes[i]]))
}

/** Diferencia entre lo repartido y el total (0 si cuadra al octavo decimal). */
export function descuadre(partes: readonly number[], total: number): number {
  const d = Math.round((partes.reduce((s, x) => s + x, 0) - total) * 1e8) / 1e8
  return Math.abs(d) < 1e-8 ? 0 : d
}
