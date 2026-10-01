import { useState, useEffect } from 'react'

const WITHDRAWAL_DEST_KEY = 'import_withdrawal_dest'
const DEPOSIT_COSTS_KEY   = 'import_deposit_costs'

/**
 * Estado persistido en sessionStorage mientras dura el flujo de importación
 * (sobrevive a un refresco de página, pero no a cerrar la pestaña). Usado
 * para las asignaciones de wallet de retiro y el coste de adquisición de
 * depósitos externos, que el usuario puede tardar en revisar.
 */
function useImportSessionState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch { return fallback }
  })

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* ignorar */ }
  }, [key, value])

  return [value, setValue] as const
}

export function useWithdrawalDestinations() {
  return useImportSessionState<Record<string, string>>(WITHDRAWAL_DEST_KEY, {})
}

export function useDepositCosts() {
  return useImportSessionState<Record<string, number | null>>(DEPOSIT_COSTS_KEY, {})
}

export function clearImportSessionStorage() {
  try {
    sessionStorage.removeItem(WITHDRAWAL_DEST_KEY)
    sessionStorage.removeItem(DEPOSIT_COSTS_KEY)
  } catch { /* ignorar */ }
}
