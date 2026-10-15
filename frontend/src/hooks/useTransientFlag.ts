import { useEffect, useState } from 'react'

/**
 * `true` durante `ms` al montarse y cada vez que cambia `key`; después, `false`.
 * Lo usa el gráfico de evolución (#255) para animar solo al cambiar de periodo
 * o de unidad, y no con cada tick de precios en vivo. El estado se ajusta
 * durante el render (patrón de estado derivado de React), sin setState
 * síncrono en un efecto.
 */
export function useTransientFlag(key: string, ms: number): boolean {
  const [state, setState] = useState({ key, active: true })
  if (state.key !== key) setState({ key, active: true })

  useEffect(() => {
    if (!state.active) return
    const timer = setTimeout(() => setState(s => (s.key === state.key ? { ...s, active: false } : s)), ms)
    return () => clearTimeout(timer)
  }, [state, ms])

  return state.key === key ? state.active : true
}
