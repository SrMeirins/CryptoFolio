import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Eye, EyeOff, Copy } from 'lucide-react'
import { WithdrawalSelector } from './WithdrawalSelector'
import { DepositSection } from './DepositComponents'
import { ACCOUNT_COLORS } from './types'
import type { PreviewTransaction, DepositReview } from './types'

export function txKey(tx: PreviewTransaction): string {
  return tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amountNet}`
}

// ── Persistencia localStorage ──────────────────────────────────────────────
const STORAGE_KEY = 'ct_withdrawal_memory'

function loadMemory(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}
function saveMemory(assetAccount: string, dest: string) {
  try {
    const m = loadMemory(); m[assetAccount] = dest
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
  } catch { /* ignore */ }
}

export function WithdrawalDestinations({ withdrawals, destinations, onAssign, deposits, depositCosts, onSetDepositCost }: {
  withdrawals: PreviewTransaction[]
  destinations: Record<string, string>
  onAssign: (txKey: string, walletId: string) => void
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetDepositCost: (txKey: string, price: number | null) => void
}) {
  const [bulkDest,       setBulkDest]       = useState('')
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set())
  const [showOnlyPending, setShowOnlyPending] = useState(false)

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })
  const allNonExchangeWallets = (wallets as { id: string; name: string; type: string; color: string }[])
    .filter(w => w.type !== 'exchange')
  const coldWallets = allNonExchangeWallets.filter(w => w.name !== 'Wallets externas')

  // Pre-rellenar desde memoria en el primer render
  useEffect(() => {
    const mem = loadMemory()
    for (const tx of withdrawals) {
      const key = txKey(tx)
      if (destinations[key]) continue
      const stored = mem[`${tx.asset}|${tx.account}`]
      if (stored) onAssign(key, stored)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedWithdrawals = [...withdrawals].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const byAsset = sortedWithdrawals.reduce<Record<string, PreviewTransaction[]>>((acc, tx) => {
    if (!acc[tx.asset]) acc[tx.asset] = []
    acc[tx.asset].push(tx)
    return acc
  }, {})
  const uniqueAssets = Object.entries(byAsset)
    .sort((a, b) => new Date(a[1][0].timestamp).getTime() - new Date(b[1][0].timestamp).getTime())
    .map(([asset]) => asset)

  const allTxKeys      = withdrawals.map(txKey)
  const assignedCount  = allTxKeys.filter(k => destinations[k]).length
  const totalTxs       = allTxKeys.length
  const allAssigned    = assignedCount === totalTxs

  const depositsReviewedCount = deposits.filter(d => d.txKey in depositCosts).length
  const allDepositsReviewed   = deposits.length === 0 || depositsReviewedCount === deposits.length

  const totalItems = totalTxs + deposits.length
  const doneItems  = assignedCount + depositsReviewedCount
  const allDone    = allAssigned && allDepositsReviewed
  const progress   = totalItems > 0 ? (doneItems / totalItems) * 100 : 0

  const selectedCount  = selected.size
  const unassignedKeys = allTxKeys.filter(k => !destinations[k])
  const allChecked     = selectedCount === totalTxs
  const someChecked    = selectedCount > 0 && !allChecked

  // Grupos mostrados según filtro "solo pendientes"
  const displayAssets = showOnlyPending
    ? uniqueAssets.filter(asset => byAsset[asset].some(tx => !destinations[txKey(tx)]))
    : uniqueAssets
  const hiddenCount = uniqueAssets.length - displayAssets.length

  // ── Asignación individual con auto-apply al mismo activo + memoria ─────────
  function handleAssign(key: string, dest: string) {
    onAssign(key, dest)
    const tx = withdrawals.find(t => txKey(t) === key)
    if (!tx) return
    saveMemory(`${tx.asset}|${tx.account}`, dest)
    // Auto-aplicar al resto de txs no asignadas del mismo activo
    for (const sibling of withdrawals) {
      const sibKey = txKey(sibling)
      if (sibKey === key) continue
      if (sibling.asset !== tx.asset) continue
      if (!destinations[sibKey]) onAssign(sibKey, dest)
    }
  }

  // ── Botones rápidos (header) ───────────────────────────────────────────────
  function quickApplyAll(dest: string) {
    allTxKeys.forEach(k => onAssign(k, dest))
    // Guardar en memoria para cada combo activo|cuenta
    const seen = new Set<string>()
    for (const tx of withdrawals) {
      const combo = `${tx.asset}|${tx.account}`
      if (!seen.has(combo)) { saveMemory(combo, dest); seen.add(combo) }
    }
  }

  // ── Copiar destino del grupo anterior ─────────────────────────────────────
  function copyPrevGroupDest(asset: string) {
    const idx = uniqueAssets.indexOf(asset)
    for (let i = idx - 1; i >= 0; i--) {
      const prevTxs  = byAsset[uniqueAssets[i]]
      const prevDests = [...new Set(prevTxs.map(t => destinations[txKey(t)]).filter(Boolean))]
      if (prevDests.length === 1) {
        byAsset[asset].forEach(tx => {
          const k = txKey(tx)
          if (!destinations[k]) handleAssign(k, prevDests[0])
        })
        return
      }
    }
  }

  function toggleTx(key: string) {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }
  function toggleGroup(txs: PreviewTransaction[]) {
    const keys = txs.map(txKey)
    const allIn = keys.every(k => selected.has(k))
    setSelected(prev => {
      const s = new Set(prev)
      keys.forEach(k => allIn ? s.delete(k) : s.add(k))
      return s
    })
  }
  function selectAll()        { setSelected(new Set(allTxKeys)) }
  function selectUnassigned() { setSelected(new Set(unassignedKeys)) }
  function selectNone()       { setSelected(new Set()) }
  function toggleAll()        { allChecked ? selectNone() : selectAll() }
  function toggleExpand(asset: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(asset) ? s.delete(asset) : s.add(asset); return s })
  }

  function applyBulk() {
    if (!bulkDest) return
    const targets = selectedCount > 0 ? [...selected] : allTxKeys
    targets.forEach(k => onAssign(k, bulkDest))
    const seen = new Set<string>()
    for (const tx of withdrawals) {
      if (!targets.includes(txKey(tx))) continue
      const combo = `${tx.asset}|${tx.account}`
      if (!seen.has(combo)) { saveMemory(combo, bulkDest); seen.add(combo) }
    }
    setSelected(new Set())
  }
  function applyToGroup(txs: PreviewTransaction[]) {
    if (!bulkDest) return
    txs.forEach(tx => {
      onAssign(txKey(tx), bulkDest)
      saveMemory(`${tx.asset}|${tx.account}`, bulkDest)
    })
  }
  function applyToUnassigned() {
    if (!bulkDest) return
    unassignedKeys.forEach(k => onAssign(k, bulkDest))
    const seen = new Set<string>()
    for (const tx of withdrawals) {
      if (!unassignedKeys.includes(txKey(tx))) continue
      const combo = `${tx.asset}|${tx.account}`
      if (!seen.has(combo)) { saveMemory(combo, bulkDest); seen.add(combo) }
    }
  }

  function groupStatus(txs: PreviewTransaction[]) {
    const dests = txs.map(tx => destinations[txKey(tx)]).filter(Boolean)
    if (dests.length === 0) return { label: null, color: 'text-gray-600' }
    const unique = [...new Set(dests)]
    if (unique.length === 1) return { label: unique[0], color: 'text-accent-green' }
    return { label: 'múltiples', color: 'text-accent-amber' }
  }

  const fmtAmt = (n: number) => {
    if (Math.abs(n) >= 1000) return n.toLocaleString('es-ES', { maximumFractionDigits: 4 })
    if (Math.abs(n) >= 1)    return n.toFixed(6)
    return n.toFixed(8)
  }

  function destLabel(dest: string) {
    if (dest === '__lost__')     return { text: '💀 Pérdida',  cls: 'text-accent-red'   }
    if (dest === '__gift__')     return { text: '🎁 Regalo',   cls: 'text-accent-blue'  }
    if (dest === '__external__') return { text: '📱 Externa',  cls: 'text-gray-400'     }
    const w = coldWallets.find(w => w.id === dest)
    return w ? { text: w.name, cls: 'text-accent-green' } : { text: 'pendiente', cls: 'text-gray-600 italic' }
  }

  // Para la copia de grupo anterior: buscar si hay un grupo previo con destino uniforme
  function prevUniformDest(asset: string): string | null {
    const idx = uniqueAssets.indexOf(asset)
    for (let i = idx - 1; i >= 0; i--) {
      const prevTxs  = byAsset[uniqueAssets[i]]
      const prevDests = [...new Set(prevTxs.map(t => destinations[txKey(t)]).filter(Boolean))]
      if (prevDests.length === 1) return prevDests[0]
    }
    return null
  }

  return (
    <div className={`rounded-2xl border-2 transition-all duration-300 ${
      allDone ? 'border-accent-green/40' : 'border-accent-amber/40'
    }`}>
      {/* Header */}
      <div className={`px-5 py-4 ${allDone ? 'bg-accent-green/8' : 'bg-accent-amber/8'}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${allDone ? 'text-accent-green' : 'text-accent-amber'}`}>
                {allDone ? '✓ Revisión completada' : 'Revisión obligatoria antes de importar'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                allDone ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
              }`}>
                {doneItems}/{totalItems}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Asigna el destino de cada retiro y el coste de cada depósito externo.
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs text-gray-600">{withdrawals.length} retiro{withdrawals.length !== 1 ? 's' : ''}</span>
            {deposits.length > 0 && <span className="text-xs text-gray-600 ml-2">{deposits.length} depósito{deposits.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-accent-green' : 'bg-accent-amber'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-5 space-y-4 bg-background-card max-h-[70vh] overflow-y-auto">

        {/* Aviso de wallets — no bloquea los controles */}
        {coldWallets.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-accent-amber bg-accent-amber/10 rounded-xl px-4 py-2.5 border border-accent-amber/20">
            <AlertTriangle size={12} className="shrink-0" />
            Sin wallets frías configuradas — solo disponibles: Pérdida, Externa, Regalo.
          </div>
        )}

        {/* ── Botones de acción rápida ─────────────────────────────────────── */}
        {!allAssigned && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 self-center mr-1">Aplicar a todos:</span>
            <button
              onClick={() => quickApplyAll('__lost__')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-red/10 hover:bg-accent-red/20 border border-accent-red/30 rounded-lg text-xs font-medium text-accent-red transition-colors"
            >
              💀 Pérdida de acceso
            </button>
            <button
              onClick={() => quickApplyAll('__external__')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/30 hover:bg-gray-700/50 border border-gray-600/30 rounded-lg text-xs font-medium text-gray-300 transition-colors"
            >
              📱 Mi wallet no registrada
            </button>
            <button
              onClick={() => quickApplyAll('__gift__')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 rounded-lg text-xs font-medium text-accent-blue transition-colors"
            >
              🎁 Regalo / pago
            </button>
            {coldWallets.slice(0, 2).map(w => (
              <button
                key={w.id}
                onClick={() => quickApplyAll(w.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 rounded-lg text-xs font-medium text-accent-green transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                {w.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Barra de selección bulk ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-background-tertiary">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={toggleAll}
              className={`w-4.5 h-4.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                allChecked  ? 'bg-accent-blue border-accent-blue' :
                someChecked ? 'bg-accent-blue/30 border-accent-blue' :
                              'border-gray-600 hover:border-gray-400'
              }`}
              title={allChecked ? 'Deseleccionar todo' : 'Seleccionar todo'}
            >
              {allChecked  && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
              {someChecked && <span className="text-accent-blue text-[10px] font-bold leading-none">−</span>}
            </button>

            <div className="flex-1 min-w-0">
              <WithdrawalSelector value={bulkDest} coldWallets={coldWallets} onChange={setBulkDest} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedCount > 0 ? (
                <button
                  onClick={applyBulk}
                  disabled={!bulkDest}
                  className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5"
                >
                  <span className="bg-white/20 rounded px-1 py-0.5 text-[10px] font-bold">{selectedCount}</span>
                  Aplicar
                </button>
              ) : (
                <>
                  {unassignedKeys.length > 0 && unassignedKeys.length < totalTxs && (
                    <button
                      onClick={applyToUnassigned}
                      disabled={!bulkDest}
                      className="px-3 py-1.5 border border-border hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-gray-300 transition-colors whitespace-nowrap"
                      title="Aplicar solo a los que aún no tienen destino"
                    >
                      No asignados
                    </button>
                  )}
                  <button
                    onClick={applyBulk}
                    disabled={!bulkDest}
                    className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Todos
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="border-t border-border px-4 py-2 flex items-center gap-3">
              <span className="text-xs text-accent-blue font-medium">
                {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={selectUnassigned} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">no asignados</button>
                <span className="text-gray-700">·</span>
                <button onClick={selectAll}  className="text-xs text-gray-500 hover:text-gray-300 transition-colors">todos</button>
                <span className="text-gray-700">·</span>
                <button onClick={selectNone} className="text-xs text-gray-500 hover:text-accent-red transition-colors">ninguno</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Lista de grupos por activo ─────────────────────────────────────── */}
        <div className="space-y-1.5">
          {/* Cabecera con filtro "solo pendientes" */}
          {uniqueAssets.length > 1 && (
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs text-gray-600">{uniqueAssets.length} activo{uniqueAssets.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setShowOnlyPending(v => !v)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  showOnlyPending ? 'text-accent-amber' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {showOnlyPending ? <Eye size={12} /> : <EyeOff size={12} />}
                {showOnlyPending
                  ? `Solo pendientes${hiddenCount > 0 ? ` (${hiddenCount} asignados ocultos)` : ''}`
                  : 'Solo pendientes'
                }
              </button>
            </div>
          )}

          {displayAssets.map((asset, displayIdx) => {
            const txs              = byAsset[asset]
            const keys             = txs.map(txKey)
            const totalAmt         = txs.reduce((s, t) => s + t.amountNet, 0)
            const firstDate        = new Date(txs[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
            const groupAllSelected = keys.every(k => selected.has(k))
            const groupSomeSelected = keys.some(k => selected.has(k)) && !groupAllSelected
            const status           = groupStatus(txs)
            const assetAssignedCount = keys.filter(k => destinations[k]).length
            const isOpen           = expanded.has(asset) || txs.length === 1
            const prevDest         = prevUniformDest(asset)
            const hasUnassigned    = keys.some(k => !destinations[k])

            return (
              <div key={asset} className="rounded-xl border border-border">
                <div className="flex items-center gap-3 px-4 py-3 bg-background-tertiary/60">
                  <button
                    onClick={() => toggleGroup(txs)}
                    className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                      groupAllSelected  ? 'bg-accent-blue border-accent-blue' :
                      groupSomeSelected ? 'bg-accent-blue/30 border-accent-blue' :
                                          'border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {groupAllSelected  && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                    {groupSomeSelected && <span className="text-accent-blue text-[9px] font-bold leading-none">−</span>}
                  </button>

                  <button
                    onClick={() => txs.length > 1 && toggleExpand(asset)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      assetAssignedCount === txs.length ? 'bg-accent-green' :
                      assetAssignedCount > 0           ? 'bg-accent-amber' : 'bg-gray-600'
                    }`} />
                    <span className="font-bold mono">{asset}</span>
                    <span className="text-xs text-gray-500">
                      {txs.length} retiro{txs.length !== 1 ? 's' : ''} · {fmtAmt(totalAmt)} · desde {firstDate}
                    </span>
                    {status.label && (
                      <span className={`text-xs font-medium ${status.color} ml-1`}>
                        → {status.label === 'múltiples' ? 'múltiples destinos' : destLabel(status.label).text}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Copiar destino del grupo anterior */}
                    {displayIdx > 0 && prevDest && hasUnassigned && (
                      <button
                        onClick={() => copyPrevGroupDest(asset)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-1 rounded hover:bg-white/5"
                        title={`Aplicar mismo destino que grupo anterior: ${destLabel(prevDest).text}`}
                      >
                        <Copy size={11} />
                        <span className="text-[10px]">{destLabel(prevDest).text}</span>
                      </button>
                    )}
                    {bulkDest && hasUnassigned && (
                      <button
                        onClick={() => applyToGroup(txs)}
                        className="text-xs text-accent-blue hover:text-accent-blue/80 font-medium transition-colors whitespace-nowrap"
                        title={`Aplicar destino seleccionado a todos los retiros de ${asset}`}
                      >
                        Aplicar al grupo
                      </button>
                    )}
                    {txs.length > 1 && (
                      <button onClick={() => toggleExpand(asset)} className="text-gray-500 hover:text-gray-300 transition-colors">
                        {isOpen ? '▲' : '▶'}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="divide-y divide-border">
                    {txs.map((tx, i) => {
                      const key      = txKey(tx)
                      const dest     = destinations[key]
                      const dl       = destLabel(dest ?? '')
                      const isTxSel  = selected.has(key)
                      const acColor  = ACCOUNT_COLORS[tx.account] ?? '#6b7280'

                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 px-4 py-3 transition-all ${
                            isTxSel ? 'bg-accent-blue/5' : dest ? 'bg-accent-green/3' : ''
                          }`}
                        >
                          <button
                            onClick={() => toggleTx(key)}
                            className={`w-3.5 h-3.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                              isTxSel ? 'bg-accent-blue border-accent-blue' : 'border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            {isTxSel && <span className="text-white text-[8px] font-bold leading-none">✓</span>}
                          </button>

                          <div className="shrink-0 w-28">
                            <p className="text-xs mono text-gray-300">
                              {new Date(tx.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </p>
                            <p className="text-xs mono text-gray-600">
                              {new Date(tx.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>

                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium"
                            style={{ backgroundColor: `${acColor}18`, color: acColor }}>
                            {tx.account}
                          </span>

                          <span className="font-bold mono text-accent-red text-sm shrink-0">
                            −{fmtAmt(tx.amountNet)} <span className="text-gray-500 font-normal text-xs">{tx.asset}</span>
                          </span>

                          <div className="flex-1" />

                          <WithdrawalSelector
                            value={dest ?? ''}
                            coldWallets={coldWallets}
                            onChange={v => handleAssign(key, v)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {deposits.length > 0 && (
          <DepositSection
            deposits={deposits}
            depositCosts={depositCosts}
            onSetCost={onSetDepositCost}
            allReviewed={allDepositsReviewed}
            reviewedCount={depositsReviewedCount}
          />
        )}
      </div>
    </div>
  )
}
