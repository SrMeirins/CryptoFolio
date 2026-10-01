import { Zap } from 'lucide-react'
import { type FieldDefinition } from '../api/portfolio'
import { WalletPicker } from './WalletPicker'
import { useWalletsQuery } from '../hooks/useWallets'

const baseInput = 'w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors'

/** Renderiza el input adecuado (número, texto, fecha, wallet, select...) según `field.type`. */
export function DynamicField({ field, value, onChange }: {
  field: FieldDefinition; value: unknown; onChange: (val: unknown) => void
}) {
  const wallets = useWalletsQuery()

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        {field.label}
        {field.required
          ? <span className="text-accent-red text-[10px]">requerido</span>
          : field.auto
          ? <span className="flex items-center gap-0.5 text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded text-[10px]">
              <Zap size={8} /> auto
            </span>
          : <span className="text-gray-700 text-[10px]">opcional</span>
        }
      </label>

      {field.type === 'number' && (
        <input
          type="number" step="any"
          placeholder={field.placeholder ?? '0'}
          value={(value as number) ?? ''}
          onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
          className={baseInput}
        />
      )}

      {field.type === 'text' && (
        <input
          type="text"
          placeholder={field.placeholder ?? ''}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        />
      )}

      {field.type === 'datetime' && (
        <input
          type="datetime-local"
          value={value ? new Date(value as string).toISOString().slice(0, 16) : ''}
          onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
          className={`${baseInput} [color-scheme:dark]`}
        />
      )}

      {field.type === 'asset' && (
        <input
          type="text"
          placeholder={field.placeholder ?? 'BTC, ETH, XRP...'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className={`${baseInput} font-mono uppercase tracking-wider`}
        />
      )}

      {field.type === 'wallet' && (
        <WalletPicker wallets={wallets} value={value as string} onChange={onChange} />
      )}

      {field.type === 'select' && field.options && (
        <select
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">Seleccionar...</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field.hint && <p className="text-[11px] text-gray-600 leading-tight">{field.hint}</p>}
    </div>
  )
}
