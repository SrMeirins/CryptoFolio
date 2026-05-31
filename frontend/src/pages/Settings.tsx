import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, AssetMetadata } from '../api/portfolio'
import {
  Search, Plus, RefreshCw, CheckCircle, XCircle,
  AlertCircle, Edit2, Zap, ExternalLink, Trash2,
  HardDrive, ArrowRight, X, Building2, Shield,
  Smartphone, Landmark, Copy, Check, ChevronDown
} from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { usePricesStore } from '../store/pricesStore'

const SETUP_KEY = 'cflio_setup_seen'

function useSetup() {
  const [seen, setSeen] = useState(() => localStorage.getItem(SETUP_KEY) === 'true')
  function markSeen() {
    localStorage.setItem(SETUP_KEY, 'true')
    setSeen(true)
  }
  return { setupSeen: seen, markSetupSeen: markSeen }
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  eur_direct: { label: 'EUR directo', color: '#00c896' },
  usdt_proxy: { label: 'Vía USDT',    color: '#6366f1' },
  btc_proxy:  { label: 'Vía BTC',     color: '#f59e0b' },
  fiat:       { label: 'Estable',      color: '#6b7280' },
  unknown:    { label: 'Sin precio',   color: '#e74c3c' },
}

function fmtPrice(p: number): string {
  if (p >= 10000)   return `€${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (p >= 1)       return `€${p.toFixed(4)}`
  if (p >= 0.001)   return `€${p.toFixed(6)}`
  if (p >= 0.00001) return `€${p.toFixed(8)}`
  return `€${p.toExponential(4)}`
}


interface AddressData {
  id: string
  network_name: string | null
  network_native_asset: string | null
  custom_network: string | null
  address: string | null
  explorer_url: string | null
}

interface WalletData {
  id: string
  name: string
  type: string
  is_system: boolean
  is_default: boolean
  color: string
  notes: string | null
  addresses: AddressData[]
}

interface NetworkData {
  id: string
  name: string
  native_asset: string
  explorer_url: string | null
  tokens: { id: string; asset: string }[]
}

// ── SetupBanner ────────────────────────────────────────────────────────────
function SetupBanner({ onDismiss, onAddWallet }: { onDismiss: () => void; onAddWallet: () => void }) {
  return (
    <div className="card border border-accent-blue/30 bg-accent-blue/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-accent-blue/10 rounded-lg shrink-0">
            <HardDrive size={20} className="text-accent-blue" />
          </div>
          <div>
            <h3 className="font-medium text-sm">Configura tus wallets antes de importar</h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Si tienes wallets frías (Tangem, Ledger, Trezor...) añádelas aquí para que
              los retiros de Binance se asignen correctamente. Si solo operas en Binance
              no necesitas hacer nada más.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={onAddWallet}
                className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                Añadir wallet fría
              </button>
              <button
                onClick={onDismiss}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Solo uso Binance
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-600 hover:text-white transition-colors shrink-0 mt-0.5"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

// ── SettingsTabs ───────────────────────────────────────────────────────────
function SettingsTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: portfolioApi.getAssets })
  const unknownCount = assets.filter(a => !a.is_stablecoin && a.price_source === 'unknown').length

  const tabs = [
    { id: 'wallets', label: 'Wallets' },
    { id: 'assets',  label: 'Activos', badge: unknownCount },
    { id: 'fiscal',  label: 'Fiscal' },
    { id: 'datos',   label: 'Datos' },
    { id: 'general', label: 'General' },
  ]

  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px ${
            active === tab.id
              ? 'text-white border-accent-blue'
              : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600'
          }`}
        >
          {tab.label}
          {tab.badge > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-red/15 text-accent-red font-semibold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Settings principal ─────────────────────────────────────────────────────
export function Settings() {
  const { setupSeen, markSetupSeen } = useSetup()
  const [activeTab, setActiveTab] = useState('wallets')

  // Auto-dismiss banner si ya hay wallets frías configuradas
  const { data: wallets = [] } = useQuery<WalletData[]>({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })
  useEffect(() => {
    if (!setupSeen && wallets.some(w => !w.is_system)) {
      markSetupSeen()
    }
  }, [wallets, setupSeen, markSetupSeen])

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto">
      {/* Cabecera fija */}
      <div className="px-6 pt-6 pb-0 space-y-4 shrink-0">
        <h1 className="text-2xl font-semibold">Configuración</h1>

        {!setupSeen && activeTab === 'wallets' && (
          <SetupBanner
            onDismiss={markSetupSeen}
            onAddWallet={() => { markSetupSeen(); setActiveTab('wallets') }}
          />
        )}

        <SettingsTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Contenido del tab activo — cada tab gestiona su propio scroll */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'wallets' && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <WalletsSection onWalletCreated={markSetupSeen} />
          </div>
        )}
        {activeTab === 'assets'  && <AssetsSection />}
        {activeTab === 'fiscal'  && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <FiscalSection />
          </div>
        )}
        {activeTab === 'datos'   && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <DatosSection />
          </div>
        )}
        {activeTab === 'general' && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <GeneralSection />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers UI ────────────────────────────────────────────────────────────
const WALLET_TYPE_META: Record<string, { label: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  exchange: { label: 'Exchange',        Icon: Building2  },
  hardware: { label: 'Hardware wallet', Icon: Shield      },
  software: { label: 'Software wallet', Icon: Smartphone  },
  bank:     { label: 'Banco / Fiat',    Icon: Landmark    },
}

function truncateAddress(addr: string) {
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="text-gray-600 hover:text-white transition-colors p-0.5" title="Copiar dirección">
      {copied ? <Check size={11} className="text-accent-green" /> : <Copy size={11} />}
    </button>
  )
}

