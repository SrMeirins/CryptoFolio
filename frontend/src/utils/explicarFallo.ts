import { ApiError } from '../api/client'

// Texto de un fallo para el usuario (#497): qué pasó y qué hacer, sin códigos
// ni rutas internas. Los mensajes de validación del servidor (4xx) ya están en
// castellano y se muestran tal cual.

export type TipoFallo = 'red' | 'tiempo' | 'limite' | 'servidor' | 'validacion' | 'otro'

export function tipoFallo(e: unknown): TipoFallo {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'limite'
    if (e.status >= 500) return 'servidor'
    return 'validacion'
  }
  if (e instanceof Error && e.cause instanceof DOMException && e.cause.name === 'AbortError') return 'tiempo'
  if (e instanceof TypeError) return 'red'
  return 'otro'
}

const TEXTO: Record<Exclude<TipoFallo, 'validacion' | 'otro'>, string> = {
  red: 'Sin conexión con la aplicación. Comprueba que sigue en marcha y vuelve a intentarlo.',
  tiempo: 'La aplicación tarda demasiado en responder. Vuelve a intentarlo en unos segundos.',
  limite: 'Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.',
  servidor: 'Fallo interno de la aplicación. Vuelve a intentarlo; si se repite, revisa los registros del servidor.',
}

export function explicarFallo(e: unknown): string {
  const tipo = tipoFallo(e)
  if (tipo === 'validacion' || tipo === 'otro') {
    const msg = e instanceof Error ? e.message.trim() : ''
    if (!msg) return 'Vuelve a intentarlo.'
    return /[.!?]$/.test(msg) ? msg : `${msg}.`
  }
  return TEXTO[tipo]
}
