import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { WalletFull } from '../../../api/portfolio'
import { Drawer, Dropdown, buttonClasses, iconButtonClasses } from '../../../components/ui'
import { ColorPicker } from './ColorPicker'
import { WALLET_TYPE_OPTIONS, inputClass } from './helpers'

// Edición de una wallet en un panel lateral (#448): nombre, tipo, color y
// notas. Antes solo se podían cambiar nombre y color en línea, y al hacerlo se
// borraban las notas.


export interface WalletEdit { name: string; type: string; color: string; notes: string | null }

export function WalletEditPanel({ wallet, onSave, onClose }: {
  wallet: WalletFull
  onSave: (edit: WalletEdit) => Promise<void>
  onClose: () => void
}) {
  const titleId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(wallet.name)
  const [type, setType] = useState(wallet.type)
  const [color, setColor] = useState(wallet.color)
  const [notes, setNotes] = useState(wallet.notes ?? '')
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()
  const changed = trimmed !== wallet.name || type !== wallet.type || color !== wallet.color || notes.trim() !== (wallet.notes ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed || !changed) return
    setSaving(true)
    try {
      await onSave({ name: trimmed, type, color, notes: notes.trim() || null })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} initialFocusRef={nameRef}>
      <form onSubmit={submit} className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <span aria-hidden="true" className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h2 id={titleId} className="text-lg font-semibold text-fg flex-1 truncate">Editar {wallet.name}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar sin guardar" className={iconButtonClasses('md')}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="space-y-1">
            <label htmlFor={`${titleId}-nombre`} className="text-xs text-fg-subtle">Nombre</label>
            <input id={`${titleId}-nombre`} ref={nameRef} value={name} onChange={e => setName(e.target.value)} maxLength={100}
              aria-invalid={!trimmed} className={inputClass} />
            {!trimmed && <p role="alert" className="text-xs text-negative-ink">El nombre no puede quedar vacío.</p>}
          </div>
          <div className="space-y-1">
            <span className="text-xs text-fg-subtle">Tipo</span>
            <Dropdown label="Tipo de wallet" value={type} onChange={setType} className="w-full" disabled={wallet.is_system}
              options={WALLET_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
            {wallet.is_system && <p className="text-xs text-fg-subtle">Las wallets del sistema no cambian de tipo.</p>}
          </div>
          <div className="space-y-1">
            <span className="text-xs text-fg-subtle">Color</span>
            <ColorPicker value={color} onChange={setColor} size="md" />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${titleId}-notas`} className="text-xs text-fg-subtle">Notas</label>
            <textarea id={`${titleId}-notas`} value={notes} onChange={e => setNotes(e.target.value)} rows={4} maxLength={1000}
              placeholder="Dónde está, para qué la usas..." className={`${inputClass} font-sans resize-y`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'md')}>Cancelar</button>
          <button type="submit" disabled={!trimmed || !changed || saving} className={buttonClasses('primary', 'md')}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Drawer>
  )
}
