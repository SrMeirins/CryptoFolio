import { useMemo } from 'react'
import type { FifoLot } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { useCurrency } from './useDisplayCurrency'
import { convertLots, convertOpen24, convertPrices, liveRate } from '../utils/displayMarket'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { dustThresholdEur } from '../utils/preferences'
import type { Currency } from '../utils/format'

export interface DisplayMarket {
  currency: Currency
  /** Unidades de la moneda por EUR en vivo (1 en EUR); null en USD sin precio de USDT aún. */
  rate: number | null
  prices: Readonly<Record<string, number>>
  open24: Readonly<Record<string, number>>
  /** Valor de 1 € hace 24h en la moneda de visualización (1 en EUR); null si falta el USDT de hace 24h. */
  fiatOpen24: number | null
  /** Umbral de polvo (1 €) expresado en la moneda de visualización. */
  dustThreshold: number
}

/**
 * Precios en vivo y de hace 24h en la moneda de visualización (#177). En EUR
 * devuelve los mismos objetos del store; en USD los convierte con el USDT del
 * feed, así que el cambio de moneda no espera a ninguna petición.
 */
export function useDisplayMarket(): DisplayMarket {
  const currency = useCurrency()
  const rawPrices = usePricesStore(s => s.prices)
  const rawOpen24 = usePricesStore(s => s.open24)

  const prices = useMemo(() => convertPrices(rawPrices, currency), [rawPrices, currency])
  const open24 = useMemo(() => convertOpen24(rawOpen24, rawPrices, currency), [rawOpen24, rawPrices, currency])
  const rate = liveRate(currency, rawPrices)

  // El EUR de hace 24h, con el USDT de hace 24h (mismo criterio que convertOpen24).
  const fiatOpen24 = liveRate(currency, rawOpen24)

  // Umbral de polvo configurable (#446), en euros y convertido a la moneda visible.
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  return { currency, rate, prices, open24, fiatOpen24, dustThreshold: dustThresholdEur(config) * (rate ?? 1) }
}

/**
 * Lotes con el coste en la moneda de visualización. Depende solo del tipo
 * en vivo cuando falta el coste histórico en USD; en EUR, mismo array.
 */
export function useDisplayLots(lots: FifoLot[], market: Pick<DisplayMarket, 'currency' | 'rate'>): FifoLot[] {
  const { currency, rate } = market
  // El tipo en vivo solo hace falta como respaldo: redondearlo evita recrear
  // los lotes en cada tick de USDT.
  const roundedRate = rate === null ? null : Math.round(rate * 1e4) / 1e4
  return useMemo(() => convertLots(lots, currency, roundedRate), [lots, currency, roundedRate])
}
