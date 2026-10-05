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
      className="bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto"
    >
      {log.length === 0 && (
        <span className="text-gray-600">Esperando inicio...</span>
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
          event.phase === 'error' ? 'text-accent-red'         :
          event.phase === 'done'  ? 'text-accent-green'       :
          isRateLimit             ? 'text-orange-400'         :
          isPrefetch              ? 'text-purple-400'         :
          isFallback              ? 'text-yellow-600'         :
          isFifoError             ? 'text-yellow-500'         :
          isWarn                  ? 'text-yellow-500'         :
          isOkPrice               ? 'text-accent-green'       :
          isNoPrice               ? 'text-yellow-600'         :
          event.phase === 'fifo'  ? 'text-accent-blue'        :
          isImportProgress        ? 'text-gray-500'           :
          event.phase === 'prices'? 'text-gray-400'           :
          'text-gray-300'
        return (
          <div key={absIdx} className={color}>
            {event.progress !== undefined && event.total !== undefined
              ? `[${event.progress}/${event.total}] ${msg}`
              : msg
            }
          </div>
        )
      })}
      {!done && <div className="text-accent-blue animate-pulse">▍</div>}
    </div>
  )
}
