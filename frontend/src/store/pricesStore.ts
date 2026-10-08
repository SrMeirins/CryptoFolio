import { create } from 'zustand'

interface PricesStore {
  prices: Record<string, number>
  // Precio en EUR de hace 24h por activo (apertura de la ventana móvil de 24h), en vivo.
  open24: Record<string, number>
  connected: boolean
  lastUpdate: Date | null
  setPrices: (prices: Record<string, number>) => void
  mergePrices: (updates: Record<string, number>) => void
  mergeOpen24: (updates: Record<string, number>) => void
  setConnected: (v: boolean) => void
}

export const usePricesStore = create<PricesStore>((set) => ({
  prices: {},
  open24: {},
  connected: false,
  lastUpdate: null,
  setPrices: (prices) => set({ prices, lastUpdate: new Date() }),
  mergePrices: (updates) => set((s) => ({ prices: { ...s.prices, ...updates }, lastUpdate: new Date() })),
  mergeOpen24: (updates) => set((s) => ({ open24: { ...s.open24, ...updates } })),
  setConnected: (connected) => set({ connected }),
}))
