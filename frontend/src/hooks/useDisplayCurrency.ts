import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import type { Currency } from '../utils/format'
import {
  DISPLAY_CURRENCY_KEY, readStoredCurrency, resolveCurrency, writeStoredCurrency,
} from '../utils/displayCurrency'
import { useToast } from './useToast'

type Config = Record<string, string>

const storage = typeof window !== 'undefined' ? window.localStorage : undefined

/** Solo lectura de la moneda de visualización, para las vistas que formatean importes. */
export function useCurrency(): Currency {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  return resolveCurrency(config, readStoredCurrency(storage))
}

/**
 * Moneda de visualización (#176). El cambio es optimista: se aplica en la
 * caché de ['config'] al instante (todas las vistas reaccionan en el mismo
 * render) y el guardado en el backend va detrás; si falla, se revierte.
 */
export function useDisplayCurrency() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const currency = useCurrency()

  const mutation = useMutation({
    mutationFn: (next: Currency) => portfolioApi.setConfig(DISPLAY_CURRENCY_KEY, next),
    onMutate: async (next: Currency) => {
      await queryClient.cancelQueries({ queryKey: ['config'] })
      const previous = queryClient.getQueryData<Config>(['config'])
      queryClient.setQueryData<Config>(['config'], c => ({ ...c, [DISPLAY_CURRENCY_KEY]: next }))
      writeStoredCurrency(storage, next)
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['config'], ctx.previous)
      writeStoredCurrency(storage, resolveCurrency(ctx?.previous, 'EUR'))
      toast.error('No se pudo guardar la moneda', 'Se mantiene la moneda anterior.')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })

  const { mutate } = mutation
  const setCurrency = useCallback((next: Currency) => {
    if (next !== currency) mutate(next)
  }, [currency, mutate])

  return { currency, setCurrency }
}
