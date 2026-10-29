import { useDisplayCurrency } from '../hooks/useDisplayCurrency'
import { CURRENCIES, CURRENCY_TOOLTIP } from '../utils/displayCurrency'
import { usePricesStore } from '../store/pricesStore'
import { liveRateText } from '../utils/liveIndicator'
import { SegmentedControl } from './ui'
import type { Currency } from '../utils/format'

const SYMBOL = { EUR: '€', USD: '$' } as const

/**
 * Selector EUR | USD (#176), sobre el selector segmentado común (#199), con
 * indicador deslizante y el tipo en vivo en el tooltip (#200).
 */
/** `onChanged` (#445): Ajustes ofrece Deshacer con la moneda anterior. */
export function CurrencyToggle({ size = 'sm', onChanged }: { size?: 'sm' | 'md'; onChanged?: (previous: Currency, next: Currency) => void }) {
  const { currency, setCurrency } = useDisplayCurrency()
  const usdt = usePricesStore(s => s.prices.USDT)
  return (
    <div title={`${liveRateText(usdt)}\n${CURRENCY_TOOLTIP}`}>
      <SegmentedControl
        label="Moneda de visualización"
        size={size}
        variant="accent"
        value={currency}
        onChange={next => { if (next === currency) return; setCurrency(next); onChanged?.(currency, next) }}
        options={CURRENCIES.map(c => ({
          value: c,
          label: <span className="mono">{c} <span aria-hidden="true" className="font-bold">{SYMBOL[c]}</span></span>,
        }))}
      />
    </div>
  )
}
