import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { Link } from 'react-router-dom'
import {
  Plus, Check, X, ExternalLink, Trash2, ChevronDown, Pencil, Wallet as WalletIcon, History as HistoryIcon,
} from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CopyButton } from '../../components/CopyButton'
import { WALLET_TYPE_META, truncateAddress, hayPendientes } from './wallets/helpers'
import { SyncBadge } from './wallets/SyncBadge'
import { AddAddressForm } from './wallets/AddAddressForm'
import { AddWalletForm } from './wallets/AddWalletForm'
import { WalletEditPanel, type WalletEdit } from './wallets/WalletEditPanel'
import { useWalletValues } from '../../hooks/useWalletValues'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { formatMoney, formatNumber } from '../../utils/format'
import { daysSince, formatAge } from '../../utils/portfolioLots'
import { alpha, ink } from '../../utils/colors'
import { cardClasses, buttonClasses, iconButtonClasses, fieldClasses } from '../../components/ui'
import { explorerLink } from '../../utils/externalLink'

export function WalletsSection({ onWalletCreated }: { onWalletCreated?: () => void }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]                     = useState(false)
  const [confirmDeleteId, setConfirmDeleteId]     = useState<string | null>(null)
  const [showAddAddress, setShowAddAddress]       = useState<string | null>(null)
  const [editingAddressId, setEditingAddressId]   = useState<string | null>(null)
  const [editingAddressValue, setEditingAddressValue] = useState('')
  const [expandedNets, setExpandedNets]           = useState<Set<string>>(new Set())
  // Wallet en edición en el panel lateral (#448).
  const [editingWalletId, setEditingWalletId]     = useState<string | null>(null)
  const [syncingAddressId, setSyncingAddressId]   = useState<string | null>(null)

  // Mientras alguna dirección esté pendiente de su verificación automática, se refresca sola (#336).
  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: portfolioApi.getWalletsFull,
    refetchInterval: q => (hayPendientes(q.state.data ?? []) ? 5_000 : false),
  })
  const { data: networks = [] } = useQuery({
    queryKey: ['networks'],
    queryFn: portfolioApi.getNetworks,
  })

  const confirmTarget = wallets.find(w => w.id === confirmDeleteId)
  const editTarget = wallets.find(w => w.id === editingWalletId)

  // Resumen de cada wallet (#448): valor como en Portfolio, operaciones y última actividad.
  const { byWallet, currency } = useWalletValues()
  const { data: usage = [] } = useQuery({ queryKey: ['wallet-summary'], queryFn: portfolioApi.getWalletSummary })
  const usageOf = (id: string) => usage.find(u => u.wallet_id === id)
  const { confirm } = useSettingFeedback()

  async function handleCreateWallet(data: Record<string, unknown>) {
    await portfolioApi.createWallet(data)
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setShowAdd(false)
    onWalletCreated?.()
  }

  async function handleSaveWallet(id: string, edit: WalletEdit, previous?: WalletEdit) {
    await portfolioApi.updateWallet(id, edit)
    await queryClient.invalidateQueries({ queryKey: ['wallets'] })
    // Nombre y color salen también en Portfolio, Historial y los gráficos.
    void queryClient.invalidateQueries({ queryKey: ['fifo-lots'] })
    if (previous) confirm(`wallet-${id}`, `Wallet ${edit.name}`, () => void handleSaveWallet(id, previous))
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
          <p className="text-xs text-fg-subtle mt-0.5">Gestiona tus wallets y direcciones blockchain.</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          className={buttonClasses('primary', 'md', 'flex')}>
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
          <p className="text-sm text-fg-subtle">No tienes wallets configuradas.</p>
          <button type="button" onClick={() => setShowAdd(true)} className="text-xs text-brand hover:underline">Crear primera wallet</button>
        </div>
      ) : (
        <div className="space-y-3">
          {userWallets.map(wallet => {
            const TypeMeta = WALLET_TYPE_META[wallet.type] ?? WALLET_TYPE_META.exchange
            const TypeIcon = TypeMeta.icon
            const netsExpanded = expandedNets.has(wallet.id)
            const value = byWallet.get(wallet.id)?.value
            const use = usageOf(wallet.id)
            const lastDays = use?.last_activity ? daysSince(Date.parse(use.last_activity)) : null

            return (
              <div key={wallet.id} role="region" aria-label={`Wallet ${wallet.name}`} className={cardClasses('none', 'overflow-hidden')}
                style={{ borderLeftColor: wallet.color, borderLeftWidth: 3 }}>
                {/* Cabecera wallet */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${alpha(wallet.color, 13)}` }}>
                    <TypeIcon size={15} style={{ color: ink(wallet.color) }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{wallet.name}</span>
                      {wallet.is_default && (
                        <span className="text-xs px-1.5 py-0.5 rounded-lg bg-warning/15 text-warning-ink font-bold">DEFAULT</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-fg-subtle flex-wrap">
                      <span>{TypeMeta.label}</span>
                      {wallet.notes && <span className="truncate">· {wallet.notes}</span>}
                    </div>
                  </div>

                  {/* Resumen (#448): valor como en Portfolio, operaciones y última actividad */}
                  <dl className="hidden sm:grid grid-cols-3 gap-x-5 text-right shrink-0">
                    <div><dt className="text-[10px] uppercase tracking-wider text-fg-subtle">Valor</dt>
                      <dd className="mono tabular-nums text-sm font-semibold">{value !== undefined ? formatMoney(value, currency) : '—'}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-wider text-fg-subtle">Operaciones</dt>
                      <dd className="mono tabular-nums text-sm">{formatNumber(use?.operations ?? 0, 0)}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-wider text-fg-subtle">Última</dt>
                      <dd className="text-sm">{lastDays === null ? '—' : formatAge(lastDays)}</dd></div>
                  </dl>

                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setEditingWalletId(wallet.id)} aria-label={`Editar ${wallet.name}`}
                      className={iconButtonClasses('md')}>
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(wallet.id)} aria-label={`Eliminar ${wallet.name}`}
                      className={iconButtonClasses('md', false, '', 'danger')}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => toggleNets(wallet.id)} aria-expanded={netsExpanded}
                      aria-label={netsExpanded ? 'Contraer redes' : 'Expandir redes'}
                      className={iconButtonClasses('md')}>
                      <ChevronDown size={13} className={`transition-transform ${netsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 px-4 pb-3 -mt-1 text-xs">
                  <Link to={`/portfolio?wallet=${wallet.id}`} className="inline-flex items-center gap-1 text-brand-ink hover:underline rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                    <WalletIcon size={11} aria-hidden="true" /> Ver en Portfolio
                  </Link>
                  <Link to={`/history?wallet=${wallet.id}`} className="inline-flex items-center gap-1 text-brand-ink hover:underline rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                    <HistoryIcon size={11} aria-hidden="true" /> Ver sus operaciones
                  </Link>
                </div>

                {/* Panel de redes / direcciones */}
                {netsExpanded && (
                  <div className="border-t border-border bg-background-tertiary/20 px-4 py-3 space-y-2">
                    {wallet.addresses.length === 0 && !showAddAddress && (
                      <p className="text-xs text-fg-subtle">Sin redes blockchain configuradas.</p>
                    )}
                    {wallet.addresses.map(addr => {
                      const isEditingAddr = editingAddressId === addr.id
                      const netLabel = addr.network_name ?? addr.custom_network ?? '—'
                      const explorerHref = explorerLink(addr.explorer_url, '{address}', addr.address)

                      return (
                        <div key={addr.id} className="flex items-center gap-2 group/addr py-1">
                          <span className="text-xs mono px-2 py-0.5 rounded-lg bg-background-card text-fg-muted shrink-0 w-24 truncate">
                            {netLabel}
                          </span>
                          {isEditingAddr ? (
                            <div className="flex-1 flex items-center gap-1">
                              <input value={editingAddressValue}
                                onChange={e => setEditingAddressValue(e.target.value)}
                                className={fieldClasses('sm', false, 'flex-1 bg-background-card px-2 py-1 mono')}
                                placeholder="Dirección pública..."
                                onKeyDown={e => e.key === 'Enter' && handleSaveAddress(wallet.id, addr.id)} />
                              <button type="button" onClick={() => handleSaveAddress(wallet.id, addr.id)} aria-label="Guardar dirección"
                                className={iconButtonClasses('sm', false, '', 'positive')}><Check size={11} /></button>
                              <button type="button" onClick={() => setEditingAddressId(null)} aria-label="Cancelar"
                                className={iconButtonClasses('sm')}><X size={11} /></button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-1 min-w-0">
                              {addr.address
                                ? <>
                                    <span className="text-xs font-mono text-fg-subtle truncate">{truncateAddress(addr.address)}</span>
                                    <CopyButton text={addr.address} title="Copiar dirección" className="p-1" />
                                    {explorerHref && (
                                      <a href={explorerHref} target="_blank" rel="noopener noreferrer"
                                        className="p-1 text-fg-subtle hover:text-brand transition-colors">
                                        <ExternalLink size={11} />
                                      </a>
                                    )}
                                  </>
                                : <span className="text-xs text-fg-subtle">Sin dirección</span>
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
                                className="p-1 text-fg-subtle hover:text-fg text-xs rounded-lg transition-colors">Editar</button>
                              <button type="button" onClick={() => handleDeleteAddress(wallet.id, addr.id)} aria-label="Eliminar dirección"
                                className={iconButtonClasses('sm', false, '', 'danger')}>
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
                        className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-brand transition-colors mt-1">
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
          <summary className="text-xs text-fg-subtle hover:text-fg-muted cursor-pointer list-none flex items-center gap-1.5 py-1">
            <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
            {systemWallets.length} wallets del sistema
          </summary>
          <div className="mt-2 space-y-2">
            {systemWallets.map(w => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-background-card/50 opacity-60">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="text-sm text-fg-muted">{w.name}</span>
                <span className="text-xs text-fg-subtle ml-auto">Sistema</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {editTarget && (
        <WalletEditPanel wallet={editTarget} onClose={() => setEditingWalletId(null)}
          onSave={edit => handleSaveWallet(editTarget.id, edit,
            { name: editTarget.name, type: editTarget.type, color: editTarget.color, notes: editTarget.notes })} />
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
