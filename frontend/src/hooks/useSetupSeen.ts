import { useState } from 'react'

const SETUP_KEY = 'cflio_setup_seen'

/**
 * Si el usuario ya ha visto/descartado el banner de "configura tus wallets
 * antes de importar". Antes Settings.tsx tenía este hook y Import.tsx
 * reimplementaba lo mismo a mano (mismo localStorage key, misma lógica),
 * sin compartir código.
 */
export function useSetupSeen() {
  const [seen, setSeen] = useState(() => localStorage.getItem(SETUP_KEY) === 'true')
  function markSeen() { localStorage.setItem(SETUP_KEY, 'true'); setSeen(true) }
  return { setupSeen: seen, markSetupSeen: markSeen }
}
