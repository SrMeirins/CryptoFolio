import type { Alerta } from '../api/alertas'
import type { Currency } from './format'
import { formatPrice } from './format'

// Alertas (#519) en la interfaz: descripción, estado y conversión del precio a
// la moneda de un gráfico. Funciones puras.

export type EstadoAlerta = 'vigilando' | 'pausada' | 'disparada' | 'rearmando'

/**
 * Estado legible: pausada (el usuario la paró), disparada («una vez» ya
 * avisó y quedó desactivada), rearmando («cada vez» avisó y espera a que el
 * precio vuelva al otro lado) o vigilando.
 */
export function estadoAlerta(a: Pick<Alerta, 'activa' | 'armada' | 'repeticion' | 'ultimo_disparo_at' | 'tipo'>): EstadoAlerta {
  if (!a.activa) return a.repeticion === 'una_vez' && a.ultimo_disparo_at && a.tipo === 'precio' ? 'disparada' : 'pausada'
  if (a.tipo === 'precio' && !a.armada) return 'rearmando'
  return 'vigilando'
}

export const ESTADO_TEXTO: Record<EstadoAlerta, string> = {
  vigilando: 'Vigilando',
  pausada: 'Pausada',
  disparada: 'Disparada',
  rearmando: 'Esperando a que vuelva',
}

/** «Por encima de 0,60 €, una vez» o «Cartera: cambio en 24 h mayor que 5 %». */
export function describirAlerta(a: Pick<Alerta, 'tipo' | 'sentido' | 'precio' | 'moneda' | 'repeticion' | 'umbral_pct'>): string {
  if (a.tipo === 'cartera') return `Cambio del valor en 24 h mayor que ${String(a.umbral_pct ?? 0).replace('.', ',')} %, subiendo o bajando`
  const que = a.sentido === 'por_encima' ? 'Por encima de' : 'Por debajo de'
  return `${que} ${formatPrice(a.precio ?? 0, a.moneda as Currency)}, ${a.repeticion === 'una_vez' ? 'una vez' : 'cada vez'}`
}

/**
 * Precio de una alerta en la moneda de un gráfico. `rate` son unidades de la
 * moneda por EUR (como useDisplayMarket); sin él, solo si ya coinciden.
 */
export function precioEnMoneda(precio: number, de: 'EUR' | 'USD', a: Currency, rate: number | null): number | null {
  if (de === a) return precio
  if (!rate || rate <= 0) return null
  return de === 'EUR' ? precio * rate : precio / rate
}
