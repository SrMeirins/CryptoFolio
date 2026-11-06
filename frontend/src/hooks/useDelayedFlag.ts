import { useEffect, useState } from 'react'
import { LOADING_DELAY_MS, scheduleDelayedFlag } from '../utils/delayedFlag'

/**
 * `true` solo cuando `active` lleva más de `delayMs` en true (#494). Evita que
 * esqueletos y barras de recarga parpadeen en las cargas rápidas.
 */
export function useDelayedFlag(active: boolean, delayMs = LOADING_DELAY_MS): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => scheduleDelayedFlag(active, delayMs, setShown), [active, delayMs])
  return active && shown
}
