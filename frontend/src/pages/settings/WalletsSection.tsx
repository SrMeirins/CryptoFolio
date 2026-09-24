import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import {
  Plus, Search, Check, X, ExternalLink, Trash2,
  ChevronDown, Building2, Shield, Smartphone, Landmark, Copy, RefreshCw,
} from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'

interface SyncDetail {
  asset: string
  onchain_balance: number | null
  expected_balance: number
  checked_at: string
  status: 'ok' | 'discrepancy' | 'error'
}

interface AddressData {
  id: string
  network_name: string | null
  network_native_asset: string | null
  custom_network: string | null
  address: string | null
  explorer_url: string | null
  sync_status: 'ok' | 'discrepancy' | 'error' | 'pending'
  sync_details: SyncDetail[]
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

const OTHER_NETWORK = '__other__'

const COLORS = ['#6366f1', '#00c896', '#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#1abc9c', '#e67e22']

const WALLET_TYPE_META: Record<string, { icon: typeof Shield; label: string }> = {
  hardware:  { icon: Shield,    label: 'Hardware' },
  software:  { icon: Smartphone,label: 'Software' },
  exchange:  { icon: Building2, label: 'Exchange' },
  bank:      { icon: Landmark,  label: 'Banco / Fiat' },
  custodial: { icon: Building2, label: 'Custodial' },
}

function truncateAddress(addr: string) {
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="p-1 text-gray-700 hover:text-gray-400 transition-colors"
    >
      {copied ? <Check size={11} className="text-accent-green" /> : <Copy size={11} />}
    </button>
  )
}

const SYNC_BADGE: Record<AddressData['sync_status'], { label: string; className: string }> = {
  ok:          { label: 'Verificado', className: 'bg-accent-green/15 text-accent-green' },
  discrepancy: { label: 'Revisar',    className: 'bg-accent-amber/15 text-accent-amber' },
  error:       { label: 'Sin conexión', className: 'bg-accent-red/15 text-accent-red' },
  pending:     { label: 'Pendiente',  className: 'bg-gray-700/30 text-gray-500' },
}

