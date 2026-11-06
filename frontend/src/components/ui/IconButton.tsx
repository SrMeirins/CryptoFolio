import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { iconButtonClasses, type IconButtonSize, type IconButtonTone } from './classes'
import { Hint } from './Tooltip'

// Botón solo con icono (#199): exige una etiqueta accesible, que también se
// muestra en un Hint al pasar el ratón o enfocarlo (#495).

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string
  icon: ReactNode
  size?: IconButtonSize
  active?: boolean
  tone?: IconButtonTone
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', active = false, tone = 'neutral', className = '', type = 'button', title, ...rest },
  ref,
) {
  return (
    <Hint label={title ?? label}>
      <button ref={ref} type={type} aria-label={label}
        className={iconButtonClasses(size, active, className, tone)} {...rest}>
        {icon}
      </button>
    </Hint>
  )
})
