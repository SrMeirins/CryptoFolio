import { useRef, useEffect } from 'react'
import type { ProgressEvent } from './types'

export function ImportLogPanel({ log, done }: { log: ProgressEvent[]; done: boolean }) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!done && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log, done])

  return (
    <div
      ref={logRef}
      className="bg-overlay/5 rounded-lg p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto"
    >
      {log.length === 0 && (
        <span className="text-fg-subtle">Esperando inicio...</span>
      )}
      {log.map((event, absIdx) => ({ event, absIdx })).slice(-300).map(({ event, absIdx }) => {
        const msg = event.message
        const isRateLimit      = msg.startsWith('⏳') || msg.includes('Rate limit') || msg.includes('429')
        const isPrefetch       = msg.startsWith('🔄')
        const isFallback       = msg.startsWith('↩')
        const isOkPrice        = msg.startsWith('✓')
        const isNoPrice        = msg.startsWith('—')
        const isWarn           = msg.includes('⚠')
        const isFifoError      = event.phase === 'fifo' && (isWarn || msg.startsWith('  ⚠'))
        const isImportProgress = event.phase === 'importing' && event.progress !== undefined && !isOkPrice && !isNoPrice && !isWarn && !isPrefetch
        const color =
          event.phase === 'error' ? 'text-negative'         :
          event.phase === 'done'  ? 'text-positive'       :
          isRateLimit             ? 'text-orange-400'         :
          isPrefetch              ? 'text-accent-purple'         :
          isFallback              ? 'text-warning'         :
          isFifoError             ? 'text-warning'         :
          isWarn                  ? 'text-warning'         :
          isOkPrice               ? 'text-positive'       :
          isNoPrice               ? 'text-warning'         :
          event.phase === 'fifo'  ? 'text-brand'        :
          isImportProgress        ? 'text-fg-subtle'           :
          event.phase === 'prices'? 'text-fg-muted'           :
          'text-fg'
        return (
          <div key={absIdx} className={color}>
            {event.progress !== undefined && event.total !== undefined
              ? `[${event.progress}/${event.total}] ${msg}`
              : msg
            }
          </div>
        )
      })}
      {!done && <div className="text-brand animate-pulse">▍</div>}
    </div>
  )
}
