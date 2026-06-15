import { create } from 'zustand'

interface PricesStore {
  prices: Record<string, number>
  connected: boolean
  lastUpdate: Date | null
  setPrices: (prices: Record<string, number>) => void
  mergePrices: (updates: Record<string, number>) => void
  setConnected: (v: boolean) => void
}

export const usePricesStore = create<PricesStore>((set) => ({
  prices: {},
  connected: false,
  lastUpdate: null,
  setPrices: (prices) => set({ prices, lastUpdate: new Date() }),
  mergePrices: (updates) => set((s) => ({ prices: { ...s.prices, ...updates }, lastUpdate: new Date() })),
  setConnected: (connected) => set({ connected }),
}))
