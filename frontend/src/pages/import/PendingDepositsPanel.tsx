import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { useToast } from '../../components/Toast'

type PendingDeposit = {
  id: string
  timestamp: string
  asset: string
  amount: string
  wallet_name: string
  historicalPrice: number | null
}

export function PendingDepositsPanel({ deposits }: { deposits: PendingDeposit[] }) {
  const queryClient = useQueryClient()
  const toast       = useToast()
  const [localCosts, setLocalCosts] = useState<Record<string, number | null>>({})
  const [saving, setSaving]         = useState(false)

  const reviewed    = deposits.filter(d => d.id in localCosts)
  const allReviewed = reviewed.length === deposits.length
  const hasValues   = deposits.some(d => localCosts[d.id] != null)

  async function handleSave() {
    const updates = deposits
      .filter(d => localCosts[d.id] != null)
      .map(d => ({ id: d.id, pricePerUnit: localCosts[d.id] as number }))

    setSaving(true)
    try {
      if (updates.length > 0) await portfolioApi.bulkSetCosts(updates)
      queryClient.invalidateQueries({ queryKey: ['pending-deposits'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
      queryClient.invalidateQueries({ queryKey: ['fiscal-summary'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      const skipped = deposits.length - updates.length
      toast.success(
        'Revisión completada',
        `${updates.length > 0 ? `${updates.length} coste${updates.length > 1 ? 's' : ''} guardado${updates.length > 1 ? 's' : ''}` : ''}${skipped > 0 ? ` · ${skipped} marcado${skipped > 1 ? 's' : ''} como desconocido` : ''}`
      )
      setLocalCosts({})
    } catch (e) {
      toast.error('Error al guardar', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card border-accent-amber/40 bg-amber-950/20">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl bg-accent-amber/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={16} className="text-accent-amber" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-white">
            Revisión obligatoria — depósitos sin coste de adquisición
          </h3>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            {deposits.length} depósito{deposits.length > 1 ? 's' : ''} recibido{deposits.length > 1 ? 's' : ''} desde fuera de Binance
            {deposits.length > 1 ? ' no tienen' : ' no tiene'} precio de adquisición registrado.
            Esto afecta al cálculo FIFO y a tu declaración fiscal.
            <strong className="text-accent-amber"> Debes revisar todos para poder importar nuevos datos.</strong>
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-amber transition-all duration-300 rounded-full"
                style={{ width: `${(reviewed.length / deposits.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 shrink-0">{reviewed.length}/{deposits.length} revisados</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {deposits.map(dep => {
          const cost       = localCosts[dep.id]
          const isReviewed = dep.id in localCosts
          const date       = new Date(dep.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          const amount     = parseFloat(dep.amount)

          return (
            <div
              key={dep.id}
              className={`p-3 rounded-xl border transition-colors ${
                isReviewed
                  ? cost != null
                    ? 'border-accent-green/30 bg-accent-green/5'
                    : 'border-gray-600 bg-background-tertiary'
                  : 'border-accent-amber/20 bg-background-card'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold mono text-sm text-white">{dep.asset}</span>
                    <span className="text-xs text-gray-400 mono">{amount.toLocaleString('es-ES', { maximumFractionDigits: 6 })}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-xs text-gray-500">{date}</span>
                    {!isReviewed && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent-amber/15 text-accent-amber rounded-full font-medium">
                        Pendiente
                      </span>
                    )}
                    {isReviewed && cost != null && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent-green/15 text-accent-green rounded-full font-medium flex items-center gap-0.5">
                        <Check size={9} /> {cost.toLocaleString('es-ES', { maximumFractionDigits: 4 })} €/ud.
                      </span>
                    )}
                    {isReviewed && cost == null && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded-full font-medium">
                        Desconocido
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Precio EUR/unidad al adquirir..."
                      value={cost != null ? cost : ''}
                      onChange={e => setLocalCosts(prev => ({
                        ...prev,
                        [dep.id]: e.target.value ? parseFloat(e.target.value) : null
                      }))}
                      className="flex-1 bg-background-primary border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors mono"
                    />
                    {dep.historicalPrice != null && (
                      <button
                        onClick={() => setLocalCosts(prev => ({ ...prev, [dep.id]: dep.historicalPrice! }))}
                        className="text-xs px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 text-accent-blue rounded-lg transition-colors whitespace-nowrap"
                      >
                        {dep.historicalPrice.toLocaleString('es-ES', { maximumFractionDigits: 4 })} € (histórico)
                      </button>
                    )}
                    <button
                      onClick={() => setLocalCosts(prev => {
                        if (prev[dep.id] === null) {
                          const next = { ...prev }
                          delete next[dep.id]
                          return next
                        }
                        return { ...prev, [dep.id]: null }
                      })}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                        isReviewed && cost == null
                          ? 'bg-gray-700 border-gray-600 text-gray-300'
                          : 'bg-background-primary border-border text-gray-500 hover:border-gray-500 hover:text-gray-300'
                      }`}
                    >
                      No sé
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {!allReviewed
            ? `Faltan ${deposits.length - reviewed.length} por revisar`
            : hasValues
            ? 'Todo revisado — guarda para continuar'
            : 'Todos marcados como desconocidos — guarda para continuar'
          }
        </p>
        <button
          onClick={handleSave}
          disabled={!allReviewed || saving}
          className="flex items-center gap-2 px-5 py-2 bg-accent-amber hover:bg-accent-amber/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-black transition-colors"
        >
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'Guardando...' : 'Guardar y desbloquear importación'}
        </button>
      </div>
    </div>
  )
}
