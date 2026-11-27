import type { Comprobacion, EstadoServicio } from '../api/conexiones'
import type { BadgeTone } from '../components/ui/classes'

// Textos de Ajustes, Conexiones (versión 1.0), puros para poder probarlos.

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

export function estadoClave(s: Pick<EstadoServicio, 'estado' | 'actualizada'>): { texto: string; tono: BadgeTone } {
  switch (s.estado) {
    case 'configurada': return { texto: s.actualizada ? `Configurada el ${FECHA.format(new Date(s.actualizada))}` : 'Configurada', tono: 'positive' }
    case 'entorno': return { texto: 'Desde el archivo .env', tono: 'info' }
    case 'ilegible': return { texto: 'No se puede descifrar', tono: 'negative' }
    default: return { texto: 'Sin clave', tono: 'neutral' }
  }
}

/** Para qué sirve la clave de cada servicio, en una frase. */
export function usoClave(s: Pick<EstadoServicio, 'id' | 'red' | 'direcciones'>): string {
  if (!s.red) return 'Precios e históricos de los activos que no cotizan en Binance. Sin clave funciona, pero más despacio.'
  const dirs = s.direcciones === 0 ? 'Aún no tienes direcciones de esta red.'
    : s.direcciones === 1 ? 'La usa 1 dirección de tus wallets.' : `La usan ${s.direcciones} direcciones de tus wallets.`
  return `Comprueba el saldo on-chain de tus direcciones de ${s.red}. ${dirs}`
}

export function mensajeComprobacion(c: Comprobacion | 'ilegible' | null): { texto: string; tipo: 'ok' | 'aviso' | 'error' } {
  switch (c) {
    case 'aceptada': return { texto: 'El servicio acepta la clave.', tipo: 'ok' }
    case 'sin_respuesta': return { texto: 'El servicio no responde ahora: la clave queda guardada y se usará cuando vuelva.', tipo: 'aviso' }
    case 'rechazada': return { texto: 'El servicio rechaza la clave: revisa que esté completa y activa.', tipo: 'error' }
    case 'ilegible': return { texto: 'La clave guardada no se puede descifrar: vuelve a introducirla.', tipo: 'error' }
    default: return { texto: 'No hay ninguna clave que probar.', tipo: 'aviso' }
  }
}

/** Una red necesita atención si tiene direcciones y no hay clave utilizable. */
export function faltaClave(s: Pick<EstadoServicio, 'red' | 'estado' | 'direcciones'>): boolean {
  return s.red !== null && s.direcciones > 0 && (s.estado === 'sin_configurar' || s.estado === 'ilegible')
}
