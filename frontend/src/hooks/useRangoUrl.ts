import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { hoyApp, leerRango, serializarRango, type RangoPreset, type RangoValor } from '../utils/rangoGrafico'

/**
 * Rango de un gráfico guardado en la URL (#508), para compartirlo y volver a
 * él: un parámetro por gráfico (p. ej. ?evolucion=30d). Sin parámetro, o con
 * uno no válido, el rango por defecto; el por defecto no se escribe. Reemplaza
 * la entrada del historial en lugar de añadir una por cada cambio.
 */
export function useRangoUrl(param: string, presets: readonly RangoPreset[], defecto: RangoValor): [RangoValor, (v: RangoValor) => void] {
  const [params, setParams] = useSearchParams()
  const valor = leerRango(params.get(param), presets, hoyApp()) ?? defecto
  const defectoTexto = serializarRango(defecto)
  const cambiar = useCallback((v: RangoValor) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      const texto = serializarRango(v)
      if (texto === defectoTexto) next.delete(param)
      else next.set(param, texto)
      return next
    }, { replace: true })
  }, [setParams, param, defectoTexto])
  return [valor, cambiar]
}
