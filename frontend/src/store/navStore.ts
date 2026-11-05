import { create } from 'zustand'

// Menú en cajón de las pantallas estrechas (#499): lo abre el botón de la barra
// superior y lo cierra el propio menú al navegar, con Escape o con un clic fuera.
interface NavState {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

export const useNavStore = create<NavState>(set => ({
  mobileOpen: false,
  setMobileOpen: mobileOpen => set({ mobileOpen }),
}))
