import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { DepositSection } from './DepositSection'
import { QuickApplyButtons } from './QuickApplyButtons'
import { BulkSelectionBar } from './BulkSelectionBar'
import { WithdrawalAssetGroup } from './WithdrawalAssetGroup'
import { txKey, loadMemory, saveMemory } from './withdrawalDestinationsHelpers'
import type { PreviewTransaction, DepositReview } from './types'

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

        {!allAssigned && (
          <QuickApplyButtons coldWallets={coldWallets} onApply={quickApplyAll} />
        )}

        <BulkSelectionBar
          allChecked={allChecked}
          someChecked={someChecked}
          onToggleAll={toggleAll}
          bulkDest={bulkDest}
          onBulkDestChange={setBulkDest}
          coldWallets={coldWallets}
          selectedCount={selectedCount}
          unassignedCount={unassignedKeys.length}
          totalTxs={totalTxs}
          onApplyBulk={applyBulk}
          onApplyToUnassigned={applyToUnassigned}
          onSelectUnassigned={selectUnassigned}
          onSelectAll={selectAll}
          onSelectNone={selectNone}
        />

        {/* ── Lista de grupos por activo ─────────────────────────────────────── */}
        <div className="space-y-1.5">
          {/* Cabecera con filtro "solo pendientes" */}
          {uniqueAssets.length > 1 && (
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs text-gray-600">{uniqueAssets.length} activo{uniqueAssets.length !== 1 ? 's' : ''}</span>
              <button
                type="button"
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
            const txs               = byAsset[asset]
            const keys               = txs.map(txKey)
            const totalAmt           = txs.reduce((s, t) => s + t.amountNet, 0)
            const firstDate          = new Date(txs[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
            const groupAllSelected   = keys.every(k => selected.has(k))
            const groupSomeSelected  = keys.some(k => selected.has(k)) && !groupAllSelected
            const status             = groupStatus(txs)
            const assetAssignedCount = keys.filter(k => destinations[k]).length
            const isOpen             = expanded.has(asset) || txs.length === 1
            const prevDest           = prevUniformDest(asset)
            const hasUnassigned      = keys.some(k => !destinations[k])

            return (
              <WithdrawalAssetGroup
                key={asset}
                asset={asset}
                txs={txs}
                totalAmt={totalAmt}
                firstDate={firstDate}
                groupAllSelected={groupAllSelected}
                groupSomeSelected={groupSomeSelected}
                status={status}
                assetAssignedCount={assetAssignedCount}
                isOpen={isOpen}
                displayIdx={displayIdx}
                prevDest={prevDest}
                hasUnassigned={hasUnassigned}
                bulkDest={bulkDest}
                destinations={destinations}
                selected={selected}
                coldWallets={coldWallets}
                onToggleGroupSelect={() => toggleGroup(txs)}
                onToggleExpand={() => toggleExpand(asset)}
                onCopyPrevGroupDest={() => copyPrevGroupDest(asset)}
                onApplyToGroup={() => applyToGroup(txs)}
                onToggleTxSelect={toggleTx}
                onChangeDest={handleAssign}
              />
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
