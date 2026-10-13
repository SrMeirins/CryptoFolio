import { useEffect } from 'react'
import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import type { Currency } from '../utils/format'
import { otherCurrency, sameCurrencyPlaceholder } from '../utils/currencyQuery'
import { useCurrency } from './useDisplayCurrency'

/**
 * useQuery para datos que dependen de la moneda de visualización (#177):
 *
 * - Consulta la moneda activa y, cuando llega, precarga la otra en segundo
 *   plano: el toggle EUR ↔ USD lee de la caché y es instantáneo.
 * - Al cambiar otros parámetros (periodo, mes) mantiene los datos anteriores
 *   mientras carga, pero nunca los de la otra moneda, para no mostrar euros
 *   con el símbolo del dólar.
 *
 * `build` crea las opciones para una moneda; la moneda debe ir en la segunda
 * posición de la clave (ver queries/currencyQueries.ts). `extra` añade
 * opciones de la vista (refetchInterval, enabled) solo a la consulta activa.
 */
export function useCurrencyQuery<TData, TKey extends QueryKey>(
  build: (currency: Currency) => UseQueryOptions<TData, Error, TData, TKey>,
  extra: Pick<UseQueryOptions<TData, Error, TData, TKey>, 'refetchInterval' | 'enabled'> = {},
) {
  const enabled = extra.enabled !== false
  const currency = useCurrency()
  const queryClient = useQueryClient()
  const options = build(currency)
  const result = useQuery({
    ...options,
    ...extra,
    // Cast: el tipo genérico NonFunctionGuard<TData> de react-query no se resuelve con TData abierto.
    placeholderData: sameCurrencyPlaceholder<TData>(currency) as UseQueryOptions<TData, Error, TData, TKey>['placeholderData'],
  })

  const other = build(otherCurrency(currency))
  const otherKey = JSON.stringify(other.queryKey)
  useEffect(() => {
    if (enabled && result.isSuccess) void queryClient.prefetchQuery(other)
    // `other` se recrea en cada render; su clave identifica la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, result.isSuccess, otherKey, queryClient])

  return { ...result, currency }
}
