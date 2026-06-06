import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { RefreshCw, Trash2, Zap, Download } from 'lucide-react'

const CONFIRM_WORD = 'CONFIRMAR'

export function DatosSection() {
  const queryClient = useQueryClient()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['settings-stats'],
    queryFn: portfolioApi.getStats,
    refetchInterval: 10000,
  })
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheResult, setCacheResult]     = useState<number | null>(null)
  const [runningFifo, setRunningFifo]     = useState(false)
  const [fifoResult, setFifoResult]       = useState<string | null>(null)
  const [exporting, setExporting]         = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInput, setResetInput]       = useState('')
  const [resetting, setResetting]         = useState(false)

  async function handleClearCache() {
    setClearingCache(true)
    setCacheResult(null)
    const result = await portfolioApi.clearPriceCache()
    setCacheResult(result.deleted)
    queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
    setClearingCache(false)
  }

  async function handleRunFifo() {
    setRunningFifo(true)
    setFifoResult(null)
    try {
      const result = await portfolioApi.runFifo()
      setFifoResult(`${result.lotsCreated} lotes creados, ${result.lotsConsumed} consumos procesados`)
      queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
    } catch (e) {
      setFifoResult(`Error: ${(e as Error).message}`)
    } finally { setRunningFifo(false) }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const data = await portfolioApi.exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `cryptotracker-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  async function handleReset() {
    if (resetInput !== CONFIRM_WORD) return
    setResetting(true)
    await portfolioApi.resetAllData()
    queryClient.invalidateQueries()
    setResetting(false)
    setShowResetConfirm(false)
    setResetInput('')
  }

  const statCards = [
    { label: 'Transacciones',    value: stats?.transactions, color: '#6366f1' },
    { label: 'Lotes FIFO',       value: stats?.fifoLots,     color: '#00c896' },
    { label: 'Importaciones',    value: stats?.imports,      color: '#f59e0b' },
    { label: 'Precios en caché', value: stats?.priceCache,   color: '#3b82f6' },
    { label: 'Wallets',          value: stats?.wallets,      color: '#8b5cf6' },
    { label: 'Activos',          value: stats?.assets,       color: '#ec4899' },
  ]

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Stats */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
        <h3 className="font-semibold text-sm">Estadísticas de la base de datos</h3>
        <div className="grid grid-cols-3 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="rounded-lg bg-background-tertiary p-3 space-y-1" style={{ borderLeft: `3px solid ${s.color}` }}>
              <p className="text-xl font-bold mono">
                {statsLoading ? '—' : (s.value ?? 0).toLocaleString('es-ES')}
              </p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mantenimiento */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Mantenimiento</h3>
        <div className="space-y-2">

          {/* Limpiar caché */}
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Limpiar caché de precios</p>
              <p className="text-xs text-gray-500 mt-0.5">Fuerza la reconsulta de precios históricos en el próximo FIFO.</p>
            </div>
            <div className="flex items-center gap-3">
              {cacheResult !== null && (
                <span className="text-xs text-accent-green">{cacheResult} entradas eliminadas</span>
              )}
              <button onClick={handleClearCache} disabled={clearingCache}
                className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border border border-border rounded-lg text-sm transition-colors disabled:opacity-50">
                {clearingCache ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Limpiar
              </button>
            </div>
          </div>

          {/* Re-ejecutar FIFO */}
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Re-ejecutar motor FIFO</p>
              <p className="text-xs text-gray-500 mt-0.5">Recalcula todos los lotes y plusvalías desde cero.</p>
            </div>
            <div className="flex items-center gap-3">
              {fifoResult && (
                <span className={`text-xs ${fifoResult.startsWith('Error') ? 'text-accent-red' : 'text-accent-green'}`}>
                  {fifoResult}
                </span>
              )}
              <button onClick={handleRunFifo} disabled={runningFifo}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#6366f118', color: '#6366f1' }}>
                {runningFifo ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                Ejecutar
              </button>
            </div>
          </div>

          {/* Exportar backup */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">Exportar backup</p>
              <p className="text-xs text-gray-500 mt-0.5">Descarga un JSON con todas las transacciones, wallets y configuración.</p>
            </div>
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border border border-border rounded-lg text-sm transition-colors disabled:opacity-50">
              {exporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
              Descargar
            </button>
          </div>

        </div>
      </div>

      {/* Zona de peligro */}
      <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-5 space-y-3">
        <h3 className="font-semibold text-sm text-accent-red">Zona de peligro</h3>

        {!showResetConfirm ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Eliminar todos los datos</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Borra transacciones, lotes FIFO, importaciones y caché de precios. Irreversible.
              </p>
            </div>
            <button onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 border border-accent-red/50 text-accent-red hover:bg-accent-red/10 rounded-lg text-sm font-medium transition-colors">
              Eliminar todo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="px-4 py-3 rounded-xl border border-accent-red/40 bg-accent-red/8 space-y-1">
              <p className="text-sm font-medium text-accent-red">¿Estás seguro?</p>
              <p className="text-xs text-gray-400">
                Esta acción borrará TODAS las transacciones, importaciones, lotes FIFO y caché de precios.
                La configuración de wallets y activos se mantiene. Esta acción es <strong>irreversible</strong>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">
                Escribe <span className="mono font-semibold text-accent-red">{CONFIRM_WORD}</span> para confirmar:
              </label>
              <input value={resetInput} onChange={e => setResetInput(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="w-full bg-background-tertiary border border-accent-red/30 focus:border-accent-red rounded-lg px-3 py-2.5 text-sm mono placeholder-gray-700 focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowResetConfirm(false); setResetInput('') }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={handleReset} disabled={resetInput !== CONFIRM_WORD || resetting}
                className="px-4 py-2 bg-accent-red hover:bg-accent-red/80 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors">
                {resetting ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
