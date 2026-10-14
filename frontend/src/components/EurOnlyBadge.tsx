import { useCurrency } from '../hooks/useDisplayCurrency'

const EUR_ONLY_TEXT = 'La fiscalidad se calcula y se muestra siempre en EUR, la moneda en la que se declara a la AEAT.'

/**
 * Indicación de que una sección fiscal sigue en EUR (#177). Solo se muestra
 * cuando la moneda de visualización es USD, que es cuando puede confundir.
 */
export function EurOnlyBadge() {
  const currency = useCurrency()
  if (currency === 'EUR') return null
  return (
    <span
      title={EUR_ONLY_TEXT}
      className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase text-warning bg-warning/10 border border-warning/25 px-1.5 py-0.5 rounded-lg whitespace-nowrap"
    >
      En EUR
      <span className="sr-only">: {EUR_ONLY_TEXT}</span>
    </span>
  )
}
