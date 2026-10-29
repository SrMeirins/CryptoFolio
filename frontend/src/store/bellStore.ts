import { create } from 'zustand'

// Panel de avisos de la barra superior (#447): abierto o cerrado, para que
// Ajustes pueda abrirlo desde su resumen de notificaciones.
interface BellState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useBellStore = create<BellState>(set => ({
  open: false,
  setOpen: open => set({ open }),
}))
