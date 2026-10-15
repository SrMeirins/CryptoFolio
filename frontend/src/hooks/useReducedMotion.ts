import { useSyncExternalStore } from 'react'

// «Reducir movimiento» del sistema (#214). Las animaciones CSS ya se anulan en
// index.css; esta preferencia la consultan las que van por JavaScript (recharts).
const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia?.(QUERY)
  mql?.addEventListener('change', onChange)
  return () => mql?.removeEventListener('change', onChange)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(QUERY).matches ?? false, () => false)
}
