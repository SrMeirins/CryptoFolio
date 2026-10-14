import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonClasses, type ButtonVariant, type ButtonSize } from './classes'

// Botón base (#199). Variantes y tamaños en una función pura (buttonClasses)
// para que también puedan aplicarse a enlaces con aspecto de botón.

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icono a la izquierda del texto. */
  icon?: ReactNode
  /** Muestra un indicador de carga y deshabilita el botón. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, disabled, className = '', type = 'button', children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)} {...rest}>
      {loading ? <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
})
