import { useId, type ReactNode } from 'react'

// Campo con etiqueta, ayuda y mensaje de error (#199). Pasa al control los
// atributos de accesibilidad: id, aria-describedby y aria-invalid.

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Recibe los atributos que debe aplicar al input o select. */
  children: (control: FieldControlProps) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className = '' }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-fg-muted">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && <p id={hintId} className="text-xs text-fg-subtle">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs text-negative">{error}</p>}
    </div>
  )
}
