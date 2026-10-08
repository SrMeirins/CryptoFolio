import type { AssetValuation } from './portfolioValuation'

// Variación de 24h de la cartera (#147) a partir de la valoración común y del
// precio de hace 24h de cada activo que difunde el backend en tiempo real.
//
// - Cripto con precio actual y de hace 24h: valor hoy vs. cantidad × precio de hace 24h.
// - Cripto con precio actual pero sin precio de hace 24h: se excluye del
//   cálculo y se lista en `excluded` (p. ej. activos que solo cotizan en CoinGecko).
// - Cripto sin precio actual: no tiene valor, no participa.
// - Fiat: entra en la base con el mismo valor hoy y hace 24h (variación 0).

export type Change24hResult =
  | { status: 'ok'; eur: number; pct: number; excluded: string[] }
  | { status: 'unavailable'; reason: 'no-prices' | 'no-reference' }

export function computeChange24h(
  assets: readonly AssetValuation[],
  open24: Readonly<Record<string, number>>,
): Change24hResult {
  let today = 0
  let yesterday = 0
  let pricedCrypto = 0
  let coveredCrypto = 0
  const excluded: string[] = []

  for (const a of assets) {
    if (a.kind === 'fiat') {
      today += a.value
      yesterday += a.value
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

  if (pricedCrypto === 0) return { status: 'unavailable', reason: 'no-prices' }
  if (coveredCrypto === 0) return { status: 'unavailable', reason: 'no-reference' }

  const eur = today - yesterday
  return { status: 'ok', eur, pct: yesterday > 0 ? (eur / yesterday) * 100 : 0, excluded }
}
