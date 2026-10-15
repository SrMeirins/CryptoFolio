import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { fieldClasses, type FieldSize } from './classes'

// Campo de texto y desplegable base (#199): mismo aspecto, foco y estado de error.

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid = false, className = '', ...rest }, ref,
) {
  return <input ref={ref} aria-invalid={invalid || rest['aria-invalid'] || undefined} className={fieldClasses(size, invalid, className)} {...rest} />
})

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: FieldSize
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', invalid = false, className = '', ...rest }, ref,
) {
  return <select ref={ref} aria-invalid={invalid || rest['aria-invalid'] || undefined} className={fieldClasses(size, invalid, `cursor-pointer ${className}`)} {...rest} />
})
