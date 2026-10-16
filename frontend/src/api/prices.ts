import { api } from './client'

// Cierres diarios en EUR (hora de Madrid) para los mini-gráficos (#282).
export interface PriceCloses {
  days: number
  closes: Record<string, { date: string; price: number }[]>
}

export const pricesApi = {
  getCloses: (assets: readonly string[], days = 7) =>
    api.get<PriceCloses>(`/v1/prices/closes?assets=${encodeURIComponent(assets.join(','))}&days=${days}`),
}
