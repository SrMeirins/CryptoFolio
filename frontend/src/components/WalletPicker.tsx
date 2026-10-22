import { useRef, useState } from 'react'
import { ChevronDown, CheckCircle } from 'lucide-react'
import { type Wallet } from '../api/portfolio'
import { useClickOutside } from '../hooks/useClickOutside'
import { useWalletsQuery } from '../hooks/useWallets'
import { cardClasses, buttonClasses } from './ui'

const TYPE_LABEL: Record<string, string> = { exchange: 'Exchange', cold: 'Frío', hot: 'Caliente', other: 'Otro' }

/** Resuelve un id de wallet a su nombre, reutilizando la misma caché que WalletPicker. */
export function WalletLabel({ walletId }: { walletId: string }) {
  const wallets = useWalletsQuery()
  return <>{wallets.find(w => w.id === walletId)?.name ?? walletId}</>
}

/** Selector de wallet con color y tipo, dropdown con click-fuera. */
export function WalletPicker({ wallets, value, onChange, id, label }: {
  wallets: Wallet[]; value: string; onChange: (val: unknown) => void
  /** id del disparador y nombre del campo, para la etiqueta que lo acompaña (#378). */
  id?: string; label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = wallets.find(w => w.id === value)

  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label ? `${label}: ${selected?.name ?? 'sin seleccionar'}` : undefined}
        className={buttonClasses('secondary', 'md', 'w-full flex justify-between text-left')}
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="text-fg truncate">{selected.name}</span>
            <span className="text-xs text-fg-subtle shrink-0">{TYPE_LABEL[selected.type] ?? selected.type}</span>
          </div>
        ) : (
          <span className="text-fg-subtle">Seleccionar wallet...</span>
        )}
        <ChevronDown size={13} className={`text-fg-subtle shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={cardClasses('none', 'absolute z-50 top-full mt-1 left-0 right-0 shadow-xl overflow-hidden max-h-52 overflow-y-auto')}>
          {wallets.length === 0 ? (
            <div className="px-4 py-3 text-xs text-fg-subtle">Sin wallets configuradas</div>
          ) : (
            wallets.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => { onChange(w.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-background-tertiary transition-colors text-left ${w.id === value ? 'bg-background-tertiary' : ''}`}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                <span className="text-sm text-fg flex-1">{w.name}</span>
                <span className="text-xs text-fg-subtle">{TYPE_LABEL[w.type] ?? w.type}</span>
                {w.id === value && <CheckCircle size={11} className="text-positive shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
