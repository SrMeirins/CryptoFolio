import { useEffect, useCallback, useRef } from 'react'

/** Paso basado en el orden de magnitud del valor actual (mayor precisión cuanto menor es el valor). */
export function calcStep(value: number): number {
  if (value <= 0) return 0.01
  const mag = Math.pow(10, Math.floor(Math.log10(value)) - 1)
  return Math.max(mag, 1e-8)
}

/** Dispara `callback` al pulsar, y repite con aceleración mientras se mantiene pulsado. */
function useHoldRepeat(callback: () => void) {
  const cbRef    = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { cbRef.current = callback }, [callback])

  const start = useCallback(() => {
    cbRef.current()
    timerRef.current = setTimeout(() => {
      intRef.current = setInterval(() => cbRef.current(), 80)
    }, 400)
  }, [])

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current);  timerRef.current = null }
    if (intRef.current)   { clearInterval(intRef.current);   intRef.current   = null }
  }, [])

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: start, onTouchEnd: stop }
}

/** Botón −/+ de un stepper numérico, con hold-to-repeat (mantener pulsado acelera). */
export function StepButton({ label, onStep }: { label: string; onStep: () => void }) {
  const hold = useHoldRepeat(onStep)
  return (
    <button
      type="button"
      {...hold}
      className="px-3 py-2.5 text-gray-500 hover:text-white hover:bg-white/8 active:bg-white/12 active:scale-90 transition-all text-base leading-none select-none"
    >
      {label}
    </button>
  )
}
