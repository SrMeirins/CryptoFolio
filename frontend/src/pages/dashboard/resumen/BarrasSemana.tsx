import type { BarraDia } from '../../../utils/resumenSemana'

// Barras del P&L de cada día de la semana (#522): verdes hacia arriba y rojas
// hacia abajo desde una línea de cero, con la inicial del día debajo y hoy
// marcado (contorno y punto en vivo). Decorativas: el dato va en la lista
// para el lector de pantalla y en la cifra del periodo.

export function BarrasSemana({ barras, oculto, formato }: {
  barras: readonly BarraDia[]
  /** Privacidad: sin importes en la lista accesible. */
  oculto: boolean
  formato: (n: number) => string
}) {
  const max = Math.max(...barras.map(b => Math.abs(b.pnl)), 0.01)
  const hayNegativos = barras.some(b => b.pnl < 0)
  const hayPositivos = barras.some(b => b.pnl > 0)
  // Reparto del alto entre la parte de arriba y la de abajo según haya de cada signo.
  const arriba = hayPositivos && hayNegativos ? 0.55 : hayNegativos ? 0.15 : 0.85
  return (
    <span className="block">
      {/* Texto para el lector de pantalla (la tarjeta es un botón: sin listas dentro). */}
      <span className="sr-only">
        {barras.map(b => `${b.nombre}${b.hoy ? ' (hoy)' : ''}: ${oculto ? (b.pnl > 0 ? 'en verde' : b.pnl < 0 ? 'en rojo' : 'sin cambio') : formato(b.pnl)}`).join('; ')}.
      </span>
      <span aria-hidden="true" className="relative block h-32">
        <span className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${arriba * 100}%` }} />
        <span className="absolute inset-0 grid grid-cols-7 gap-1.5">
          {barras.map((b, i) => {
            const alto = Math.abs(b.pnl) / max
            const positivo = b.pnl >= 0
            const espacio = positivo ? arriba : 1 - arriba
            return (
              <span key={b.date} className="relative block">
                <span
                  className={`absolute inset-x-0.5 rounded-[3px] transition-[height] duration-500 ease-out ${positivo ? 'bg-positive' : 'bg-negative'} ${b.hoy ? 'ring-2 ring-offset-1 ring-offset-background-card' : 'opacity-80'}`}
                  style={{
                    height: `${Math.max(alto * espacio * 100, b.pnl === 0 ? 0 : 3)}%`,
                    ...(positivo ? { bottom: `${(1 - arriba) * 100}%` } : { top: `${arriba * 100}%` }),
                    ['--tw-ring-color' as string]: positivo ? 'var(--cf-positive)' : 'var(--cf-negative)',
                    animationDelay: `${i * 40}ms`,
                  }} />
                {b.hoy && b.live && (
                  <span className="absolute left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-brand animate-pulse motion-reduce:animate-none"
                    style={positivo ? { bottom: `calc(${(1 - arriba + alto * arriba) * 100}% + 4px)` } : { top: `calc(${(arriba + alto * (1 - arriba)) * 100}% + 4px)` }} />
                )}
              </span>
            )
          })}
        </span>
      </span>
      <span aria-hidden="true" className="mt-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] mono">
        {barras.map(b => <span key={b.date} className={b.hoy ? 'font-bold text-fg' : 'text-fg-subtle'}>{b.hoy ? 'Hoy' : b.letra}</span>)}
      </span>
    </span>
  )
}
