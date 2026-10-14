import type { AssetValuation } from './portfolioValuation'

// Variación de 24h de la cartera (#147) a partir de la valoración común y del
// precio de hace 24h de cada activo que difunde el backend en tiempo real.
//
// - Cripto con precio actual y de hace 24h: valor hoy vs. cantidad × precio de hace 24h.
// - Cripto con precio actual pero sin precio de hace 24h: se excluye del
//   cálculo y se lista en `excluded` (p. ej. activos que solo cotizan en CoinGecko).
// - Cripto sin precio actual: no tiene valor, no participa.
// - Fiat: hoy vale cantidad × precio actual; hace 24h, cantidad × `fiatOpen24`
//   (precio de la unidad fiat hace 24h en la moneda de visualización). En EUR
//   ambos son 1 y la variación es 0; en USD refleja el movimiento del EUR/USD
//   (#184). Sin `fiatOpen24`, se asume el precio actual (variación 0).

export type Change24hResult =
  | { status: 'ok'; eur: number; pct: number; excluded: string[] }
  | { status: 'unavailable'; reason: 'no-prices' | 'no-reference' }

export function computeChange24h(
  assets: readonly AssetValuation[],
  open24: Readonly<Record<string, number>>,
  fiatOpen24: number | null = null,
): Change24hResult {
  let today = 0
  let yesterday = 0
  let pricedCrypto = 0
  let coveredCrypto = 0
  const excluded: string[] = []
  let fiatMoved = false

  for (const a of assets) {
    if (a.kind === 'fiat') {
      today += a.value
      if (fiatOpen24 !== null && fiatOpen24 > 0) {
        yesterday += a.quantity * fiatOpen24
        if (a.value !== a.quantity * fiatOpen24) fiatMoved = true
      } else {
        yesterday += a.value
      }
      continue
    }
    if (a.price === null) continue
    pricedCrypto++
    const open = open24[a.asset]
    if (open === undefined || !(open > 0)) {
      excluded.push(a.asset)
      continue
    }
    coveredCrypto++
    today += a.value
    yesterday += a.quantity * open
  }

  // Una cartera solo con fiat tiene variación si el tipo de cambio se ha movido.
  if (pricedCrypto === 0 && !fiatMoved) return { status: 'unavailable', reason: 'no-prices' }
  if (pricedCrypto > 0 && coveredCrypto === 0) return { status: 'unavailable', reason: 'no-reference' }

  const eur = today - yesterday
  return { status: 'ok', eur, pct: yesterday > 0 ? (eur / yesterday) * 100 : 0, excluded }
}
