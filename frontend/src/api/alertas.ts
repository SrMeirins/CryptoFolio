import { api } from './client'

// API de alertas (#519): de precio (un activo por encima o por debajo de un
// precio, una vez o cada vez) y de cartera (cambio del valor en 24 h).

export type SentidoAlerta = 'por_encima' | 'por_debajo'
export type RepeticionAlerta = 'una_vez' | 'cada_vez'

export interface Alerta {
  id: string
  tipo: 'precio' | 'cartera'
  activo: string | null
  sentido: SentidoAlerta | null
  precio: number | null
  moneda: 'EUR' | 'USD'
  repeticion: RepeticionAlerta
  umbral_pct: number | null
  activa: boolean
  armada: boolean
  ultimo_disparo_at: string | null
  ultimo_valor: number | null
  created_at: string
}

export type NuevaAlerta =
  | { tipo: 'precio'; activo: string; sentido: SentidoAlerta; precio: number; moneda: 'EUR' | 'USD'; repeticion: RepeticionAlerta }
  | { tipo: 'cartera'; umbral_pct: number }

export type CambiosAlerta = Partial<Pick<Alerta, 'activa' | 'sentido' | 'precio' | 'moneda' | 'repeticion' | 'umbral_pct'>>

export const alertasApi = {
  listar: () => api.get<{ alertas: Alerta[] }>('/v1/alertas'),
  crear: (a: NuevaAlerta) => api.post<{ alerta: Alerta }>('/v1/alertas', a),
  editar: (id: string, cambios: CambiosAlerta) => api.put<{ alerta: Alerta }>(`/v1/alertas/${encodeURIComponent(id)}`, cambios),
  borrar: (id: string) => api.delete<void>(`/v1/alertas/${encodeURIComponent(id)}`),
}
