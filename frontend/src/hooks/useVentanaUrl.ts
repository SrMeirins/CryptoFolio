import { useEffect, useRef, useState } from 'react'
import { rangoAVentana, ventanaARango, type Ventana } from '../utils/chartZoom'
import { serializarRango, type RangoValor } from '../utils/rangoGrafico'

/**
 * Ventana de zoom ligada al rango de la URL (#508, #510) sin trompicones:
 * mientras se acerca o se desplaza, la ventana vive en estado local y la URL
 * se escribe solo cuando el gesto para (cada escritura vuelve a dibujar la
 * página entera). Si el rango cambia desde fuera (selector, atrás del
 * navegador), manda la URL.
 */
export function useVentanaUrl(rango: RangoValor, setRango: (r: RangoValor) => void, extent: Ventana | null, today: string, esperaMs = 250) {
  const [local, setLocal] = useState<{ v: Ventana | null; clave: string } | null>(null)
  const clave = serializarRango(rango)
  const [escrita, setEscrita] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Un cambio de la URL que no viene de aquí descarta la ventana local.
  const vigente = local && (local.clave === clave || escrita === clave) ? local : null

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  const set = (v: Ventana | null) => {
    setLocal({ v, clave })
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      if (!extent) return
      const r = ventanaARango(v, extent)
      setEscrita(serializarRango(r))
      setRango(r)
    }, esperaMs)
  }

  // La ventana de un rango se recorta a la historia sin desplazarla (encajar la desplazaría).
  const delRango = rangoAVentana(rango, today)
  const recortada = delRango && extent
    ? { from: Math.max(delRango.from, extent.from), to: Math.min(delRango.to, extent.to) }
    : delRango
  return {
    ventana: vigente ? vigente.v : recortada && recortada.to > recortada.from ? recortada : delRango,
    set,
    /** Hay un zoom local (el texto del tramo debe seguir a la ventana, no a la URL). */
    enZoom: vigente !== null,
  }
}
