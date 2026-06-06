import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export const SPECIAL_DESTINATIONS = [
  {
    id: '__external__',
    icon: '📱',
    label: 'Mi wallet no registrada',
    desc: 'MetaMask, Phantom, Trust Wallet... El activo sigue siendo tuyo.',
    color: '#6b7280',
  },
  {
    id: '__gift__',
    icon: '🎁',
    label: 'Regalo o pago a tercero',
    desc: 'Transmisión patrimonial al precio de mercado del día.',
    color: '#6366f1',
  },
  {
    id: '__lost__',
    icon: '💀',
    label: 'Pérdida de acceso',
    desc: 'Keys perdidas, hack... Pérdida patrimonial registrada en el FIFO.',
    color: '#e74c3c',
  },
]

export function WithdrawalSelector({ value, coldWallets, onChange }: {
  value: string
  coldWallets: { id: string; name: string; color: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const special = SPECIAL_DESTINATIONS.find(s => s.id === value)
  const wallet  = coldWallets.find(w => w.id === value)

  function select(v: string) { onChange(v); setOpen(false) }

  const trigger = special ? (
    <span className="flex items-center gap-2">
      <span>{special.icon}</span>
      <span className="font-medium" style={{ color: special.color }}>{special.label}</span>
    </span>
  ) : wallet ? (
    <span className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: wallet.color }} />
      <span className="font-medium text-accent-green">{wallet.name}</span>
    </span>
  ) : (
    <span className="text-gray-500 text-xs">— Sin asignar (requerido) —</span>
  )

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all text-left min-w-40 ${
          open
            ? 'border-accent-blue bg-background-tertiary'
            : value
              ? special?.id === '__lost__'
                ? 'border-accent-red/40 bg-accent-red/8'
                : special?.id === '__gift__'
                  ? 'border-accent-blue/40 bg-accent-blue/8'
                  : special?.id === '__external__'
                    ? 'border-gray-600/40 bg-gray-600/8'
                    : 'border-accent-green/40 bg-accent-green/8'
              : 'border-border bg-background-secondary hover:border-gray-600'
        }`}
      >
        <span className="flex-1">{trigger}</span>
        <ChevronDown size={11} className={`text-gray-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-border bg-background-card shadow-2xl z-50 overflow-hidden">
          {coldWallets.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mis wallets</p>
              {coldWallets.map(w => (
                <button
                  key={w.id}
                  onClick={() => select(w.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background-tertiary ${
                    value === w.id ? 'bg-accent-green/8' : ''
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className={`text-sm font-medium ${value === w.id ? 'text-accent-green' : 'text-white'}`}>
                    {w.name}
                  </span>
                  {value === w.id && <Check size={13} className="ml-auto text-accent-green shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <div className={coldWallets.length > 0 ? 'border-t border-border' : ''}>
            <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Otros destinos</p>
            {SPECIAL_DESTINATIONS.map(s => (
              <button
                key={s.id}
                onClick={() => select(s.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background-tertiary ${
                  value === s.id ? 'bg-background-tertiary' : ''
                }`}
              >
                <span className="text-base mt-0.5 shrink-0">{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: value === s.id ? s.color : 'white' }}>{s.label}</p>
                  <p className="text-xs text-gray-500 leading-tight mt-0.5">{s.desc}</p>
                </div>
                {value === s.id && <Check size={13} className="ml-auto mt-1 shrink-0" style={{ color: s.color }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
