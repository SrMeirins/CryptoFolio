import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import {
  THEME_CONFIG_KEY, parseThemePreference, resolveTheme, writeStoredTheme,
  type EffectiveTheme, type ThemePreference,
} from '../utils/theme'
import { useToast } from './useToast'

type Config = Record<string, string>

const DARK_QUERY = '(prefers-color-scheme: dark)'
const storage = typeof window !== 'undefined' ? window.localStorage : undefined

function subscribeSystem(onChange: () => void): () => void {
  const mql = window.matchMedia(DARK_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches

/** Preferencia guardada y tema que se ve (sigue al sistema en vivo con «system»). */
export function useEffectiveTheme(): { preference: ThemePreference; theme: EffectiveTheme } {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const preference = parseThemePreference(config?.[THEME_CONFIG_KEY])
  const prefersDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => true)
  return { preference, theme: resolveTheme(preference, prefersDark) }
}

/** Aplica el tema al documento y guarda el efectivo para el arranque sin destello. Se monta una vez (App). */
export function useApplyTheme(): void {
  const { theme } = useEffectiveTheme()
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    writeStoredTheme(storage, theme)
  }, [theme])
}

/** Cambia la preferencia con actualización optimista (igual que la moneda, #176). */
export function useSetTheme(): (next: ThemePreference) => void {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { mutate } = useMutation({
    mutationFn: (next: ThemePreference) => portfolioApi.setConfig(THEME_CONFIG_KEY, next),
    onMutate: async (next: ThemePreference) => {
      await queryClient.cancelQueries({ queryKey: ['config'] })
      const previous = queryClient.getQueryData<Config>(['config'])
      queryClient.setQueryData<Config>(['config'], c => ({ ...c, [THEME_CONFIG_KEY]: next }))
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['config'], ctx.previous)
      toast.error('No se pudo guardar el tema', 'Se mantiene el tema anterior.')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
  return useCallback((next: ThemePreference) => mutate(next), [mutate])
}
