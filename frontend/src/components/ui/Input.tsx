import { forwardRef, type InputHTMLAttributes } from 'react'
import { fieldClasses, type FieldSize } from './classes'

// Campo de texto base (#199): mismo aspecto, foco y estado de error.
// Los desplegables usan Dropdown (#240), no el <select> nativo.

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid = false, className = '', ...rest }, ref,
) {
  return <input ref={ref} aria-invalid={invalid || rest['aria-invalid'] || undefined} className={fieldClasses(size, invalid, className)} {...rest} />
})
