import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../api/portfolio'
import { useTimezoneStore } from '../store/timezoneStore'

export const TIMEZONE_QUERY_KEY = ['settings', 'timezone'] as const

/**
 * Lleva la zona horaria efectiva del backend al store (#390). Hasta que llega
 * se usa la de por defecto; si cambia (en Ajustes), las páginas se repintan.
 */
export function useTimezoneSync(): void {
  const { data } = useQuery({ queryKey: TIMEZONE_QUERY_KEY, queryFn: portfolioApi.getTimezone, staleTime: 5 * 60_000 })
  const setTz = useTimezoneStore(s => s.setTz)
  useEffect(() => {
    if (data?.timezone && data.timezone !== useTimezoneStore.getState().tz) setTz(data.timezone)
  }, [data?.timezone, setTz])
}
