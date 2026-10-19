import type { Modelo721, Modelo721Activo } from '../pages/fiscal/types'
import { sanitizeCsvField } from './csvSafety'

// Modelo 721 (#303): agrupación por exchange, autocustodia resumida y CSV.
// Funciones puras.

export interface ExchangeGroup {
  walletId: string
  name: string
  color: string
  valor: number
  activos: Modelo721Activo[]
  sinPrecio: number
}

export interface Modelo721View {
  exchanges: ExchangeGroup[]
  autocustodia: { valor: number; activos: number; wallets: number }
  /** Suma de los exchanges: debe coincidir con totalValorCustodia del backend. */
  totalExchanges: number
}

/** Solo los exchanges computan; cada uno con sus activos de mayor a menor valor. */
export function modelo721View(activos: readonly Modelo721Activo[]): Modelo721View {
  const groups = new Map<string, ExchangeGroup>()
  const selfWallets = new Set<string>()
  let selfValor = 0, selfActivos = 0
  for (const a of activos) {
    if (a.wallet_kind !== 'exchange') {
      selfValor += a.valorEur; selfActivos++; selfWallets.add(a.wallet_id)
      continue
    }
    const g = groups.get(a.wallet_id) ?? { walletId: a.wallet_id, name: a.wallet_name, color: a.wallet_color, valor: 0, activos: [], sinPrecio: 0 }
    g.valor += a.valorEur
    g.activos.push(a)
    if (a.sinPrecio) g.sinPrecio++
    groups.set(a.wallet_id, g)
  }
  const exchanges = [...groups.values()]
    .map(g => ({ ...g, activos: [...g.activos].sort((x, y) => y.valorEur - x.valorEur || x.asset.localeCompare(y.asset)) }))
    .sort((x, y) => y.valor - x.valor || x.name.localeCompare(y.name))
  return {
    exchanges,
    autocustodia: { valor: selfValor, activos: selfActivos, wallets: selfWallets.size },
    totalExchanges: exchanges.reduce((s, g) => s + g.valor, 0),
  }
}

/** Margen hasta el umbral (negativo si ya se supera). */
export function margenUmbral(data: Pick<Modelo721, 'totalValorCustodia' | 'umbral'>): number {
  return data.umbral - data.totalValorCustodia
}

const num = (n: number, d: number) => (Number.isFinite(n) ? n.toFixed(d) : '')

/** CSV de las posiciones en custodia de terceros (separador «;», textos saneados). */
export function buildModelo721Csv(data: Modelo721): string {
  const header = ['Fecha de valoración', 'Exchange', 'Activo', 'Cantidad', 'Precio (EUR)', 'Valor (EUR)', 'Sin precio'].join(';')
  const lines = modelo721View(data.activos).exchanges.flatMap(g => g.activos.map(a => [
    data.fecha, sanitizeCsvField(g.name), sanitizeCsvField(a.asset), num(a.quantity, 12).replace(/\.?0+$/, ''),
    a.sinPrecio ? '' : num(a.precioEur, 8).replace(/\.?0+$/, ''), num(a.valorEur, 2), a.sinPrecio ? 'sí' : '',
  ].join(';')))
  return [header, ...lines].join('\n')
}

/**
 * Año en curso con precios en vivo (#303): la valoración del backend es una
 * foto (con caché de minutos); aquí cada posición se recalcula con el precio
 * del feed. Sin precio en vivo, se mantiene el del backend. Los años cerrados
 * se valoran a 31 de diciembre y no se tocan.
 */
export function liveModelo721(data: Modelo721, pricesEur: Readonly<Record<string, number>>): Modelo721 {
  if (!data.esAnioEnCurso) return data
  let changed = false
  const activos = data.activos.map(a => {
    const p = pricesEur[a.asset]
    if (!(p && p > 0)) return a
    changed = true
    return { ...a, precioEur: p, valorEur: a.quantity * p, sinPrecio: false }
  })
  if (!changed) return data
  const totalValor = activos.reduce((s, a) => s + a.valorEur, 0)
  const totalValorCustodia = activos.filter(a => a.wallet_kind === 'exchange').reduce((s, a) => s + a.valorEur, 0)
  const preciosPendientes = [...new Set(activos.filter(a => a.sinPrecio).map(a => a.asset))]
  return {
    ...data, activos, totalValor, totalValorCustodia,
    superaUmbral: totalValorCustodia > data.umbral,
    preciosPendientes, incompleto: preciosPendientes.length > 0,
  }
}
