import { useState, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { SPECIAL_DESTINATIONS } from './specialDestinations'
import { T } from '../../utils/colors'

const SPECIAL_TRIGGER_CLASS: Record<string, string> = {
  __lost__: 'border-negative/40 bg-negative/8',
  __gift__: 'border-brand/40 bg-brand/8',
  __external__: 'border-border/40 bg-overlay/5',
}

export function WithdrawalSelector({ value, coldWallets, onChange }: {
  value: string
  coldWallets: { id: string; name: string; color: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false), open)

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
      <span className="font-medium text-positive">{wallet.name}</span>
    </span>
  ) : (
    <span className="text-fg-subtle text-xs">— Sin asignar (requerido) —</span>
  )

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all text-left min-w-40 ${
          open
            ? 'border-brand bg-background-tertiary'
            : value
              ? SPECIAL_TRIGGER_CLASS[value] ?? 'border-positive/40 bg-positive/8'
              : 'border-border bg-background-secondary hover:border-border'
        }`}
      >
        <span className="flex-1">{trigger}</span>
        <ChevronDown size={11} className={`text-fg-subtle transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-border bg-background-card shadow-2xl z-50 overflow-hidden">
          {coldWallets.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-fg-subtle uppercase tracking-wider">Mis wallets</p>
              {coldWallets.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => select(w.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background-tertiary ${
                    value === w.id ? 'bg-positive/8' : ''
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className={`text-sm font-medium ${value === w.id ? 'text-positive' : 'text-fg'}`}>
                    {w.name}
                  </span>
                  {value === w.id && <Check size={13} className="ml-auto text-positive shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <div className={coldWallets.length > 0 ? 'border-t border-border' : ''}>
            <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-fg-subtle uppercase tracking-wider">Otros destinos</p>
            {SPECIAL_DESTINATIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-background-tertiary ${
                  value === s.id ? 'bg-background-tertiary' : ''
                }`}
              >
                <span className="text-base mt-0.5 shrink-0">{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: value === s.id ? s.color : T.fg }}>{s.label}</p>
                  <p className="text-xs text-fg-subtle leading-tight mt-0.5">{s.desc}</p>
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
