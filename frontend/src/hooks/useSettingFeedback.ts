import { useCallback, useState } from 'react'
import { useToast } from './useToast'

// Confirmación de los ajustes guardados al momento (#445): aviso «Guardado»
// con Deshacer y la marca animada junto al ajuste que acaba de cambiar.

export interface SavedStamp { key: string; at: number }

export function useSettingFeedback() {
  const toast = useToast()
  const [saved, setSaved] = useState<SavedStamp | null>(null)

  /** `undo` restaura el valor anterior; sin él, el aviso no ofrece Deshacer. */
  const confirm = useCallback((key: string, message: string, undo?: () => void) => {
    setSaved({ key, at: Date.now() })
    toast.addToast({ type: 'success', title: 'Guardado', message, ...(undo && { action: { label: 'Deshacer', onClick: undo } }) })
  }, [toast])

  return { saved, confirm }
}
