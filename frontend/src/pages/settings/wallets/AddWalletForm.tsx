import { useState } from 'react'
import { inputClass } from './helpers'
import { ColorPicker } from './ColorPicker'
import { cardClasses, buttonClasses } from '../../../components/ui'

export function AddWalletForm({ onSave, onCancel }: {
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName]   = useState('')
  const [type, setType]   = useState('hardware')
  const [color, setColor] = useState('#6366f1')
  const [notes, setNotes] = useState('')

  return (
    <div className={cardClasses('md', 'space-y-4')}>
      <h3 className="font-medium text-sm">Nueva wallet</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-fg-subtle">Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Mi Tangem, Ledger Nano..." className={inputClass} autoFocus />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-fg-subtle">Tipo *</label>
          <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
            <option value="hardware">Hardware wallet</option>
            <option value="software">Software wallet</option>
            <option value="exchange">Exchange</option>
            <option value="bank">Banco / Fiat</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-fg-subtle">Color</label>
        <ColorPicker value={color} onChange={setColor} size="md" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-fg-subtle">Notas (opcional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Tangem Card modelo 2..." className={inputClass} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-fg-muted hover:text-fg transition-colors">Cancelar</button>
        <button type="button" onClick={() => onSave({ name, type, color, notes: notes || null })} disabled={!name}
          className={buttonClasses('primary', 'md')}>
          Crear wallet
        </button>
      </div>
    </div>
  )
}
