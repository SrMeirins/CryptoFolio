import { create } from 'zustand'

// Panel de atajos de teclado (#535): lo abren el botón de la barra superior, la
// tecla «?» en cualquier pantalla y el botón de la barra de Historial.
interface ShortcutsState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useShortcutsStore = create<ShortcutsState>(set => ({
  open: false,
  setOpen: open => set({ open }),
}))
