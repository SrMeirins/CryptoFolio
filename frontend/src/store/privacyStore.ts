import { create } from 'zustand'
import { setAmountsHidden } from '../utils/format'

// Modo privacidad (#254): oculta importes y cantidades en toda la app. La
// preferencia se recuerda en este navegador; si el almacenamiento no está
// disponible, vale solo para la sesión.

const KEY = 'cryptofolio.privacy'

function readHidden(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

function saveHidden(hidden: boolean): void {
  try { localStorage.setItem(KEY, hidden ? '1' : '0') } catch { /* almacenamiento no disponible */ }
}

const initial = readHidden()
setAmountsHidden(initial)

interface PrivacyState {
  hidden: boolean
  toggle: () => void
  /** Fija el modo (#446: privacidad al abrir). */
  setHidden: (hidden: boolean) => void
}

export const usePrivacyStore = create<PrivacyState>(set => ({
  hidden: initial,
  toggle: () => set(state => {
    const hidden = !state.hidden
    setAmountsHidden(hidden)
    saveHidden(hidden)
    return { hidden }
  }),
  setHidden: hidden => {
    setAmountsHidden(hidden)
    saveHidden(hidden)
    set({ hidden })
  },
}))
