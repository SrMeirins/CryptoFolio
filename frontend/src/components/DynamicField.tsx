import { Zap } from 'lucide-react'
import { type FieldDefinition } from '../api/portfolio'
import { WalletPicker } from './WalletPicker'
import { useWalletsQuery } from '../hooks/useWallets'
import { fieldClasses } from './ui'

const baseInput = fieldClasses()

/** Renderiza el input adecuado (número, texto, fecha, wallet, select...) según `field.type`. */
export function DynamicField({ field, value, onChange }: {
  field: FieldDefinition; value: unknown; onChange: (val: unknown) => void
}) {
  const wallets = useWalletsQuery()

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        {field.label}
        {field.required
          ? <span className="text-negative text-xs">requerido</span>
          : field.auto
          ? <span className="flex items-center gap-0.5 text-brand bg-brand/10 px-1.5 py-0.5 rounded-lg text-xs">
              <Zap size={8} /> auto
            </span>
          : <span className="text-fg-subtle text-xs">opcional</span>
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
          className={`${baseInput} scheme-dark`}
        />
      )}

      {field.type === 'asset' && (
        <input
          type="text"
          placeholder={field.placeholder ?? 'BTC, ETH, XRP...'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className={`${baseInput} mono uppercase tracking-wider`}
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

      {field.hint && <p className="text-xs text-fg-subtle leading-tight">{field.hint}</p>}
    </div>
  )
}
