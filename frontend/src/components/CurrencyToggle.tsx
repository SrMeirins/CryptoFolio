import { useDisplayCurrency } from '../hooks/useDisplayCurrency'
import { CURRENCIES, CURRENCY_TOOLTIP } from '../utils/displayCurrency'
import { SegmentedControl } from './ui'

const SYMBOL = { EUR: '€', USD: '$' } as const

/** Selector EUR | USD (#176), sobre el selector segmentado común (#199). */
export function CurrencyToggle({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { currency, setCurrency } = useDisplayCurrency()
  return (
    <div title={CURRENCY_TOOLTIP}>
      <SegmentedControl
        label="Moneda de visualización"
        size={size}
        value={currency}
        onChange={setCurrency}
        options={CURRENCIES.map(c => ({
          value: c,
          label: <span className="mono">{c} <span aria-hidden="true" className="opacity-60">{SYMBOL[c]}</span></span>,
        }))}
      />
    </div>
  )
}
