import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Aviso al salir mientras se importa (#324, #497). Cerrar o recargar la pestaña
// usa el aviso del navegador (beforeunload), el único posible ahí. Navegar a
// otra sección de la app abre el diálogo común: sin router de datos no hay
// useBlocker, así que se interceptan en captura los clics en enlaces internos
// y se guarda el destino hasta que el usuario decida.
export function useAvisoSalida(activo: boolean): { destino: string | null; salir: () => void; quedarse: () => void } {
  const navigate = useNavigate()
  const [destino, setDestino] = useState<string | null>(null)

  useEffect(() => {
    if (!activo) return
    const antesDeSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const alClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.origin !== window.location.origin || a.pathname === window.location.pathname) return
      e.preventDefault(); e.stopPropagation()
      setDestino(a.pathname + a.search + a.hash)
    }
    window.addEventListener('beforeunload', antesDeSalir)
    document.addEventListener('click', alClicar, true)
    return () => {
      window.removeEventListener('beforeunload', antesDeSalir)
      document.removeEventListener('click', alClicar, true)
    }
  }, [activo])

  const salir = useCallback(() => {
    const d = destino
    setDestino(null)
    if (d) navigate(d)
  }, [destino, navigate])
  const quedarse = useCallback(() => setDestino(null), [])

  return { destino: activo ? destino : null, salir, quedarse }
}
