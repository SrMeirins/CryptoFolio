import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

interface Props {
  value: number
  format: (v: number) => string
  className?: string
  duration?: number
}

/**
 * Renders `format(value)` and smoothly interpolates from the previous value
 * to the new one using requestAnimationFrame whenever `value` changes.
 * On first mount the value appears instantly (no animation from 0).
 */
export function AnimatedNumber({ value, format, className = '', duration = 450 }: Props) {
  const [displayed, setDisplayed] = useState(value)

  // Keep a ref in sync with state so we can read current position
  // synchronously when a new update arrives mid-animation.
  const displayedRef = useRef(value)
  const rafRef       = useRef(0)
  const isFirst      = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }

    const from = displayedRef.current
    const to   = value
    if (from === to) return

    cancelAnimationFrame(rafRef.current)
    let startTs: number | null = null

    function step(ts: number) {
      if (!startTs) startTs = ts
      const progress = Math.min((ts - startTs) / duration, 1)
      const eased    = easeOutCubic(progress)
      const current  = from + (to - from) * eased
      displayedRef.current = current
      setDisplayed(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        displayedRef.current = to
        setDisplayed(to)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <span className={className}>{format(displayed)}</span>
}
