import { create } from 'zustand'

// Menú en cajón de las pantallas estrechas (#499): lo abre el botón de la barra
// superior y lo cierra el propio menú al navegar, con Escape o con un clic fuera.
// También el plegado del menú lateral (#527), compartido para que la tabla de
// posiciones pueda plegarlo cuando no le caben las columnas.

const COLLAPSED_KEY = 'cflio_sidebar_collapsed'

function leerPlegado(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch (e) {
    if (e instanceof DOMException) return false
    throw e
  }
}

interface NavState {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  /** Preferencia guardada de menú plegado (en pantallas medianas se pliega igualmente). */
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

export const useNavStore = create<NavState>(set => ({
  mobileOpen: false,
  setMobileOpen: mobileOpen => set({ mobileOpen }),
  collapsed: leerPlegado(),
  setCollapsed: collapsed => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed))
    } catch (e) {
      if (!(e instanceof DOMException)) throw e
    }
    set({ collapsed })
  },
}))
