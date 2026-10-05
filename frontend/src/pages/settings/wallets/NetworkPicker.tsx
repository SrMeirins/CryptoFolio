import { useState } from 'react'
import { Search, Check, X, Plus } from 'lucide-react'
import type { Network } from '../../../api/portfolio'
import { OTHER_NETWORK } from './helpers'

export function NetworkPicker({ networks, value, onChange }: {
  networks: Network[]
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
          ? <button type="button" onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-300"><X size={13} /></button>
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
