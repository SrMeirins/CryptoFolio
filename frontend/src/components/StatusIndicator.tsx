import { useEffect, useRef, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { usePricesStore } from '../store/pricesStore'
import { useNow } from '../hooks/useNow'
import { LIVE_STATUS_META, useLiveStatus } from '../hooks/useLiveStatus'
import { feedDescription, indicatorLabel } from '../utils/liveIndicator'
import { Tooltip } from './ui'

// Indicador de estado único de la cabecera (#200): punto de estado, texto
// («En vivo · hace 2 s», «Sin actualizaciones», «Offline») y refresco
// integrado. Al pulsarlo pide los precios al servidor; gira mientras tanto y
// muestra un check un instante al terminar.

const REFRESH_TIMEOUT_MS = 8_000
const DONE_MS = 1_200

const TONE = {
  live: 'border-positive/30 bg-positive/8 hover:bg-positive/12',
  stale: 'border-warning/35 bg-warning/8 hover:bg-warning/12',
  offline: 'border-border bg-background-tertiary hover:bg-overlay/5',
} as const

export function StatusIndicator() {
  const status = useLiveStatus()
  const lastUpdate = usePricesStore(s => s.lastUpdate)
  const setPrices = usePricesStore(s => s.setPrices)
  const pairs = usePricesStore(s => s.feedPairs)
  const binanceConnected = usePricesStore(s => s.binanceConnected)
  const now = useNow(1_000)
  const [phase, setPhase] = useState<'idle' | 'refreshing' | 'done'>('idle')
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current) }, [])

  async function refresh() {
    if (phase === 'refreshing') return
    setPhase('refreshing')
    try {
      const res = await fetch('/api/prices/live', { signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as Record<string, number>
      if (Object.keys(data).length > 0) setPrices(data)
      setPhase('done')
      doneTimer.current = setTimeout(() => setPhase('idle'), DONE_MS)
    } catch {
      // Sin respuesta: el indicador sigue mostrando el estado real del feed.
      setPhase('idle')
    }
  }

  const label = indicatorLabel(status, lastUpdate?.getTime() ?? null, now)
  const meta = LIVE_STATUS_META[status]

  return (
    <Tooltip
      label="Precios en vivo"
      triggerLabel={`${label}. Pulsa para refrescar los precios`}
      onActivate={refresh}
      triggerClassName={`group inline-flex items-center gap-2 h-8 pl-3 pr-2 rounded-full border text-xs font-medium text-fg-muted transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${TONE[status]}`}
      trigger={
        <>
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />
          <span className="mono whitespace-nowrap" aria-live="polite">{label}</span>
          <span className="w-px h-3.5 bg-border" aria-hidden="true" />
          {phase === 'done'
            ? <Check size={14} className="text-positive" aria-hidden="true" />
            : <RefreshCw size={14} aria-hidden="true"
                className={`text-fg-subtle group-hover:text-fg ${phase === 'refreshing' ? 'animate-spin motion-reduce:animate-none' : 'transition-transform duration-300 group-hover:rotate-180 motion-reduce:transition-none'}`} />}
        </>
      }>
      <p>{feedDescription({ status, pairs, binanceConnected })}</p>
      <p className="text-fg-subtle">
        {lastUpdate ? `Última actualización: ${lastUpdate.toLocaleTimeString('es-ES')}` : 'Aún no ha llegado ningún precio.'}
      </p>
      <p className="text-fg-subtle">Pulsa el indicador para pedir los precios al servidor.</p>
    </Tooltip>
  )
}
