import { useEffect, useId, useState } from 'react'
import { fieldClasses } from '../../components/ui'
import { cleanAmount } from './urlState'

// Rango de importe del Historial (#366), en la moneda de visualización. Cada
// campo se aplica 250 ms después de dejar de teclear (o al salir de él); un
// valor no válido se marca y no se aplica.

function AmountField({ label, value, onCommit, symbol }: {
  label: string; value: string; onCommit: (v: string) => void; symbol: string
}) {
  const id = useId()
  const [text, setText] = useState(value)
  // Si el valor cambia desde fuera (chip, limpiar, URL), el campo lo refleja:
  // se ajusta durante el render, sin efecto (patrón recomendado por React).
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) { setPrevValue(value); setText(value) }
  const clean = cleanAmount(text)
  const invalid = text.trim() !== '' && clean === ''

  useEffect(() => {
    if (invalid || clean === value) return
    const timer = setTimeout(() => onCommit(clean), 250)
    return () => clearTimeout(timer)
  }, [clean, invalid, value, onCommit])

  return (
    <span className="relative">
      <label htmlFor={id} className="sr-only">{label} ({symbol})</label>
      <input id={id} inputMode="decimal" value={text} placeholder={label} aria-invalid={invalid || undefined}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (!invalid && clean !== value) onCommit(clean) }}
        className={fieldClasses('sm', invalid, 'w-24 pr-6 mono')} />
      <span aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">{symbol}</span>
    </span>
  )
}

export function AmountRange({ min, max, symbol, onChange }: {
  min: string; max: string; symbol: string
  onChange: (patch: { value_min?: string; value_max?: string }) => void
}) {
  return (
    <span role="group" aria-label="Rango de importe" className="inline-flex items-center gap-1">
      <AmountField label="Mín." value={min} symbol={symbol} onCommit={v => onChange({ value_min: v })} />
      <span aria-hidden="true" className="text-fg-subtle text-xs">–</span>
      <AmountField label="Máx." value={max} symbol={symbol} onCommit={v => onChange({ value_max: v })} />
    </span>
  )
}
