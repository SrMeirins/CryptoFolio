import { useId } from 'react'
import { Zap } from 'lucide-react'
import { type FieldDefinition } from '../api/portfolio'
import { WalletPicker } from './WalletPicker'
import { useWalletsQuery } from '../hooks/useWallets'
import { fieldClasses, Dropdown } from './ui'
import { getAppTimezone } from '../constants/timezone'
import { fromZonedInput, toZonedInput } from '../utils/zonedDateTime'

const baseInput = fieldClasses()

/** Renderiza el input adecuado (número, texto, fecha, wallet, select...) según `field.type`. */
export function DynamicField({ field, value, onChange }: {
  field: FieldDefinition; value: unknown; onChange: (val: unknown) => void
}) {
  const wallets = useWalletsQuery()
  // Etiqueta asociada a su campo (#378): antes no lo estaba y el lector de
  // pantalla anunciaba campos sin nombre.
  const id = useId()

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        {field.label}
        {field.required
          ? <span className="text-negative text-xs">requerido</span>
          : field.auto
          ? <span className="flex items-center gap-0.5 text-brand-ink bg-brand/10 px-1.5 py-0.5 rounded-lg text-xs">
              <Zap size={8} aria-hidden="true" /> auto
            </span>
          : <span className="text-fg-subtle text-xs">opcional</span>
        }
      </label>

      {field.type === 'number' && (
        <input
          id={id}
          type="number" step="any"
          placeholder={field.placeholder ?? '0'}
          value={(value as number) ?? ''}
          onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
          className={baseInput}
        />
      )}

      {field.type === 'text' && (
        <input
          id={id}
          type="text"
          placeholder={field.placeholder ?? ''}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInput}
        />
      )}

      {field.type === 'datetime' && (
        // Hora local de la app, no UTC ni la del navegador; con segundos (#378).
        <input
          id={id}
          type="datetime-local"
          step={1}
          value={value ? toZonedInput(value as string, getAppTimezone()) : ''}
          onChange={e => onChange(e.target.value ? fromZonedInput(e.target.value, getAppTimezone()) : '')}
          className={`${baseInput} scheme-dark`}
        />
      )}

      {field.type === 'asset' && (
        <input
          id={id}
          type="text"
          placeholder={field.placeholder ?? 'BTC, ETH, XRP...'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className={`${baseInput} mono uppercase tracking-wider`}
        />
      )}

      {field.type === 'wallet' && (
        <WalletPicker id={id} label={field.label} wallets={wallets} value={value as string} onChange={onChange} />
      )}

      {field.type === 'select' && field.options && (
        <Dropdown id={id} label={field.label} value={(value as string) ?? ''} onChange={onChange} className="w-full"
          options={[{ value: '', label: 'Seleccionar...' }, ...field.options.map(opt => ({ value: opt.value, label: opt.label }))]} />
      )}

      {field.hint && <p className="text-xs text-fg-subtle leading-tight">{field.hint}</p>}
    </div>
  )
}
