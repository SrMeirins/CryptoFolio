import { useState, useEffect } from 'react'
import { RefreshCw, Download, ArrowUpCircle } from 'lucide-react'
import { buttonClasses } from './ui'

export function UpdateBanner() {
  const bridge = window.__CRYPTOFOLIO__
  const [state, setState] = useState<{
    available: boolean
    downloaded: boolean
    version: string | null
    installing: boolean
  }>({ available: false, downloaded: false, version: null, installing: false })

  useEffect(() => {
    if (!bridge) return

    bridge.getUpdateStatus().then(s =>
      setState(prev => ({ ...prev, available: s.available, downloaded: s.downloaded, version: s.version }))
    )

    bridge.onUpdateAvailable(info =>
      setState(prev => ({ ...prev, available: true, version: info.version }))
    )

    bridge.onUpdateDownloaded(info =>
      setState(prev => ({ ...prev, downloaded: true, version: info.version }))
    )
  }, [bridge])

  if (!state.available) return null

  async function handleUpdate() {
    if (state.installing) return
    setState(prev => ({ ...prev, installing: true }))
    try {
      await bridge?.downloadAndInstall()
    } catch {
      setState(prev => ({ ...prev, installing: false }))
    }
  }

  return (
    <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-brand/10 border-b border-brand/20">
      <div className="flex items-center gap-2 text-xs text-brand">
        <ArrowUpCircle size={14} className="shrink-0" />
        <span>
          {state.downloaded
            ? `Versión ${state.version} lista para instalar — reinicia la aplicación`
            : `Nueva versión ${state.version} disponible — descargando en segundo plano...`
          }
        </span>
      </div>
      <button
        onClick={handleUpdate}
        disabled={state.installing}
        className={buttonClasses('primary', 'sm', 'shrink-0 flex gap-1.5')}
      >
        {state.installing
          ? <><RefreshCw size={12} className="animate-spin" /> Instalando...</>
          : state.downloaded
          ? <><Download size={12} /> Reiniciar y actualizar</>
          : <><Download size={12} /> Actualizar ahora</>
        }
      </button>
    </div>
  )
}