function SyncBadge({ addr, onSync, syncing }: { addr: AddressData; onSync: () => void; syncing: boolean }) {
  const [showDetail, setShowDetail] = useState(false)
  const meta = SYNC_BADGE[addr.sync_status]

  return (
    <div className="relative flex items-center gap-1">
      <button onClick={() => setShowDetail(v => !v)}
        className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${meta.className}`}>
        {meta.label}
      </button>
      <button onClick={onSync} disabled={syncing}
        title="Verificar ahora"
        className="p-1 text-gray-600 hover:text-accent-blue disabled:opacity-40 transition-colors">
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
      </button>
      {showDetail && addr.sync_details.length > 0 && (
        <div className="absolute top-6 left-0 z-10 w-64 rounded-lg border border-border bg-background-card p-2.5 shadow-lg space-y-1">
          {addr.sync_details.map(d => (
            <p key={d.asset} className="text-[11px] text-gray-400">
              <span className="font-medium text-gray-300">{d.asset}</span> — Real: {d.onchain_balance ?? '—'} · App: {d.expected_balance}
              {d.status === 'discrepancy' && d.onchain_balance !== null && (
                <span className="text-accent-amber"> · Diferencia: {(d.onchain_balance - d.expected_balance).toFixed(6)}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

const NETWORKS_REQUIRING_KEY = ['Ethereum', 'Cardano', 'Polkadot Asset Hub']

function NetworkApiKeyField({ networkId, networkName }: { networkId: string; networkName: string }) {
  const [status, setStatus] = useState<{ has_key: boolean } | null>(null)
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    portfolioApi.getNetworkApiKeyStatus(networkId).then(setStatus)
  }, [networkId])

  if (!NETWORKS_REQUIRING_KEY.includes(networkName)) return null

  async function handleSave() {
    if (!value) return
    setSaving(true)
    try {
      await portfolioApi.setNetworkApiKey(networkId, value)
      setStatus({ has_key: true })
      setValue('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1 pt-1">
      <label className="text-xs text-gray-500">
        API key de verificación on-chain (opcional)
        {status?.has_key && <span className="ml-1.5 text-accent-green">Configurada ✓</span>}
      </label>
      <div className="flex gap-1.5">
        <input type="password" value={value} onChange={e => setValue(e.target.value)}
          placeholder={status?.has_key ? 'Ya configurada — pega una nueva para reemplazarla' : 'Sin esta clave, esta red no se puede verificar automáticamente'}
          className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-xs placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
        <button onClick={handleSave} disabled={!value || saving}
          className="px-3 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
          Guardar
        </button>
      </div>
    </div>
  )
}

function getAddressPlaceholder(network: NetworkData | undefined): string {
  if (!network) return 'Pega tu dirección pública...'
  const asset = network.native_asset.toUpperCase()
  const name  = network.name.toLowerCase()
  if (['ETH','BNB','MATIC','POL','CRO','AVAX','FTM','ETC'].includes(asset) ||
      name.includes('arbitrum') || name.includes('optimism') || name.includes('base'))
    return '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  if (asset === 'BTC') return 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
  if (asset === 'XRP') return 'rN7n34b4RM8FAFGbFZapWrdMJB1qVHbXLe'
  if (asset === 'SOL') return '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
  if (asset === 'ADA') return 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer...'
  if (asset === 'DOT' || asset === 'KSM') return '1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg'
  if (asset === 'ATOM') return 'cosmos1yw6g44c4pqd2rxgrcqekxg9k8f4fd8xpab7ase'
  if (asset === 'XLM') return 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV5UOIQJOHNHKN'
  return 'Pega tu dirección pública...'
}

// ── NetworkPicker ──────────────────────────────────────────────────────────
function NetworkPicker({ networks, value, onChange }: {
  networks: NetworkData[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen]     = useState(true)
  const [search, setSearch] = useState('')

  const filtered      = networks.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.native_asset.toLowerCase().includes(search.toLowerCase())
  )
  const selectedNetwork = networks.find(n => n.id === value)
  const isCustom  = value === OTHER_NETWORK
  const hasSelection = !!value

  function select(id: string) { onChange(id); setSearch(''); setOpen(false) }

  if (hasSelection && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-accent-blue/40 bg-accent-blue/6 hover:bg-accent-blue/10 transition-colors text-left group">
        <Check size={15} className="text-accent-green shrink-0" />
        {isCustom
          ? <span className="flex-1 text-sm font-medium text-white">Añadir manualmente</span>
          : <>
              <span className="flex-1 text-sm font-medium text-white">{selectedNetwork?.name}</span>
              <span className="text-xs mono px-2 py-0.5 rounded-md bg-accent-blue/15 text-accent-blue">{selectedNetwork?.native_asset}</span>
            </>
        }
        <span className="text-xs text-gray-600 group-hover:text-gray-400">Cambiar</span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-background-secondary overflow-hidden shadow-lg">
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
        <Search size={14} className="text-gray-500 shrink-0" />
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Bitcoin, ETH, Solana..."
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none" />
        {search
          ? <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-300"><X size={13} /></button>
          : <span className="text-xs text-gray-700">{networks.length} redes</span>
        }
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0
          ? <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Search size={16} className="text-gray-700" />
              <p className="text-xs text-gray-600">Sin resultados para <span className="text-gray-400">"{search}"</span></p>
            </div>
          : filtered.map(n => {
              const isSelected = value === n.id
              return (
                <button key={n.id} type="button" onClick={() => select(n.id)}
                  className={`group w-full flex items-center gap-3 px-3.5 py-2.5 transition-all text-left border-l-2 ${
                    isSelected ? 'border-accent-blue bg-accent-blue/8' : 'border-transparent hover:border-border hover:bg-white/4'
                  }`}>
                  <span className={`flex-1 text-sm ${isSelected ? 'text-white font-medium' : 'text-gray-300 group-hover:text-white'}`}>{n.name}</span>
                  <span className={`text-xs mono px-2 py-0.5 rounded-md ${isSelected ? 'bg-accent-blue/20 text-accent-blue' : 'bg-background-tertiary text-gray-500'}`}>
                    {n.native_asset}
                  </span>
                  {isSelected && <Check size={13} className="text-accent-blue shrink-0" />}
                </button>
              )
            })
        }
      </div>
      <div className="p-2 border-t border-border bg-background-tertiary/40">
        <button type="button" onClick={() => select(OTHER_NETWORK)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
            isCustom ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
                     : 'border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 hover:bg-white/4'
          }`}>
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${isCustom ? 'border-accent-blue text-accent-blue' : 'border-gray-600 text-gray-600'}`}>
            <Plus size={11} />
          </div>
          <div>
            <p className={`text-xs font-semibold ${isCustom ? 'text-accent-blue' : ''}`}>Añadir manualmente</p>
            <p className="text-xs text-gray-600">La red no está en la lista</p>
          </div>
          {isCustom && <Check size={13} className="ml-auto text-accent-blue shrink-0" />}
        </button>
      </div>
    </div>
  )
}

// ── AddAddressForm ─────────────────────────────────────────────────────────
function AddAddressForm({ networks, onSave, onCancel }: {
  networks: NetworkData[]
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [selected, setSelected]               = useState('')
  const [customName, setCustomName]           = useState('')
  const [customExplorerUrl, setCustomExplorerUrl] = useState('')
  const [address, setAddress]                 = useState('')

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"
  const isCustom   = selected === OTHER_NETWORK
  const selectedNetwork  = networks.find(n => n.id === selected)
  const explorerHref     = selectedNetwork?.explorer_url && address
    ? selectedNetwork.explorer_url.replace('{address}', address) : null
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
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Red *</label>
        <NetworkPicker networks={networks} value={selected}
          onChange={id => { setSelected(id); setCustomName(''); setCustomExplorerUrl('') }} />
        {explorerHref && (
          <a href={explorerHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue/80 pt-1">
            <ExternalLink size={11} /> Verificar en el explorador
          </a>
        )}
        {!isCustom && selected && <NetworkApiKeyField networkId={selected} networkName={selectedNetwork?.name ?? ''} />}
      </div>
      {isCustom && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Nombre de la red *</label>
            <input autoFocus value={customName} onChange={e => setCustomName(e.target.value)}
              placeholder="Ej: Stacks, Kaspa..." className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">URL del explorador (opcional)</label>
            <input value={customExplorerUrl} onChange={e => setCustomExplorerUrl(e.target.value)}
              placeholder="https://explorer.ejemplo.com/address/{address}" className={inputClass} />
          </div>
        </>
      )}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Dirección pública (opcional)</label>
        <input value={address} onChange={e => setAddress(e.target.value)}
          placeholder={getAddressPlaceholder(selectedNetwork)}
          className={`${inputClass} font-mono text-xs`} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={handleSave} disabled={!canSave}
          className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
          Añadir red
        </button>
      </div>
    </div>
  )
}

// ── AddWalletForm ──────────────────────────────────────────────────────────
function AddWalletForm({ onSave, onCancel }: {
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName]   = useState('')
  const [type, setType]   = useState('hardware')
  const [color, setColor] = useState('#6366f1')
  const [notes, setNotes] = useState('')

  const inputClass = "w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue"

  return (
    <div className="card space-y-4">
      <h3 className="font-medium text-sm">Nueva wallet</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Mi Tangem, Ledger Nano..." className={inputClass} autoFocus />
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
            <button key={c} onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : ''}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Notas (opcional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Tangem Card modelo 2..." className={inputClass} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button onClick={() => onSave({ name, type, color, notes: notes || null })} disabled={!name}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
          Crear wallet
        </button>
      </div>
    </div>
  )
}

// ── WalletsSection ─────────────────────────────────────────────────────────
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

  const { data: wallets = [] } = useQuery<WalletData[]>({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })
  const { data: networks = [] } = useQuery<NetworkData[]>({
    queryKey: ['networks'],
    queryFn: () => fetch('/api/wallets/networks').then(r => r.json()),
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
        <button onClick={() => setShowAdd(true)}
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
          <button onClick={() => setShowAdd(true)} className="text-xs text-accent-blue hover:underline">Crear primera wallet</button>
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
                      <div className="flex gap-1.5">
                        {COLORS.map(c => (
                          <button key={c} onClick={() => setEditColor(c)}
                            className={`w-5 h-5 rounded-full transition-transform ${editColor === c ? 'scale-125 ring-1 ring-white' : ''}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
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
                        <button onClick={() => handleSaveWallet(wallet.id)}
                          className="p-1.5 text-accent-green hover:bg-accent-green/10 rounded-lg transition-colors"><Check size={13} /></button>
                        <button onClick={() => setEditingWalletId(null)}
                          className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors"><X size={13} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingWalletId(wallet.id); setEditName(wallet.name); setEditColor(wallet.color) }}
                          className="p-1.5 text-gray-600 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors text-xs">
                          Editar
                        </button>
                        <button onClick={() => setConfirmDeleteId(wallet.id)}
                          className="p-1.5 text-gray-700 hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    <button onClick={() => toggleNets(wallet.id)}
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
                              <button onClick={() => handleSaveAddress(wallet.id, addr.id)}
                                className="p-1 text-accent-green hover:bg-accent-green/10 rounded"><Check size={11} /></button>
                              <button onClick={() => setEditingAddressId(null)}
                                className="p-1 text-gray-600 hover:text-white rounded"><X size={11} /></button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-1 min-w-0">
                              {addr.address
                                ? <>
                                    <span className="text-xs mono text-gray-500 truncate">{truncateAddress(addr.address)}</span>
                                    <CopyButton text={addr.address} />
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
                              <button onClick={() => { setEditingAddressId(addr.id); setEditingAddressValue(addr.address ?? '') }}
                                className="p-1 text-gray-600 hover:text-white text-[10px] rounded transition-colors">Editar</button>
                              <button onClick={() => handleDeleteAddress(wallet.id, addr.id)}
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
                      <button onClick={() => setShowAddAddress(wallet.id)}
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
