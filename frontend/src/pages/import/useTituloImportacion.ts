import { useEffect, useRef } from 'react'
import type { ProgressEvent } from './types'
import { estadoProgreso, tituloPestana } from './progreso'

// Título de la pestaña con el progreso y aviso del sistema al terminar (#324).
// La notificación solo se muestra si el permiso ya está concedido y la pestaña
// está en segundo plano: nunca se pide permiso sin que el usuario lo inicie.
export function useTituloImportacion(log: readonly ProgressEvent[], activo: boolean): void {
  const original = useRef(document.title)
  const avisado = useRef(false)

  useEffect(() => {
    if (!activo) return
    const tituloBase = original.current
    avisado.current = false
    return () => { document.title = tituloBase }
  }, [activo])

  useEffect(() => {
    if (!activo) return
    const estado = estadoProgreso(log, Date.now())
    document.title = tituloPestana(estado)
    const terminado = estado.fase === 'done' || estado.fase === 'error'
    if (terminado && !avisado.current && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      avisado.current = true
      try {
        new Notification(estado.fase === 'done' ? 'Importación lista' : 'Error en la importación', {
          body: estado.fase === 'done' ? 'Ya puedes revisar el resultado en CryptoFolio.' : 'Abre CryptoFolio para ver el detalle.',
        })
      } catch { /* notificaciones no disponibles */ }
    }
  }, [log, activo])
}
