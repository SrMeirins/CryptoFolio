import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, CheckCircle } from 'lucide-react'
import { portfolioApi, type Wallet } from '../api/portfolio'
import { useClickOutside } from '../hooks/useClickOutside'

const TYPE_LABEL: Record<string, string> = { exchange: 'Exchange', cold: 'Frío', hot: 'Caliente', other: 'Otro' }

// Mismo queryKey que WalletsSection.tsx (pages/settings/) — React Query
// cachea y deduplica entre ambos aunque cada uno tenga su propio tipo hoy.
export function useWalletsQuery() {
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWallets })
  return wallets
}

/** Resuelve un id de wallet a su nombre, reutilizando la misma caché que WalletPicker. */
export function WalletLabel({ walletId }: { walletId: string }) {
  const wallets = useWalletsQuery()
  return <>{wallets.find(w => w.id === walletId)?.name ?? walletId}</>
}

/** Selector de wallet con color y tipo, dropdown con click-fuera. */
export function WalletPicker({ wallets, value, onChange }: {
  wallets: Wallet[]; value: string; onChange: (val: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = wallets.find(w => w.id === value)

  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm hover:border-accent-blue/50 transition-colors text-left"
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="text-white truncate">{selected.name}</span>
            <span className="text-xs text-gray-600 shrink-0">{TYPE_LABEL[selected.type] ?? selected.type}</span>
          </div>
        ) : (
          <span className="text-gray-600">Seleccionar wallet...</span>
        )}
        <ChevronDown size={13} className={`text-gray-500 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background-card border border-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {wallets.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">Sin wallets configuradas</div>
          ) : (
            wallets.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => { onChange(w.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-background-tertiary transition-colors text-left ${w.id === value ? 'bg-background-tertiary' : ''}`}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="text-sm text-gray-200 flex-1">{w.name}</span>
                <span className="text-[10px] text-gray-600">{TYPE_LABEL[w.type] ?? w.type}</span>
                {w.id === value && <CheckCircle size={11} className="text-accent-green shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
