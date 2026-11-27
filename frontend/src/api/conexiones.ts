import { api } from './client'

// Ajustes, Conexiones (versión 1.0): claves de API de servicios externos. La
// API nunca devuelve ninguna clave, solo su estado.
export type ServicioId = 'etherscan' | 'blockfrost' | 'subscan' | 'coingecko'
export type EstadoClave = 'configurada' | 'entorno' | 'sin_configurar' | 'ilegible'
export type PlanCoinGecko = 'demo' | 'pro'
export type Comprobacion = 'aceptada' | 'rechazada' | 'sin_respuesta'

export interface EstadoServicio {
  id: ServicioId
  nombre: string
  red: string | null
  enlace: string
  estado: EstadoClave
  actualizada: string | null
  plan: PlanCoinGecko | null
  direcciones: number
}

export interface Conexiones { claveMaestra: boolean; servicios: EstadoServicio[] }

export const conexionesApi = {
  listar: () => api.get<Conexiones>('/settings/conexiones'),
  guardar: (id: ServicioId, apiKey: string, plan?: PlanCoinGecko) =>
    api.put<{ guardada: true; comprobacion: Comprobacion }>(`/settings/conexiones/${id}`, { api_key: apiKey, ...(plan && { plan }) }),
  quitar: (id: ServicioId) => api.delete<{ quitada: true }>(`/settings/conexiones/${id}`),
  probar: (id: ServicioId) => api.post<{ comprobacion: Comprobacion | 'ilegible' | null }>(`/settings/conexiones/${id}/probar`),
}
