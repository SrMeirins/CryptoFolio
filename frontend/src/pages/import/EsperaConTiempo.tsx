import { useEffect, useState } from 'react'
import { formatNumber } from '../../utils/format'

// Espera sin avance medible (#599): barra indeterminada y los segundos que van,
// con lo que suele tardar, para que se vea que sigue trabajando.

export function EsperaConTiempo({ texto, estimadoSeg }: { texto: string; estimadoSeg?: number }) {
  const [inicio] = useState(() => Date.now())
  const [seg, setSeg] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeg(Math.floor((Date.now() - inicio) / 1000)), 1000)
    return () => clearInterval(t)
  }, [inicio])
  const tiempo = `${formatNumber(seg, 0)} s${estimadoSeg ? ` (suele tardar unos ${formatNumber(estimadoSeg, 0)} s)` : ''}`
  return (
    <div className="space-y-1.5">
      <div role="progressbar" aria-label={texto} aria-valuetext={`${texto} ${tiempo}`} className="h-1.5 rounded-full bg-overlay/10 overflow-hidden">
        <div className="refresh-bar h-full rounded-full bg-brand-solid" />
      </div>
      <p role="status" className="text-xs text-fg-subtle">{texto} <span className="mono tabular-nums">{tiempo}</span></p>
    </div>
  )
}
