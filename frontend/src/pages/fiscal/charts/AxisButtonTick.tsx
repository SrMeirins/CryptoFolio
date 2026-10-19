import type { KeyboardEvent } from 'react'

// Etiqueta del eje X que actúa como botón (#301): las barras de recharts no
// reciben el foco, así que la acción también está en la etiqueta, con nombre
// accesible y activable con Intro o Espacio.
export function AxisButtonTick({ x = 0, y = 0, payload, label, describe, onActivate, active = false, disabled = false, fill, activeFill }: {
  x?: number
  y?: number
  payload?: { value: string | number }
  label: (value: string | number) => string
  describe: (value: string | number) => string
  onActivate: (value: string | number) => void
  active?: boolean | ((value: string | number) => boolean)
  disabled?: boolean | ((value: string | number) => boolean)
  fill: string
  activeFill: string
}) {
  if (!payload) return null
  const v = payload.value
  const isActive = typeof active === 'function' ? active(v) : active
  const isDisabled = typeof disabled === 'function' ? disabled(v) : disabled
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(v) }
  }
  return (
    <g transform={`translate(${x},${y})`}
      {...(isDisabled ? { 'aria-hidden': true } : { role: 'button', tabIndex: 0, 'aria-label': describe(v), onClick: () => onActivate(v), onKeyDown: onKey })}
      className={isDisabled ? '' : 'cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--cf-brand)]'}>
      <rect x={-22} y={2} width={44} height={20} rx={6} fill="transparent" stroke="transparent" strokeWidth={1.5} />
      <text textAnchor="middle" dy={16} fontSize={11} fontWeight={isActive ? 700 : 400} fill={isActive ? activeFill : fill}>{label(v)}</text>
    </g>
  )
}
