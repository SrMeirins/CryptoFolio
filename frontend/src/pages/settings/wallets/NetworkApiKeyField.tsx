import { useState, useEffect } from 'react'
import { portfolioApi } from '../../../api/portfolio'
import { NETWORKS_REQUIRING_KEY } from './helpers'

export function NetworkApiKeyField({ networkId, networkName }: { networkId: string; networkName: string }) {
  const [status, setStatus] = useState<{ has_key: boolean } | null>(null)
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)

  const requiresKey = NETWORKS_REQUIRING_KEY.includes(networkName)

  useEffect(() => {
    // Antes esta petición se disparaba para CUALQUIER red seleccionada —
    // el guard de abajo (que evita renderizar el campo) corre después de
    // los hooks, así que la llamada a la API ya se había hecho aunque el
    // componente no mostrara nada. Guardamos aquí para no pedir el estado
    // de una clave que esta red ni siquiera necesita.
    if (!requiresKey) return
    portfolioApi.getNetworkApiKeyStatus(networkId).then(setStatus)
  }, [networkId, requiresKey])

  if (!requiresKey) return null

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
        <button type="button" onClick={handleSave} disabled={!value || saving}
          className="px-3 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
          Guardar
        </button>
      </div>
    </div>
  )
}
