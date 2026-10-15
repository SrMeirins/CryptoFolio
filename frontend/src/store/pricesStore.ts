import { create } from 'zustand'

interface PricesStore {
  prices: Record<string, number>
  // Precio en EUR de hace 24h por activo (apertura de la ventana móvil de 24h), en vivo.
  open24: Record<string, number>
  connected: boolean
  lastUpdate: Date | null
  // Estado del feed de Binance que envía el backend (#194): antigüedad del
  // último dato y cuándo llegó ese estado (ms epoch).
  feedAgeMs: number | null
  statusAt: number | null
  // Pares suscritos en Binance y si esa conexión está abierta (#200); null hasta el primer estado.
  feedPairs: number | null
  binanceConnected: boolean | null
  setPrices: (prices: Record<string, number>) => void
  mergePrices: (updates: Record<string, number>) => void
  mergeOpen24: (updates: Record<string, number>) => void
  setConnected: (v: boolean) => void
  setFeedStatus: (status: { feedAgeMs: number | null; statusAt: number; pairs?: number | null; binanceConnected?: boolean | null }) => void
}

export const usePricesStore = create<PricesStore>((set) => ({
  prices: {},
  open24: {},
  connected: false,
  lastUpdate: null,
  feedAgeMs: null,
  statusAt: null,
  feedPairs: null,
  binanceConnected: null,
  setPrices: (prices) => set({ prices, lastUpdate: new Date() }),
  mergePrices: (updates) => set((s) => ({ prices: { ...s.prices, ...updates }, lastUpdate: new Date() })),
  mergeOpen24: (updates) => set((s) => ({ open24: { ...s.open24, ...updates } })),
  setConnected: (connected) => set(connected ? { connected } : { connected, feedAgeMs: null, statusAt: null, feedPairs: null, binanceConnected: null }),
  setFeedStatus: ({ feedAgeMs, statusAt, pairs = null, binanceConnected = null }) => set({ feedAgeMs, statusAt, feedPairs: pairs, binanceConnected }),
}))
