import { useRef, type KeyboardEvent } from 'react'
import { useDisplayCurrency } from '../hooks/useDisplayCurrency'
import { CURRENCIES, CURRENCY_TOOLTIP, currencyForKey } from '../utils/displayCurrency'

const SYMBOL = { EUR: '€', USD: '$' } as const

/**
 * Selector EUR | USD (#176). Grupo de opciones accesible: Tab entra en la
 * opción activa y las flechas, Inicio y Fin cambian de moneda.
 */
export function CurrencyToggle({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { currency, setCurrency } = useDisplayCurrency()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = currencyForKey(currency, e.key)
    if (!next) return
    e.preventDefault()
    setCurrency(next)
    refs.current[next]?.focus()
  }

  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'

  return (
    <div
      role="radiogroup"
      aria-label="Moneda de visualización"
      title={CURRENCY_TOOLTIP}
      onKeyDown={onKeyDown}
      className="flex shrink-0 items-center p-0.5 rounded-lg border border-border bg-background-tertiary"
    >
      {CURRENCIES.map(c => {
        const active = c === currency
        return (
          <button
            key={c}
            ref={el => { refs.current[c] = el }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setCurrency(c)}
            className={`${pad} whitespace-nowrap rounded-md font-medium mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
              active ? 'bg-background-card text-white shadow-sm' : 'text-gray-500 hover:text-white'
            }`}
          >
            {c} <span aria-hidden="true" className="text-gray-500">{SYMBOL[c]}</span>
          </button>
        )
      })}
    </div>
  )
}
