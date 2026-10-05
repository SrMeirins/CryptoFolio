import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import {
  Plus, Check, X, ExternalLink, Trash2, ChevronDown,
} from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CopyButton } from '../../components/CopyButton'
import { WALLET_TYPE_META, truncateAddress } from './wallets/helpers'
import { ColorPicker } from './wallets/ColorPicker'
import { SyncBadge } from './wallets/SyncBadge'
import { AddAddressForm } from './wallets/AddAddressForm'
import { AddWalletForm } from './wallets/AddWalletForm'

export function WalletsSection({ onWalletCreated }: { onWalletCreated?: () => void }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]                     = useState(false)
  const [confirmDeleteId, setConfirmDeleteId]     = useState<string | null>(null)
  const [showAddAddress, setShowAddAddress]       = useState<string | null>(null)
  const [editingAddressId, setEditingAddressId]   = useState<string | null>(null)
  const [editingAddressValue, setEditingAddressValue] = useState('')
  const [expandedNets, setExpandedNets]           = useState<Set<string>>(new Set())
  const [editingWalletId, setEditingWalletId]     = useState<string | null>(null)
  const [editName, setEditName]                   = useState('')
  const [editColor, setEditColor]                 = useState('')
  const [syncingAddressId, setSyncingAddressId]   = useState<string | null>(null)

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: portfolioApi.getWalletsFull,
  })
  const { data: networks = [] } = useQuery({
    queryKey: ['networks'],
    queryFn: portfolioApi.getNetworks,
  })

  const confirmTarget = wallets.find(w => w.id === confirmDeleteId)

  async function handleCreateWallet(data: Record<string, unknown>) {
    await portfolioApi.createWallet(data)
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setShowAdd(false)
    onWalletCreated?.()
  }

  async function handleSaveWallet(id: string) {
    await portfolioApi.updateWallet(id, { name: editName, color: editColor })
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setEditingWalletId(null)
  }

  async function handleDeleteWallet(id: string) {
    await portfolioApi.deleteWallet(id)
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setConfirmDeleteId(null)
  }

  async function handleAddAddress(walletId: string, data: Record<string, unknown>) {
    await portfolioApi.createAddress(walletId, data)
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setShowAddAddress(null)
  }

  async function handleSaveAddress(walletId: string, addressId: string) {
    await portfolioApi.updateAddress(walletId, addressId, { address: editingAddressValue || null })
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setEditingAddressId(null)
  }

  async function handleDeleteAddress(walletId: string, addressId: string) {
    await portfolioApi.deleteAddress(walletId, addressId)
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
  }

  async function handleSyncAddress(walletId: string, addressId: string) {
    setSyncingAddressId(addressId)
    try {
      await portfolioApi.syncAddress(walletId, addressId)
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
    } finally {
      setSyncingAddressId(null)
    }
  }

  function toggleNets(walletId: string) {
    setExpandedNets(prev => {
      const next = new Set(prev)
      next.has(walletId) ? next.delete(walletId) : next.add(walletId)
      return next
    })
  }

  const userWallets   = wallets.filter(w => !w.is_system)
  const systemWallets = wallets.filter(w => w.is_system)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Wallets</h2>
          <p className="text-xs text-gray-500 mt-0.5">Gestiona tus wallets y direcciones blockchain.</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors">
          <Plus size={14} /> Nueva wallet
        </button>
      </div>

      {showAdd && (
        <AddWalletForm
          onSave={handleCreateWallet}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Wallets de usuario */}
      {userWallets.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-2">
          <p className="text-sm text-gray-500">No tienes wallets configuradas.</p>
          <button type="button" onClick={() => setShowAdd(true)} className="text-xs text-accent-blue hover:underline">Crear primera wallet</button>
        </div>
      ) : (
        <div className="space-y-3">
          {userWallets.map(wallet => {
            const TypeMeta = WALLET_TYPE_META[wallet.type] ?? WALLET_TYPE_META.exchange
            const TypeIcon = TypeMeta.icon
            const isEditing    = editingWalletId === wallet.id
            const netsExpanded = expandedNets.has(wallet.id)

            return (
              <div key={wallet.id} className="rounded-xl border border-border bg-background-card overflow-hidden"
                style={{ borderLeftColor: wallet.color, borderLeftWidth: 3 }}>
                {/* Cabecera wallet */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${wallet.color}20` }}>
                    <TypeIcon size={15} style={{ color: wallet.color }} />
                  </div>

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        className="flex-1 bg-background-tertiary border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent-blue"
                        onKeyDown={e => e.key === 'Enter' && handleSaveWallet(wallet.id)} />
                      <ColorPicker value={editColor} onChange={setEditColor} size="sm" />
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{wallet.name}</span>
                        {wallet.is_default && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-amber/15 text-accent-amber font-bold">DEFAULT</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-600">{TypeMeta.label}</span>
                        {wallet.notes && <span className="text-xs text-gray-700">· {wallet.notes}</span>}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={() => handleSaveWallet(wallet.id)} aria-label="Guardar"
                          className="p-1.5 text-accent-green hover:bg-accent-green/10 rounded-lg transition-colors"><Check size={13} /></button>
                        <button type="button" onClick={() => setEditingWalletId(null)} aria-label="Cancelar"
                          className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors"><X size={13} /></button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditingWalletId(wallet.id); setEditName(wallet.name); setEditColor(wallet.color) }}
                          className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors text-xs">
                          Editar
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(wallet.id)} aria-label="Eliminar wallet"
                          className="p-1.5 text-gray-700 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => toggleNets(wallet.id)} aria-expanded={netsExpanded}
                      aria-label={netsExpanded ? 'Contraer redes' : 'Expandir redes'}
                      className="p-1.5 text-gray-600 hover:text-white transition-colors">
                      <ChevronDown size={13} className={`transition-transform ${netsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Panel de redes / direcciones */}
                {netsExpanded && (
                  <div className="border-t border-border bg-background-tertiary/20 px-4 py-3 space-y-2">
                    {wallet.addresses.length === 0 && !showAddAddress && (
                      <p className="text-xs text-gray-600">Sin redes blockchain configuradas.</p>
                    )}
                    {wallet.addresses.map(addr => {
                      const isEditingAddr = editingAddressId === addr.id
                      const netLabel = addr.network_name ?? addr.custom_network ?? '—'
                      const explorerHref = addr.explorer_url && addr.address
                        ? addr.explorer_url.replace('{address}', addr.address) : null

                      return (
                        <div key={addr.id} className="flex items-center gap-2 group/addr py-1">
                          <span className="text-xs mono px-2 py-0.5 rounded-md bg-background-card text-gray-400 shrink-0 w-24 truncate">
                            {netLabel}
                          </span>
                          {isEditingAddr ? (
                            <div className="flex-1 flex items-center gap-1">
                              <input value={editingAddressValue}
                                onChange={e => setEditingAddressValue(e.target.value)}
                                className="flex-1 bg-background-card border border-border rounded-lg px-2 py-1 text-xs mono focus:outline-none focus:border-accent-blue"
                                placeholder="Dirección pública..."
                                onKeyDown={e => e.key === 'Enter' && handleSaveAddress(wallet.id, addr.id)} />
                              <button type="button" onClick={() => handleSaveAddress(wallet.id, addr.id)} aria-label="Guardar dirección"
                                className="p-1 text-accent-green hover:bg-accent-green/10 rounded"><Check size={11} /></button>
                              <button type="button" onClick={() => setEditingAddressId(null)} aria-label="Cancelar"
                                className="p-1 text-gray-600 hover:text-white rounded"><X size={11} /></button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-1 min-w-0">
                              {addr.address
                                ? <>
                                    <span className="text-xs mono text-gray-500 truncate">{truncateAddress(addr.address)}</span>
                                    <CopyButton text={addr.address} title="Copiar dirección" className="p-1" />
                                    {explorerHref && (
                                      <a href={explorerHref} target="_blank" rel="noopener noreferrer"
                                        className="p-1 text-gray-700 hover:text-accent-blue transition-colors">
                                        <ExternalLink size={11} />
                                      </a>
                                    )}
                                  </>
                                : <span className="text-xs text-gray-700">Sin dirección</span>
                              }
                            </div>
                          )}
                          {!isEditingAddr && addr.address && (
                            <SyncBadge
                              addr={addr}
                              syncing={syncingAddressId === addr.id}
                              onSync={() => handleSyncAddress(wallet.id, addr.id)}
                            />
                          )}
                          {!isEditingAddr && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/addr:opacity-100 transition-opacity">
                              <button type="button" onClick={() => { setEditingAddressId(addr.id); setEditingAddressValue(addr.address ?? '') }}
                                className="p-1 text-gray-600 hover:text-white text-[10px] rounded transition-colors">Editar</button>
                              <button type="button" onClick={() => handleDeleteAddress(wallet.id, addr.id)} aria-label="Eliminar dirección"
                                className="p-1 text-gray-700 hover:text-accent-red rounded transition-colors">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {showAddAddress === wallet.id ? (
                      <AddAddressForm
                        networks={networks}
                        onSave={data => handleAddAddress(wallet.id, data)}
                        onCancel={() => setShowAddAddress(null)}
                      />
                    ) : (
                      <button type="button" onClick={() => setShowAddAddress(wallet.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-accent-blue transition-colors mt-1">
                        <Plus size={11} /> Añadir red blockchain
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Wallets del sistema */}
      {systemWallets.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer list-none flex items-center gap-1.5 py-1">
            <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
            {systemWallets.length} wallets del sistema
          </summary>
          <div className="mt-2 space-y-2">
            {systemWallets.map(w => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-background-card/50 opacity-60">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="text-sm text-gray-400">{w.name}</span>
                <span className="text-[10px] text-gray-600 ml-auto">Sistema</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Borrar wallet"
          message={`Borrar "${confirmTarget.name}"? Solo es posible si no tiene transacciones asociadas.`}
          confirmLabel="Borrar"
          danger
          onConfirm={() => handleDeleteWallet(confirmDeleteId!)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
