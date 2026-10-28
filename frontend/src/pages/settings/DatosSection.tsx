import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { RefreshCw, Trash2, Zap, Download, ArrowLeftRight, Layers, FileUp, Tag, Wallet, Coins, BarChart3, Wrench, AlertTriangle, type LucideIcon } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { useRunFifo } from '../../hooks/useRunFifo'
import { T } from '../../utils/colors'
import { buttonClasses, fieldClasses, StatCard } from '../../components/ui'
import { SettingsCard } from './SettingsCard'
import { formatNumber } from '../../utils/format'
import { backupFilename } from '../../constants/appInfo'

const CONFIRM_WORD = 'CONFIRMAR'

export function DatosSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['settings-stats'],
    queryFn: portfolioApi.getStats,
    refetchInterval: 10000,
  })
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheResult, setCacheResult]     = useState<number | null>(null)
  const { running: runningFifo, result: fifoResult, run: handleRunFifo } = useRunFifo()
  const [exporting, setExporting]         = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInput, setResetInput]       = useState('')
  const [resetting, setResetting]         = useState(false)

  async function handleClearCache() {
    setClearingCache(true)
    setCacheResult(null)
    try {
      const result = await portfolioApi.clearPriceCache()
      setCacheResult(result.deleted)
      queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
    } catch (e) {
      toast.error('Error al limpiar la caché', (e as Error).message)
    } finally {
      setClearingCache(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const data = await portfolioApi.exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = backupFilename()
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  async function handleReset() {
    if (resetInput !== CONFIRM_WORD) return
    setResetting(true)
    try {
      await portfolioApi.resetAllData()
      queryClient.invalidateQueries({ refetchType: 'all' })
      setShowResetConfirm(false)
      setResetInput('')
      toast.success('Datos borrados', 'Todas las transacciones y lotes FIFO han sido eliminados.')
    } catch (e) {
      toast.error('Error al eliminar los datos', (e as Error).message)
    } finally {
      setResetting(false)
    }
  }

  // Estadísticas como StatCard compactas (#445), con su definición en la ayuda.
  const statCards: { label: string; value: number | undefined; color: string; icon: LucideIcon; help: string }[] = [
    { label: 'Transacciones',    value: stats?.transactions, color: T.brand,    icon: ArrowLeftRight, help: 'Operaciones guardadas, importadas o manuales.' },
    { label: 'Lotes FIFO',       value: stats?.fifoLots,     color: T.positive, icon: Layers,         help: 'Lotes de compra que calcula el motor FIFO, abiertos y cerrados.' },
    { label: 'Importaciones',    value: stats?.imports,      color: T.warning,  icon: FileUp,         help: 'Archivos CSV importados.' },
    { label: 'Precios en caché', value: stats?.priceCache,   color: T.info,     icon: Tag,            help: 'Precios históricos guardados para no volver a pedirlos.' },
    { label: 'Wallets',          value: stats?.wallets,      color: T.purple,   icon: Wallet,         help: 'Wallets configuradas, incluidas las del sistema.' },
    { label: 'Activos',          value: stats?.assets,       color: T.muted,    icon: Coins,          help: 'Activos con sus pares de precio configurados.' },
  ]

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Stats */}
      <SettingsCard index={0} icon={BarChart3} title="Estadísticas de la base de datos">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {statCards.map((s, i) => (
            <StatCard key={s.label} compact title={s.label} icon={s.icon} color={s.color} delay={i * 40}
              value={s.value ?? 0} format={v => formatNumber(v, 0)} loading={statsLoading}
              help={<p>{s.help}</p>} helpLabel={`Qué cuenta ${s.label}`} />
          ))}
        </div>
      </SettingsCard>

      {/* Mantenimiento */}
      <SettingsCard index={1} icon={Wrench} title="Mantenimiento">
        <div className="space-y-2">

          {/* Limpiar caché */}
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Limpiar caché de precios</p>
              <p className="text-xs text-fg-subtle mt-0.5">Fuerza la reconsulta de precios históricos en el próximo FIFO.</p>
            </div>
            <div className="flex items-center gap-3">
              {cacheResult !== null && (
                <span className="text-xs text-positive">{cacheResult} entradas eliminadas</span>
              )}
              <button type="button" onClick={handleClearCache} disabled={clearingCache}
                className={buttonClasses('secondary', 'md', 'flex')}>
                {clearingCache ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Limpiar
              </button>
            </div>
          </div>

          {/* Re-ejecutar FIFO */}
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Re-ejecutar motor FIFO</p>
              <p className="text-xs text-fg-subtle mt-0.5">Recalcula todos los lotes y plusvalías desde cero.</p>
            </div>
            <div className="flex items-center gap-3">
              {fifoResult && (
                <span className={`text-xs ${fifoResult.startsWith('Error') ? 'text-negative' : 'text-positive'}`}>
                  {fifoResult}
                </span>
              )}
              <button type="button" onClick={handleRunFifo} disabled={runningFifo}
                className={buttonClasses('secondary', 'md', 'flex')}>
                {runningFifo ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                Ejecutar
              </button>
            </div>
          </div>

          {/* Exportar backup */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">Exportar backup</p>
              <p className="text-xs text-fg-subtle mt-0.5">Descarga un JSON con todas las transacciones, wallets y configuración.</p>
            </div>
            <button type="button" onClick={handleExport} disabled={exporting}
              className={buttonClasses('secondary', 'md', 'flex')}>
              {exporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
              Descargar
            </button>
          </div>

        </div>
      </SettingsCard>

      {/* Zona de peligro */}
      <SettingsCard index={2} icon={AlertTriangle} title="Zona de peligro" tone="danger">

        {!showResetConfirm ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Eliminar todos los datos</p>
              <p className="text-xs text-fg-subtle mt-0.5">
                Borra transacciones, lotes FIFO, importaciones y caché de precios. Irreversible.
              </p>
            </div>
            <button type="button" onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 border border-negative/50 text-negative-ink hover:bg-negative/10 rounded-lg text-sm font-medium transition-colors">
              Eliminar todo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="px-4 py-3 rounded-xl border border-negative/40 bg-negative/8 space-y-1">
              <p className="text-sm font-medium text-negative">¿Estás seguro?</p>
              <p className="text-xs text-fg-muted">
                Esta acción borrará TODAS las transacciones, importaciones, lotes FIFO y caché de precios.
                La configuración de wallets y activos se mantiene. Esta acción es <strong>irreversible</strong>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-fg-muted">
                Escribe <span className="mono font-semibold text-negative">{CONFIRM_WORD}</span> para confirmar:
              </label>
              <input value={resetInput} onChange={e => setResetInput(e.target.value)}
                placeholder={CONFIRM_WORD}
                className={fieldClasses('md', false, 'py-2.5 mono border-negative/30 focus:border-negative')} />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button type="button" onClick={() => { setShowResetConfirm(false); setResetInput('') }}
                className="px-4 py-2 text-sm text-fg-muted hover:text-fg transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={handleReset} disabled={resetInput !== CONFIRM_WORD || resetting}
                className={buttonClasses('danger', 'md')}>
                {resetting ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
            </div>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
