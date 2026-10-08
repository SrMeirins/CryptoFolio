import { useEffect, useState } from 'react'

/**
 * Devuelve la hora actual (ms epoch) refrescada cada `intervalMs`.
 * Evita llamar a Date.now() durante el render, que lo haría impuro.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
