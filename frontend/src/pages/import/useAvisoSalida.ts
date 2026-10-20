import { useEffect } from 'react'

const MENSAJE = 'La importación sigue en curso. Si sales ahora no verás el resultado (el servidor la terminará igualmente). ¿Salir?'

// Aviso al salir mientras se importa (#324): cerrar o recargar la pestaña
// (beforeunload) y navegar a otra sección de la app. Sin router de datos no hay
// useBlocker: se interceptan en captura los clics en enlaces internos.
export function useAvisoSalida(activo: boolean): void {
  useEffect(() => {
    if (!activo) return
    const antesDeSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const alClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.origin !== window.location.origin || a.pathname === window.location.pathname) return
      if (!window.confirm(MENSAJE)) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', antesDeSalir)
    document.addEventListener('click', alClicar, true)
    return () => {
      window.removeEventListener('beforeunload', antesDeSalir)
      document.removeEventListener('click', alClicar, true)
    }
  }, [activo])
}
