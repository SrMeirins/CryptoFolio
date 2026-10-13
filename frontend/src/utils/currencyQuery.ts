import type { QueryKey } from '@tanstack/react-query'
import type { Currency } from './format'

export function otherCurrency(currency: Currency): Currency {
  return currency === 'EUR' ? 'USD' : 'EUR'
}

/**
 * placeholderData de react-query: reutiliza los datos de la consulta anterior
 * solo si eran de la misma moneda (segunda posición de la clave).
 */
export function sameCurrencyPlaceholder<T>(currency: Currency) {
  return (previous: T | undefined, previousQuery?: { queryKey: QueryKey }): T | undefined =>
    previousQuery?.queryKey[1] === currency ? previous : undefined
}
