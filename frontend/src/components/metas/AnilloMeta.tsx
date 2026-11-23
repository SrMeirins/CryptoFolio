import { AnimatedNumber } from '../AnimatedNumber'
import { textoPct, textoPctCorto, type ProgresoMeta } from '../../utils/metas'

// Anillo de progreso de una meta (#520): el arco del color de su tipo y el
// porcentaje en el centro, que cuenta hasta su valor y se mueve con los
// precios en vivo. La cifra baja de tamaño con los dígitos para caber siempre
// («224 %», «999+ %»). Común a la franja del Dashboard y a la vista previa del
// formulario.

const R = 26
const VUELTA = 2 * Math.PI * R
const numero = (v: number) => textoPctCorto(v).replace(/\s%$/, '')

export function AnilloMeta({ progreso, nombre, color, tam = 'md' }: {
  progreso: ProgresoMeta | null
  nombre: string
  color: string
  tam?: 'sm' | 'md'
}) {
  const relleno = progreso?.relleno ?? 0
  const digitos = progreso ? numero(progreso.pct).length : 0
  const letra = tam === 'sm'
    ? (digitos <= 2 ? 'text-[13px]' : digitos === 3 ? 'text-[11px]' : 'text-[10px]')
    : (digitos <= 2 ? 'text-[17px]' : digitos === 3 ? 'text-[14px]' : 'text-[12px]')
  return (
    <div role="progressbar" aria-label={`Progreso de ${nombre}`} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={progreso ? Math.round(relleno) : undefined} aria-valuetext={progreso ? textoPct(progreso.pct) : 'Calculando'}
      className={`relative shrink-0 ${tam === 'sm' ? 'size-14' : 'size-[4.5rem]'}`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" style={{ stroke: `color-mix(in srgb, ${color} 16%, transparent)` }} />
        {progreso && relleno > 0 && (
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={VUELTA} strokeDashoffset={VUELTA * (1 - relleno / 100)}
            className="transition-[stroke-dashoffset,stroke] duration-700 ease-out" style={{ stroke: color }} />
        )}
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        {progreso ? (
          <span className={`mono font-bold tabular-nums leading-none text-fg ${letra}`}>
            <AnimatedNumber value={progreso.pct} format={numero} countUp duration={500} />
            <span className="ml-px text-[9px] font-semibold text-fg-muted">%</span>
          </span>
        ) : <span className="size-6 skeleton rounded-full" />}
      </span>
    </div>
  )
}
