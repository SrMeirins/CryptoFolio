import { useEffect, useState } from 'react'

export type FlashDirection = 'up' | 'down' | null

/**
 * Devuelve 'up' o 'down' durante `durationMs` cada vez que `value` cambia,
 * para resaltar actualizaciones en vivo (#153). El estado se ajusta durante el
 * render comparando con el valor anterior (patrón recomendado por React para
 * estado derivado de props), sin setState síncrono en un efecto.
 */
export function useFlashOnChange(value: number, durationMs = 700): FlashDirection {
  const [previous, setPrevious] = useState(value)
  const [flash, setFlash] = useState<FlashDirection>(null)

  if (value !== previous) {
    setPrevious(value)
    setFlash(value > previous ? 'up' : 'down')
  }

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), durationMs)
    return () => clearTimeout(timer)
  }, [flash, previous, durationMs])

  return flash
}
