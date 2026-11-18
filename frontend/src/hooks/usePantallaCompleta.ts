import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Pantalla completa de un elemento (#510): `activa` sigue al navegador (Escape
 * sale de forma nativa) y `alternar` entra o sale. Sin soporte, no hace nada.
 */
export function usePantallaCompleta(ref: RefObject<HTMLElement | null>): { activa: boolean; alternar: () => void; disponible: boolean } {
  const [activa, setActiva] = useState(false)
  useEffect(() => {
    const onCambio = () => setActiva(document.fullscreenElement !== null && document.fullscreenElement === ref.current)
    // El navegador ya sale con Escape; se refuerza por si la tecla llega a la página.
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement && document.fullscreenElement === ref.current) void document.exitFullscreen()
    }
    document.addEventListener('fullscreenchange', onCambio)
    document.addEventListener('keydown', onTecla)
    return () => {
      document.removeEventListener('fullscreenchange', onCambio)
      document.removeEventListener('keydown', onTecla)
    }
  }, [ref])
  const alternar = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void ref.current?.requestFullscreen?.()
  }, [ref])
  return { activa, alternar, disponible: typeof document !== 'undefined' && document.fullscreenEnabled === true }
}