// ── WalletsSection ─────────────────────────────────────────────────────────
function WalletsSection({ onWalletCreated }: { onWalletCreated?: () => void }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showAddAddress, setShowAddAddress] = useState<string | null>(null)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [editingAddressValue, setEditingAddressValue] = useState('')
  const [expandedNets, setExpandedNets] = useState<Set<string>>(new Set())
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const COLORS = ['#6366f1', '#00c896', '#e74c3c', '#f59e0b', '#3b82f6', '#9b59b6', '#1abc9c', '#e67e22']

  async function handleSaveWallet(id: string) {
    await fetch(`/api/wallets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, color: editColor }),
    })
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setEditingWalletId(null)
  }

  function toggleNets(walletId: string) {
    setExpandedNets(prev => {
      const next = new Set(prev)
      next.has(walletId) ? next.delete(walletId) : next.add(walletId)
      return next
    })
  }

  const { data: wallets = [] } = useQuery<WalletData[]>({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })

  const { data: networks = [] } = useQuery<NetworkData[]>({
    queryKey: ['networks'],
    queryFn: () => fetch('/api/wallets/networks').then(r => r.json()),
  })

  const confirmTarget = wallets.find(w => w.id === confirmDeleteId)

  async function handleDeleteWallet(id: string) {
    await fetch(`/api/wallets/${id}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setConfirmDeleteId(null)
  }

  async function handleDeleteAddress(walletId: string, addressId: string) {
    await fetch(`/api/wallets/${walletId}/addresses/${addressId}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
  }

  async function handleSaveAddress(walletId: string, addressId: string) {
    await fetch(`/api/wallets/${walletId}/addresses/${addressId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: editingAddressValue || null }),
    })
    queryClient.invalidateQueries({ queryKey: ['wallets'] })
    setEditingAddressId(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Wallets</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Gestiona tus wallets y direcciones blockchain.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          Nueva wallet
        </button>
      </div>

      {showAdd && (
        <AddWalletForm
          onSave={async (data) => {
            await fetch('/api/wallets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            queryClient.invalidateQueries({ queryKey: ['wallets'] })
            setShowAdd(false)
            onWalletCreated?.()
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Wallet cards */}
      <div className="space-y-3">
        {wallets.map((wallet) => {
          const meta = WALLET_TYPE_META[wallet.type] ?? WALLET_TYPE_META.software
          const Icon = meta.Icon
          const isExchange = wallet.type === 'exchange'

          return (
            <div
              key={wallet.id}
              className="rounded-xl border border-border bg-background-card"
              style={{ borderLeftColor: wallet.color, borderLeftWidth: 3 }}
            >
              {/* Wallet header */}
              {editingWalletId === wallet.id ? (
                /* ── Modo edición inline ── */
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${editColor}18` }}>
                      <Icon size={16} style={{ color: editColor }} />
                    </div>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveWallet(wallet.id); if (e.key === 'Escape') setEditingWalletId(null) }}
                      className="flex-1 bg-background-tertiary border border-accent-blue rounded-lg px-3 py-2 text-sm font-medium focus:outline-none"
                    />
                    <button onClick={() => handleSaveWallet(wallet.id)} disabled={!editName.trim()}
                      className="px-3 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
                      Guardar
                    </button>
                    <button onClick={() => setEditingWalletId(null)}
                      className="p-2 text-gray-500 hover:text-white transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pl-12">
                    <span className="text-xs text-gray-500">Color:</span>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setEditColor(c)}
                        className={`w-6 h-6 rounded-full transition-transform ${editColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Vista normal ── */
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${wallet.color}18` }}>
                      <Icon size={16} style={{ color: wallet.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{wallet.name}</span>
                        {wallet.is_system && (
                          <span className="text-xs bg-background-tertiary text-gray-500 px-1.5 py-0.5 rounded-md">sistema</span>
                        )}
                        <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                          style={{ backgroundColor: `${wallet.color}18`, color: wallet.color }}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isExchange
                          ? 'Activos custodiados en la plataforma'
                          : wallet.addresses.length === 0
                            ? 'Sin redes configuradas'
                            : `${wallet.addresses.length} red${wallet.addresses.length !== 1 ? 'es' : ''} configurada${wallet.addresses.length !== 1 ? 's' : ''}`
                        }
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isExchange && (
                      <button
                        onClick={() => setShowAddAddress(showAddAddress === wallet.id ? null : wallet.id)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-background-tertiary hover:bg-border rounded-lg transition-colors text-gray-400 hover:text-white"
                      >
                        <Plus size={11} />
                        Red
                      </button>
                    )}
                    {!wallet.is_system && (
                      <>
                        <button
                          onClick={() => { setEditingWalletId(wallet.id); setEditName(wallet.name); setEditColor(wallet.color) }}
                          className="text-gray-600 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-background-tertiary"
                          title="Editar wallet"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(wallet.id)}
                          className="text-gray-600 hover:text-accent-red transition-colors p-1.5 rounded-lg hover:bg-accent-red/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Formulario añadir red */}
              {showAddAddress === wallet.id && (
                <div className="mx-4 mb-4 p-4 rounded-lg border border-border bg-background-tertiary/30">
                  <AddAddressForm
                    walletId={wallet.id}
                    networks={networks}
                    onSave={async (data) => {
                      await fetch(`/api/wallets/${wallet.id}/addresses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      })
                      queryClient.invalidateQueries({ queryKey: ['wallets'] })
                      setShowAddAddress(null)
                    }}
                    onCancel={() => setShowAddAddress(null)}
                  />
                </div>
              )}

              {/* Redes — colapsables */}
              {!isExchange && wallet.addresses.length > 0 && (
                <>
                  {/* Resumen colapsado + toggle */}
                  <button
                    onClick={() => toggleNets(wallet.id)}
                    className="w-full flex items-center gap-2 px-4 pb-3 pt-0 hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap flex-1">
                      {wallet.addresses.slice(0, expandedNets.has(wallet.id) ? 0 : 999).map(addr => (
                        <span
                          key={addr.id}
                          className="text-xs px-2 py-0.5 rounded-md bg-background-tertiary text-gray-400 border border-border/50"
                        >
                          {addr.network_name ?? addr.custom_network}
                        </span>
                      ))}
                      {!expandedNets.has(wallet.id) && (
                        <span className="text-xs text-gray-600 ml-1">
                          {wallet.addresses.length} red{wallet.addresses.length !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={13}
                      className={`text-gray-600 shrink-0 transition-transform duration-200 ${expandedNets.has(wallet.id) ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Detalle expandido */}
                  {expandedNets.has(wallet.id) && (
                  <div className="border-t border-border divide-y divide-border/50">
                  {wallet.addresses.map((addr) => {
                    const explorerHref = addr.explorer_url && addr.address
                      ? addr.explorer_url.replace('{address}', addr.address)
                      : null
                    const isEditingThis = editingAddressId === addr.id

                    return (
                      <div key={addr.id} className="px-5 py-3 flex items-center justify-between gap-4 group">
                        {/* Red + dirección */}
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium">{addr.network_name ?? addr.custom_network}</span>
                              {addr.network_native_asset && (
                                <span className="text-xs text-gray-600 mono">{addr.network_native_asset}</span>
                              )}
                            </div>

                            {isEditingThis ? (
                              <div className="flex items-center gap-2 mt-1.5">
                                <input
                                  autoFocus
                                  value={editingAddressValue}
                                  onChange={e => setEditingAddressValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveAddress(wallet.id, addr.id)
                                    if (e.key === 'Escape') setEditingAddressId(null)
                                  }}
                                  placeholder="Dirección pública..."
                                  className="bg-background-secondary border border-accent-blue rounded-lg px-3 py-1.5 text-xs mono text-white w-80 focus:outline-none"
                                />
                                <button onClick={() => handleSaveAddress(wallet.id, addr.id)} className="text-xs px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 rounded-lg font-medium transition-colors">
                                  Guardar
                                </button>
                                <button onClick={() => setEditingAddressId(null)} className="text-xs text-gray-500 hover:text-white transition-colors">
                                  Cancelar
                                </button>
                              </div>
                            ) : addr.address ? (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs mono text-gray-500">{truncateAddress(addr.address)}</span>
                                <CopyButton text={addr.address} />
                                {explorerHref && (
                                  <a href={explorerHref} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-accent-blue transition-colors" title="Ver en explorador">
                                    <ExternalLink size={11} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingAddressId(addr.id); setEditingAddressValue('') }}
                                className="text-xs text-gray-600 hover:text-accent-blue mt-0.5 transition-colors"
                              >
                                + Añadir dirección
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Acciones */}
                        {!isEditingThis && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => { setEditingAddressId(addr.id); setEditingAddressValue(addr.address ?? '') }}
                              className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors"
                              title="Editar dirección"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteAddress(wallet.id, addr.id)}
                              className="p-1.5 text-gray-600 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {confirmTarget != null && (
        <ConfirmDialog
          title="Borrar wallet"
          message={`Borrar "${confirmTarget.name}"? Se eliminaran todas sus direcciones configuradas.`}
          confirmLabel="Borrar"
          danger
          onConfirm={() => handleDeleteWallet(confirmDeleteId!)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── AddWalletForm ──────────────────────────────────────────────────────────
function AddWalletForm({ onSave, onCancel }: {
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('hardware')
  const [color, setColor] = useState('#6366f1')
  const [notes, setNotes] = useState('')

  const COLORS = ['#6366f1', '#00c896', '#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#1abc9c', '#e67e22']
  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  return (
    <div className="card space-y-4">
      <h3 className="font-medium text-sm">Nueva wallet</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Mi Tangem, Ledger Nano..."
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Tipo *</label>
          <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
            <option value="hardware">Hardware wallet</option>
            <option value="software">Software wallet</option>
            <option value="exchange">Exchange</option>
            <option value="bank">Banco / Fiat</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Color</label>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Notas (opcional)</label>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Tangem Card modelo 2..."
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          Cancelar
        </button>
        <button
          onClick={() => onSave({ name, type, color, notes: notes || null })}
          disabled={!name}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          Crear wallet
        </button>
      </div>
    </div>
  )
}

// ── NetworkPicker ──────────────────────────────────────────────────────────
const OTHER_NETWORK = '__other__'

// Placeholder de dirección según el tipo de red
function getAddressPlaceholder(network: NetworkData | undefined): string {
  if (!network) return 'Pega tu dirección pública...'
  const asset = network.native_asset.toUpperCase()
  const name  = network.name.toLowerCase()
  if (['ETH','BNB','MATIC','POL','CRO','AVAX','FTM','S','ETC'].includes(asset) ||
      name.includes('arbitrum') || name.includes('optimism') || name.includes('base') ||
      name.includes('zksync') || name.includes('polygon'))
    return '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  if (asset === 'BTC') return 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
  if (asset === 'XRP') return 'rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe'
  if (asset === 'SOL') return '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
  if (asset === 'ADA') return 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer...'
  if (asset === 'DOT' || asset === 'KSM') return '1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg'
  if (asset === 'ATOM') return 'cosmos1yw6g44c4pqd2rxgrcqekxg9k8f4fd8xpab7ase'
  if (asset === 'TON') return 'EQBcSIhFKSTt4f-vZ1pPtSeMXKhCUxJn5yNLZ0eUv4L9BAKA'
  if (asset === 'TRX') return 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7'
  if (asset === 'XLM') return 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV5UOIQJOHNHKN'
  if (asset === 'LTC') return 'ltc1qvmqas4e29ux5eausp0x8mkykhfhunvquhfa9rz'
  if (asset === 'DOGE') return 'D7Y55f7nVCZrSuFwbQErSGkjuV2eM48Roc'
  if (asset === 'NEAR') return 'ejemplo.near'
  if (asset === 'SUI') return '0x1234...abcd (dirección Sui)'
  if (asset === 'APT') return '0x1234...abcd (dirección Aptos)'
  return 'Pega tu dirección pública...'
}

function NetworkPicker({ networks, value, onChange }: {
  networks: NetworkData[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(true)  // abierto hasta que se seleccione
  const [search, setSearch] = useState('')

  const filtered = networks.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.native_asset.toLowerCase().includes(search.toLowerCase())
  )

  const selectedNetwork = networks.find(n => n.id === value)
  const isCustom = value === OTHER_NETWORK
  const hasSelection = !!value

  function select(id: string) {
    onChange(id)
    setSearch('')
    setOpen(false)
  }

  // Chip de red seleccionada (estado colapsado)
  if (hasSelection && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-accent-blue/40 bg-accent-blue/6 hover:bg-accent-blue/10 transition-colors text-left group"
      >
        <Check size={15} className="text-accent-green shrink-0" />
        {isCustom ? (
          <span className="flex-1 text-sm font-medium text-white">Añadir manualmente</span>
        ) : (
          <>
            <span className="flex-1 text-sm font-medium text-white">{selectedNetwork?.name}</span>
            <span className="text-xs mono px-2 py-0.5 rounded-md bg-accent-blue/15 text-accent-blue">
              {selectedNetwork?.native_asset}
            </span>
          </>
        )}
        <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">Cambiar</span>
      </button>
    )
  }

  // Panel de selección
  return (
    <div className="rounded-xl border border-border bg-background-secondary overflow-hidden shadow-lg">

      {/* Buscador */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
        <Search size={14} className="text-gray-500 shrink-0" />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Bitcoin, ETH, Solana..."
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
        />
        {search ? (
          <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-300 transition-colors">
            <X size={13} />
          </button>
        ) : (
          <span className="text-xs text-gray-700">{networks.length} redes</span>
        )}
      </div>

      {/* Lista */}
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <Search size={16} className="text-gray-700" />
            <p className="text-xs text-gray-600">Sin resultados para <span className="text-gray-400">"{search}"</span></p>
            <p className="text-xs text-gray-700">Usa "Añadir manualmente" si no está en la lista</p>
          </div>
        ) : (
          filtered.map(n => {
            const isSelected = value === n.id
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => select(n.id)}
                className={`group w-full flex items-center gap-3 px-3.5 py-2.5 transition-all text-left border-l-2 ${
                  isSelected
                    ? 'border-accent-blue bg-accent-blue/8'
                    : 'border-transparent hover:border-border hover:bg-white/4'
                }`}
              >
                <span className={`flex-1 text-sm transition-colors ${isSelected ? 'text-white font-medium' : 'text-gray-300 group-hover:text-white'}`}>
                  {n.name}
                </span>
                <span className={`text-xs mono px-2 py-0.5 rounded-md transition-colors ${
                  isSelected
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'bg-background-tertiary text-gray-500 group-hover:text-gray-400'
                }`}>
                  {n.native_asset}
                </span>
                {isSelected && <Check size={13} className="text-accent-blue shrink-0" />}
              </button>
            )
          })
        )}
      </div>

      {/* Añadir manualmente */}
      <div className="p-2 border-t border-border bg-background-tertiary/40">
        <button
          type="button"
          onClick={() => select(OTHER_NETWORK)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
            isCustom
              ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
              : 'border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 hover:bg-white/4'
          }`}
        >
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
            isCustom ? 'border-accent-blue text-accent-blue' : 'border-gray-600 text-gray-600'
          }`}>
            <Plus size={11} />
          </div>
          <div>
            <p className={`text-xs font-semibold ${isCustom ? 'text-accent-blue' : ''}`}>Añadir manualmente</p>
            <p className="text-xs text-gray-600 leading-tight">La red no está en la lista</p>
          </div>
          {isCustom && <Check size={13} className="ml-auto text-accent-blue shrink-0" />}
        </button>
      </div>
    </div>
  )
}

// ── AddAddressForm ─────────────────────────────────────────────────────────
function AddAddressForm({ walletId: _walletId, networks, onSave, onCancel }: {
  walletId: string
  networks: NetworkData[]
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState('')
  const [customName, setCustomName] = useState('')
  const [customExplorerUrl, setCustomExplorerUrl] = useState('')
  const [address, setAddress] = useState('')

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"
  const isCustom = selected === OTHER_NETWORK
  const selectedNetwork = networks.find(n => n.id === selected)
  const explorerHref = selectedNetwork?.explorer_url && address
    ? selectedNetwork.explorer_url.replace('{address}', address)
    : null
  const addressPlaceholder = getAddressPlaceholder(selectedNetwork)
  const canSave = isCustom ? !!customName : !!selected

  function handleSave() {
    onSave({
      network_id:          isCustom ? null : selected || null,
      custom_network:      isCustom ? customName : null,
      custom_explorer_url: isCustom ? (customExplorerUrl || null) : null,
      address:             address || null,
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-400">Añadir red blockchain</p>

      {/* Network picker */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Red *</label>
        <NetworkPicker
          networks={networks}
          value={selected}
          onChange={id => { setSelected(id); setCustomName(''); setCustomExplorerUrl('') }}
        />
        {explorerHref && (
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors pt-1"
          >
            <ExternalLink size={11} />
            Verificar en el explorador
          </a>
        )}
      </div>

      {/* Campos para red manual */}
      {isCustom && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Nombre de la red *</label>
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Ej: Stacks, Kaspa, Filecoin..."
              className={inputClass}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">URL del explorador (opcional)</label>
            <input
              value={customExplorerUrl}
              onChange={e => setCustomExplorerUrl(e.target.value)}
              placeholder="https://explorer.ejemplo.com/address/{address}"
              className={inputClass}
            />
            <p className="text-xs text-gray-600">
              Usa <span className="mono text-gray-400">{'{address}'}</span> como placeholder
            </p>
          </div>
        </>
      )}

      {/* Dirección */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Dirección pública (opcional)</label>
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder={addressPlaceholder}
          className={`${inputClass} font-mono text-xs`}
        />
        {!address && (
          <p className="text-xs text-gray-600">
            Cubre todos los tokens de esa red. Puedes añadirla después.
          </p>
        )}
        {explorerHref && (
          <a
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            <ExternalLink size={11} />
            Verificar en el explorador
          </a>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
        >
          Añadir red
        </button>
      </div>
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group w-fit">
      <div className={`relative w-9 h-5 rounded-full transition-all duration-200 shrink-0 ${
        checked ? 'bg-accent-blue' : 'bg-background-tertiary border border-border group-hover:border-gray-500'
      }`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4 bg-white' : 'bg-gray-500 group-hover:bg-gray-400'
        }`} />
      </div>
      <span className={`text-xs transition-colors ${checked ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}`}>
        {label}
      </span>
    </button>
  )
}

// ── AssetsSection ──────────────────────────────────────────────────────────
function AssetsSection() {
  const queryClient = useQueryClient()
  const prices = usePricesStore(s => s.prices)
  const [search, setSearch] = useState('')
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [detectingAll, setDetectingAll] = useState(false)
  const [detectResult, setDetectResult] = useState<{ detected: number; failed: number } | null>(null)
  const [showStablecoins, setShowStablecoins] = useState(false)
  const [page, setPage] = useState(0)

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: portfolioApi.getAssets,
  })

  const filtered = assets.filter(a =>
    a.symbol.toLowerCase().includes(search.toLowerCase()) ||
    a.name?.toLowerCase().includes(search.toLowerCase())
  )
  const stablecoins = filtered.filter(a => a.is_stablecoin || a.price_source === 'fiat')
  const unknown     = filtered.filter(a => !a.is_stablecoin && a.price_source === 'unknown')
  const normal      = filtered.filter(a => !a.is_stablecoin && a.price_source !== 'unknown' && a.price_source !== 'fiat')

  const PAGE_SIZE   = 10
  const totalPages  = Math.ceil(normal.length / PAGE_SIZE)
  const normalPaged = normal.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function handleDetectAll() {
    setDetectingAll(true)
    setDetectResult(null)
    try {
      const result = await portfolioApi.detectAllPairs()
      setDetectResult(result)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally {
      setDetectingAll(false)
    }
  }

  async function handleDelete(symbol: string) {
    try {
      await portfolioApi.deleteAsset(symbol)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } catch (e) {
      alert((e as Error).message)
    }
    setConfirmDelete(null)
  }

  function toggleEdit(symbol: string) {
    setEditingSymbol(prev => prev === symbol ? null : symbol)
  }

  const inputSearch = "w-full bg-background-tertiary border border-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  return (
    <div className="h-full flex flex-col">

      {/* ── HEADER FIJO ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Activos y precios</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Pares de precio en Binance para cada activo. Se auto-detectan al importar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unknown.length > 0 && !detectingAll && (
              <button onClick={handleDetectAll} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors" style={{ backgroundColor: '#f59e0b18', color: '#f59e0b' }}>
                <Zap size={12} />
                Detectar {unknown.length} sin precio
              </button>
            )}
            {detectingAll && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 px-3 py-2">
                <RefreshCw size={12} className="animate-spin" />
                Detectando...
              </span>
            )}
            <button onClick={() => setShowAdd(s => !s)} className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors">
              <Plus size={14} />
              Añadir activo
            </button>
          </div>
        </div>

        {/* Resultado detección */}
        {detectResult && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-accent-green/30 bg-accent-green/8 text-sm">
            <span className="flex items-center gap-2 text-accent-green">
              <CheckCircle size={13} />
              {detectResult.detected} actualizado{detectResult.detected !== 1 ? 's' : ''}
              {detectResult.failed > 0 && <span className="text-gray-400">, {detectResult.failed} sin par en Binance</span>}
            </span>
            <button onClick={() => setDetectResult(null)} className="text-gray-600 hover:text-white transition-colors"><X size={13} /></button>
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <AddAssetDialog
            onClose={() => setShowAdd(false)}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setShowAdd(false) }}
          />
        )}

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input placeholder="Buscar activo..." value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} className={inputSearch} />
          {!search && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-700">{assets.length} activos</span>}
        </div>
      </div>

      {/* ── LISTA CON SCROLL PROPIO ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isLoading && <div className="py-8 text-center text-gray-500 text-sm">Cargando...</div>}

        {/* Sin precio */}
        {unknown.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <AlertCircle size={12} className="text-accent-red" />
              <span className="text-xs font-medium text-accent-red">{unknown.length} sin precio configurado</span>
            </div>
            {unknown.map(a => (
              <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
                onEdit={() => toggleEdit(a.symbol)}
                onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
                onDelete={() => setConfirmDelete(a.symbol)} />
            ))}
          </div>
        )}

        {/* Normales paginados */}
        {normal.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {normalPaged.map(a => (
                <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
                  onEdit={() => toggleEdit(a.symbol)}
                  onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
                  onDelete={() => setConfirmDelete(a.symbol)} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-600">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, normal.length)} de {normal.length} activos
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1.5 text-xs rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
                    ← Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button key={i} onClick={() => setPage(i)}
                      className={`w-7 h-7 text-xs rounded-lg transition-colors ${i === page ? 'bg-accent-blue text-white font-medium' : 'bg-background-tertiary border border-border hover:bg-border text-gray-400'}`}>
                      {i + 1}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    className="px-3 py-1.5 text-xs rounded-lg bg-background-tertiary border border-border hover:bg-border disabled:opacity-40 transition-colors">
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stablecoins */}
        {stablecoins.length > 0 && (
          <div>
            <button onClick={() => setShowStablecoins(s => !s)}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1 px-1">
              <ChevronDown size={12} className={`transition-transform duration-200 ${showStablecoins ? 'rotate-180' : ''}`} />
              {stablecoins.length} stablecoins y fiat
            </button>
            {showStablecoins && (
              <div className="space-y-1.5 mt-2">
                {stablecoins.map(a => (
                  <AssetItem key={a.symbol} asset={a} price={prices[a.symbol]} isEditing={editingSymbol === a.symbol}
                    onEdit={() => toggleEdit(a.symbol)}
                    onSaved={() => { queryClient.invalidateQueries({ queryKey: ['assets'] }); setEditingSymbol(null) }}
                    onDelete={() => setConfirmDelete(a.symbol)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Borrar activo"
          message={`Borrar "${confirmDelete}"? Solo es posible si no tiene transacciones asociadas.`}
          confirmLabel="Borrar"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ── AssetItem ──────────────────────────────────────────────────────────────
function AssetItem({ asset, price, isEditing, onEdit, onSaved, onDelete }: {
  asset: AssetMetadata
  price: number | undefined
  isEditing: boolean
  onEdit: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  const src = SOURCE_META[asset.price_source] ?? SOURCE_META.unknown
  const activePair = asset.binance_eur_pair ?? asset.binance_usdt_pair ?? asset.binance_btc_pair

  return (
    <div
      className="rounded-xl border border-border bg-background-card"
      style={{ borderLeftColor: src.color, borderLeftWidth: 3 }}
    >
      {/* Fila principal */}
      <div className="group flex items-center gap-4 px-4 py-3">
        {/* Símbolo + nombre */}
        <div className="w-28 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold mono">{asset.symbol}</span>
            {asset.auto_detected && (
              <span className="text-xs" style={{ color: '#6366f1' }}>auto</span>
            )}
          </div>
          <div className="text-xs text-gray-600 truncate">{asset.name}</div>
        </div>

        {/* Badge + par activo */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
            style={{ backgroundColor: `${src.color}18`, color: src.color }}
          >
            {src.label}
          </span>
          {activePair && (
            <span className="text-xs mono text-gray-500 truncate">{activePair}</span>
          )}
        </div>

        {/* Precio en vivo */}
        <div className="w-28 text-right shrink-0">
          {price != null
            ? <span className="text-sm font-medium mono">{fmtPrice(price)}</span>
            : <span className="text-xs text-gray-700">—</span>
          }
        </div>

        {/* Acciones (hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors"
            title="Editar"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-600 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors"
            title="Borrar"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Panel edición accordion */}
      {isEditing && <AssetEditPanel asset={asset} onSaved={onSaved} onCancel={onEdit} />}
    </div>
  )
}

// ── AssetEditPanel ─────────────────────────────────────────────────────────
function AssetEditPanel({ asset, onSaved, onCancel }: {
  asset: AssetMetadata
  onSaved: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [eurPair,     setEurPair]     = useState(asset.binance_eur_pair  ?? '')
  const [usdtPair,    setUsdtPair]    = useState(asset.binance_usdt_pair ?? '')
  const [btcPair,     setBtcPair]     = useState(asset.binance_btc_pair  ?? '')
  const [isStable,    setIsStable]    = useState(asset.is_stablecoin)
  const [detecting,   setDetecting]   = useState(false)
  const [detectRan,   setDetectRan]   = useState(false)
  const [testPairVal, setTestPairVal] = useState('')
  const [testResult,  setTestResult]  = useState<{ exists: boolean; price?: number } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saving,      setSaving]      = useState(false)

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  async function handleDetect() {
    setDetecting(true)
    try {
      const result = await portfolioApi.detectPairs(asset.symbol)
      setEurPair(result.binance_eur_pair  ?? '')
      setUsdtPair(result.binance_usdt_pair ?? '')
      setBtcPair(result.binance_btc_pair  ?? '')
      setDetectRan(true)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally {
      setDetecting(false)
    }
  }

  async function handleTest() {
    if (!testPairVal) return
    setTestLoading(true)
    setTestResult(null)
    const result = await portfolioApi.testPair(testPairVal)
    setTestResult(result)
    setTestLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    await portfolioApi.updateAsset(asset.symbol, {
      binance_eur_pair:  eurPair  || null,
      binance_usdt_pair: usdtPair || null,
      binance_btc_pair:  btcPair  || null,
      is_stablecoin:     isStable,
    } as Partial<AssetMetadata>)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="border-t border-border bg-background-tertiary/20 px-4 py-4 space-y-4">
      {/* Cabecera + auto-detectar */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-400">Editar pares de precio — <span className="mono">{asset.symbol}</span></p>
        <button
          onClick={handleDetect}
          disabled={detecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#6366f118', color: '#6366f1' }}
        >
          {detecting ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
          Auto-detectar
        </button>
      </div>

      {/* Pares */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'Par EUR',  val: eurPair,  set: setEurPair,  ph: `${asset.symbol}EUR`  },
          { label: 'Par USDT', val: usdtPair, set: setUsdtPair, ph: `${asset.symbol}USDT` },
          { label: 'Par BTC',  val: btcPair,  set: setBtcPair,  ph: `${asset.symbol}BTC`  },
        ] as const).map(({ label, val, set, ph }) => (
          <div key={label} className="space-y-1">
            <label className="text-xs text-gray-500">{label}</label>
            <input value={val} onChange={e => set(e.target.value.toUpperCase())} placeholder={ph} className={inputClass} />
            {detectRan && !val && (
              <p className="flex items-center gap-1 text-xs text-gray-600">
                <XCircle size={10} />
                No disponible
              </p>
            )}
          </div>
        ))}
      </div>

      <Toggle checked={isStable} onChange={setIsStable} label="Stablecoin o fiat (sin par de precio)" />

      {/* Probar par */}
      <div className="pt-2 border-t border-border/50 space-y-2">
        <p className="text-xs text-gray-600">Probar par en Binance</p>
        <div className="flex gap-2">
          <input
            value={testPairVal}
            onChange={e => setTestPairVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            placeholder={`${asset.symbol}EUR, ${asset.symbol}USDT...`}
            className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"
          />
          <button
            onClick={handleTest}
            disabled={testLoading || !testPairVal}
            className="px-3 py-2 bg-background-tertiary hover:bg-border disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            {testLoading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>
        {testResult && (
          <div className={`flex items-center gap-2 text-xs ${testResult.exists ? 'text-accent-green' : 'text-accent-red'}`}>
            {testResult.exists
              ? <><CheckCircle size={12} /> Existe — precio actual: <span className="mono font-medium">{testResult.price?.toFixed(6)} EUR</span></>
              : <><XCircle size={12} /> Par no encontrado en Binance</>
            }
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── AddAssetDialog ─────────────────────────────────────────────────────────
type DetectStatus = 'idle' | 'detecting' | 'found' | 'notfound'

function AddAssetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [symbol,   setSymbol]   = useState('')
  const [name,     setName]     = useState('')
  const [eurPair,  setEurPair]  = useState('')
  const [usdtPair, setUsdtPair] = useState('')
  const [btcPair,  setBtcPair]  = useState('')
  const [isStable, setIsStable] = useState(false)
  const [status,   setStatus]   = useState<DetectStatus>('idle')
  const [saving,   setSaving]   = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm mono placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  // Auto-detect al escribir — solo consulta Binance, NO guarda en DB
  useEffect(() => {
    const sym = symbol.trim()
    if (sym.length < 2) { setStatus('idle'); setEurPair(''); setUsdtPair(''); setBtcPair(''); return }

    clearTimeout(debounceRef.current)
    setStatus('detecting')

    debounceRef.current = setTimeout(async () => {
      try {
        // Testear los tres pares en paralelo sin tocar la DB
        const [eur, usdt, btc] = await Promise.all([
          portfolioApi.testPair(`${sym}EUR`),
          portfolioApi.testPair(`${sym}USDT`),
          portfolioApi.testPair(`${sym}BTC`),
        ])

        const eurVal  = eur.exists  ? `${sym}EUR`  : ''
        const usdtVal = usdt.exists ? `${sym}USDT` : ''
        const btcVal  = btc.exists  ? `${sym}BTC`  : ''

        if (eur.exists || usdt.exists || btc.exists) {
          setEurPair(eurVal)
          setUsdtPair(usdtVal)
          setBtcPair(btcVal)
          setStatus('found')
        } else {
          setStatus('notfound')
        }
      } catch {
        setStatus('notfound')
      }
    }, 600)

    return () => clearTimeout(debounceRef.current)
  }, [symbol])

  async function handleSave() {
    if (!symbol) return
    setSaving(true)
    await portfolioApi.createAsset({
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      binance_eur_pair:  eurPair  || null,
      binance_usdt_pair: usdtPair || null,
      binance_btc_pair:  btcPair  || null,
      is_stablecoin:     isStable,
    } as Partial<AssetMetadata>)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Añadir nuevo activo</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Símbolo con auto-detect */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Símbolo *</label>
          <div className="relative">
            <input
              autoFocus
              value={symbol}
              onChange={e => { setSymbol(e.target.value.toUpperCase()); setEurPair(''); setUsdtPair(''); setBtcPair('') }}
              placeholder="BTC, ETH, PEPE..."
              className={`${inputClass} pr-8`}
            />
            {status === 'detecting' && (
              <RefreshCw size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
            )}
            {status === 'found' && (
              <CheckCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-green" />
            )}
            {status === 'notfound' && (
              <AlertCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-amber" />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Pepe Coin" className={inputClass} />
        </div>
      </div>

      {/* Estado de la detección */}
      {status === 'found' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-green/8 border border-accent-green/20 text-xs text-accent-green">
          <CheckCircle size={12} />
          Encontrado en Binance — pares configurados automáticamente
        </div>
      )}
      {status === 'notfound' && (
        <div className="px-3 py-2.5 rounded-lg bg-accent-amber/8 border border-accent-amber/20 space-y-1">
          <div className="flex items-center gap-2 text-xs text-accent-amber">
            <AlertCircle size={12} />
            No encontrado en Binance
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Este símbolo no tiene par de precio en Binance. Puedes introducir los pares manualmente
            si cotiza en otro exchange, o marcarlo como stablecoin si no necesita precio de mercado.
          </p>
        </div>
      )}

      {/* Pares manuales */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'Par EUR',  val: eurPair,  set: setEurPair,  ph: `${symbol || '?'}EUR`  },
          { label: 'Par USDT', val: usdtPair, set: setUsdtPair, ph: `${symbol || '?'}USDT` },
          { label: 'Par BTC',  val: btcPair,  set: setBtcPair,  ph: `${symbol || '?'}BTC`  },
        ] as const).map(({ label, val, set, ph }) => (
          <div key={label} className="space-y-1">
            <label className="text-xs text-gray-500">{label}</label>
            <input
              value={val}
              onChange={e => set(e.target.value.toUpperCase())}
              placeholder={ph}
              className={inputClass}
            />
            {status === 'found' && !val && (
              <p className="flex items-center gap-1 text-xs text-accent-red/70">
                <XCircle size={10} />
                No existe en Binance
              </p>
            )}
          </div>
        ))}
      </div>

      <Toggle checked={isStable} onChange={setIsStable} label="Stablecoin o fiat (sin precio de mercado)" />

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!symbol || saving}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'Guardando...' : 'Añadir activo'}
        </button>
      </div>
    </div>
  )
}

// ── FiscalSection ──────────────────────────────────────────────────────────
function FiscalSection() {
  const { data: config = {} } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()

  const threshold = parseInt(config['modelo721_threshold'] ?? '50000')
  const [thresholdInput, setThresholdInput] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)

  useEffect(() => {
    setThresholdInput(String(threshold))
  }, [threshold])

  async function saveThreshold() {
    setSavingThreshold(true)
    await portfolioApi.setConfig('modelo721_threshold', thresholdInput)
    queryClient.invalidateQueries({ queryKey: ['config'] })
    setSavingThreshold(false)
  }

  const inputClass = "bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"

  const METHODS = [
    { id: 'fifo', label: 'FIFO', desc: 'First In, First Out', available: true },
    { id: 'lifo', label: 'LIFO', desc: 'Last In, First Out',  available: false },
    { id: 'pmp',  label: 'Precio Medio',  desc: 'Precio medio ponderado', available: false },
  ]

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Método de cálculo */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Método de cálculo de plusvalías</h3>
          <p className="text-xs text-gray-500 mt-1">
            Determina qué lotes se consumen primero al vender. La normativa española obliga al uso de FIFO.
          </p>
        </div>
        <div className="flex gap-2">
          {METHODS.map(m => (
            <div
              key={m.id}
              className={`relative flex-1 px-4 py-3 rounded-xl border transition-all ${
                m.id === 'fifo'
                  ? 'border-accent-blue bg-accent-blue/8'
                  : 'border-border bg-background-tertiary opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${m.id === 'fifo' ? 'text-accent-blue' : 'text-gray-400'}`}>
                  {m.label}
                </span>
                {m.id === 'fifo'
                  ? <Check size={14} className="text-accent-blue" />
                  : <span className="text-xs text-gray-600 bg-background-secondary px-1.5 py-0.5 rounded">Próximamente</span>
                }
              </div>
              <p className="text-xs text-gray-500 mt-1">{m.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          FIFO es el único método soportado actualmente y el exigido por la AEAT para criptoactivos.
        </p>
      </div>

      {/* Umbral Modelo 721 */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Umbral Modelo 721</h3>
          <p className="text-xs text-gray-500 mt-1">
            Importe a partir del cual existe obligación de presentar el Modelo 721 (criptoactivos en exchanges extranjeros).
          </p>
        </div>
        {/* Presets rápidos */}
        <div className="flex items-center gap-2">
          {[25000, 50000, 100000].map(preset => (
            <button
              key={preset}
              onClick={() => setThresholdInput(String(preset))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                thresholdInput === String(preset)
                  ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                  : 'border-border bg-background-tertiary text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              €{preset.toLocaleString('es-ES')}
            </button>
          ))}
          <span className="text-xs text-gray-600 ml-1">o introduce un valor personalizado:</span>
        </div>

        {/* Input + guardar */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0 bg-background-tertiary border border-border rounded-lg overflow-hidden focus-within:border-accent-blue transition-colors">
            <span className="px-3 py-2.5 text-sm text-gray-500 border-r border-border bg-background-secondary">€</span>
            <input
              type="text"
              inputMode="numeric"
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="px-3 py-2.5 text-sm mono bg-transparent text-white w-32 focus:outline-none"
              placeholder="50000"
            />
          </div>
          <button
            onClick={saveThreshold}
            disabled={savingThreshold || thresholdInput === String(threshold) || !thresholdInput}
            className="px-4 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
          >
            {savingThreshold ? 'Guardando...' : 'Guardar'}
          </button>
          {thresholdInput === String(threshold) && threshold > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-accent-green">
              <Check size={12} />
              Guardado: €{threshold.toLocaleString('es-ES')}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          El umbral legal vigente es €50.000. Modifícalo solo si la normativa cambia o tu asesor te lo indica.
        </p>
      </div>

      {/* País fiscal */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">País de residencia fiscal</h3>
          <p className="text-xs text-gray-500 mt-1">Determina la normativa aplicable y los formularios generados.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-accent-blue/40 bg-accent-blue/6">
            <span className="text-lg">🇪🇸</span>
            <div>
              <p className="text-sm font-medium">España</p>
              <p className="text-xs text-gray-500">IRPF · Modelo 100 · Modelo 721</p>
            </div>
            <Check size={14} className="text-accent-blue ml-2" />
          </div>
          <span className="text-xs text-gray-600">Otros países: Próximamente</span>
        </div>
      </div>

      {/* Compensación de pérdidas */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3 opacity-60">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Compensación de pérdidas (carry-forward)</h3>
            <p className="text-xs text-gray-500 mt-1">
              Pérdidas no compensadas de ejercicios anteriores (hasta 4 años según la AEAT).
            </p>
          </div>
          <span className="text-xs text-gray-600 bg-background-tertiary border border-border px-2 py-1 rounded-lg">
            Próximamente
          </span>
        </div>
      </div>

    </div>
  )
}

// ── DatosSection ───────────────────────────────────────────────────────────
function DatosSection() {
  const queryClient = useQueryClient()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['settings-stats'],
    queryFn: portfolioApi.getStats,
    refetchInterval: 10000,
  })
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheResult, setCacheResult] = useState<number | null>(null)
  const [runningFifo, setRunningFifo] = useState(false)
  const [fifoResult, setFifoResult] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

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
    } finally {
      setRunningFifo(false)
    }
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

      {/* Acciones de mantenimiento */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Mantenimiento</h3>

        <div className="space-y-2">
          {/* Limpiar caché de precios */}
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Limpiar caché de precios</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Fuerza la reconsulta de precios históricos en la próxima ejecución del FIFO.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {cacheResult !== null && (
                <span className="text-xs text-accent-green">{cacheResult} entradas eliminadas</span>
              )}
              <button
                onClick={handleClearCache}
                disabled={clearingCache}
                className="flex items-center gap-2 px-4 py-2 bg-background-tertiary hover:bg-border border border-border rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {clearingCache ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Limpiar
              </button>
            </div>
          </div>

          {/* Re-ejecutar FIFO */}
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Re-ejecutar motor FIFO</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Recalcula todos los lotes y plusvalías desde cero. Necesario tras añadir transacciones manuales.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {fifoResult && (
                <span className={`text-xs ${fifoResult.startsWith('Error') ? 'text-accent-red' : 'text-accent-green'}`}>
                  {fifoResult}
                </span>
              )}
              <button
                onClick={handleRunFifo}
                disabled={runningFifo}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#6366f118', color: '#6366f1' }}
              >
                {runningFifo ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                Ejecutar
              </button>
            </div>
          </div>

          {/* Exportar datos — próximamente */}
          <div className="flex items-center justify-between py-3 opacity-50">
            <div>
              <p className="text-sm font-medium">Exportar datos</p>
              <p className="text-xs text-gray-500 mt-0.5">Backup completo en JSON de todas las transacciones y configuración.</p>
            </div>
            <span className="text-xs text-gray-600 bg-background-tertiary border border-border px-2 py-1 rounded-lg">
              Próximamente
            </span>
          </div>
        </div>
      </div>

      {/* Zona de peligro */}
      <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-5 space-y-3">
        <h3 className="font-semibold text-sm text-accent-red">Zona de peligro</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Eliminar todos los datos</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Borra transacciones, lotes FIFO, importaciones y caché de precios. Irreversible.
            </p>
          </div>
          <button
            onClick={() => setConfirmReset(true)}
            className="px-4 py-2 border border-accent-red/50 text-accent-red hover:bg-accent-red/10 rounded-lg text-sm font-medium transition-colors"
          >
            Eliminar todo
          </button>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Eliminar todos los datos"
          message="Esta acción borrará TODAS las transacciones, importaciones, lotes FIFO y caché de precios. La configuración de wallets y activos se mantiene. Esta acción es irreversible."
          confirmLabel="Sí, eliminar todo"
          danger
          onConfirm={async () => {
            await portfolioApi.resetAllData()
            queryClient.invalidateQueries()
            setConfirmReset(false)
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

    </div>
  )
}

// ── GeneralSection ─────────────────────────────────────────────────────────
function GeneralSection() {
  const OPTIONS_LANG  = [{ id: 'es', label: '🇪🇸 Español', available: true }, { id: 'en', label: '🇬🇧 English', available: false }]
  const OPTIONS_THEME = [{ id: 'dark', label: 'Oscuro', available: true }, { id: 'light', label: 'Claro', available: false }]
  const OPTIONS_DATE  = [{ id: 'dmy', label: 'DD/MM/AAAA', available: true }, { id: 'mdy', label: 'MM/DD/AAAA', available: false }]

  function OptionGroup({ label, desc, options, active }: {
    label: string; desc: string
    options: { id: string; label: string; available: boolean }[]
    active: string
  }) {
    return (
      <div className="flex items-center justify-between py-4 border-b border-border/50 last:border-0">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
        </div>
        <div className="flex gap-2">
          {options.map(opt => (
            <div
              key={opt.id}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                opt.id === active && opt.available
                  ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/40'
                  : opt.available
                    ? 'bg-background-tertiary text-gray-400 border border-border cursor-pointer hover:border-gray-500'
                    : 'bg-background-tertiary text-gray-600 border border-border opacity-50'
              }`}
            >
              {opt.label}
              {opt.id === active && opt.available && <Check size={11} />}
              {!opt.available && <span className="text-gray-700 ml-1">·</span>}
              {!opt.available && <span className="text-gray-700">Próximamente</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Preferencias */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-1">
        <h3 className="font-semibold text-sm mb-3">Preferencias</h3>
        <OptionGroup label="Idioma" desc="Idioma de la interfaz" options={OPTIONS_LANG}  active="es"   />
        <OptionGroup label="Tema"   desc="Apariencia de la app"  options={OPTIONS_THEME} active="dark" />
        <OptionGroup label="Formato de fecha" desc="Cómo se muestran las fechas" options={OPTIONS_DATE} active="dmy" />
      </div>

      {/* Información de la app */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Acerca de CryptoFolio</h3>
        <div className="space-y-2 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>Versión</span>
            <span className="mono text-gray-400">0.3.0-dev</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Método fiscal</span>
            <span className="mono text-gray-400">FIFO — Normativa española (AEAT)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Fuente de precios</span>
            <span className="mono text-gray-400">Binance API</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Base de datos</span>
            <span className="mono text-gray-400">PostgreSQL 16</span>
          </div>
        </div>
        <p className="text-xs text-gray-700 pt-2 border-t border-border">
          Esta herramienta genera información orientativa. Consulta siempre con un asesor fiscal antes de presentar tu declaración.
        </p>
      </div>

    </div>
  )
}
