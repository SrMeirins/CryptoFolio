import { useState } from 'react'
import { inputClass } from './helpers'
import { ColorPicker } from './ColorPicker'

export function AddWalletForm({ onSave, onCancel }: {
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [name, setName]   = useState('')
  const [type, setType]   = useState('hardware')
  const [color, setColor] = useState('#6366f1')
  const [notes, setNotes] = useState('')

  return (
    <div className="card space-y-4">
      <h3 className="font-medium text-sm">Nueva wallet</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Nombre *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Mi Tangem, Ledger Nano..." className={inputClass} autoFocus />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Tipo *</label>
          <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
            <option value="hardware">Hardware wallet</option>
            <option value="software">Software wallet</option>
            <option value="exchange">Exchange</option>
            <option value="bank">Banco / Fiat</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Color</label>
        <ColorPicker value={color} onChange={setColor} size="md" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Notas (opcional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Tangem Card modelo 2..." className={inputClass} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
        <button type="button" onClick={() => onSave({ name, type, color, notes: notes || null })} disabled={!name}
          className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
          Crear wallet
        </button>
      </div>
    </div>
  )
}
