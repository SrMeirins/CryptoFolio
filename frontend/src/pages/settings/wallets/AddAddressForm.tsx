import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Network } from '../../../api/portfolio'
import { OTHER_NETWORK, getAddressPlaceholder, inputClass } from './helpers'
import { NetworkPicker } from './NetworkPicker'
import { NetworkApiKeyField } from './NetworkApiKeyField'

export function AddAddressForm({ networks, onSave, onCancel }: {
  networks: Network[]
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [selected, setSelected]               = useState('')
  const [customName, setCustomName]           = useState('')
  const [customExplorerUrl, setCustomExplorerUrl] = useState('')
  const [address, setAddress]                 = useState('')

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
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button type="button" onClick={handleSave} disabled={!canSave}
          className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
          Añadir red
        </button>
      </div>
    </div>
  )
}
