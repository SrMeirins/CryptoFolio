import { useMemo } from 'react'
import type { LiveDayBase } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { liveDayPnl, type LiveDayPnl } from '../utils/livePnl'
import type { Currency } from '../utils/format'

/**
 * P&L de hoy (desde las 00:00, hora de Madrid) recalculado con cada precio en
 * vivo (#213). null mientras no haya base del servidor o, en USD, tipo de cambio.
 */
export function useLiveDayPnl(base: LiveDayBase | null | undefined, currency: Currency): LiveDayPnl | null {
  const prices = usePricesStore(s => s.prices)
  return useMemo(() => (base ? liveDayPnl(base, prices, currency) : null), [base, prices, currency])
}
