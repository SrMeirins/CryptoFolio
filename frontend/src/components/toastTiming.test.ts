import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToastTimer, TOAST_MS, toastDuration } from './toastTiming'

// Duración y pausa de los avisos (#497). Temporizadores falsos.
describe('duración de los avisos (#497)', () => {
  it('error o con acción: 6 s; éxito o información sin acción: 4 s', () => {
    expect(toastDuration({ type: 'error' })).toBe(6000)
    expect(toastDuration({ type: 'success', action: { label: 'Deshacer', onClick: () => {} } })).toBe(6000)
    expect(toastDuration({ type: 'success' })).toBe(4000)
    expect(toastDuration({ type: 'info' })).toBe(4000)
    expect(TOAST_MS).toEqual({ corto: 4000, largo: 6000 })
  })

  it('una duración explícita manda', () => {
    expect(toastDuration({ type: 'success', duration: 1500 })).toBe(1500)
  })
})

describe('pausa con ratón o foco (#497)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('se cierra al cumplir su tiempo', () => {
    const cerrar = vi.fn()
    createToastTimer(4000, cerrar)
    vi.advanceTimersByTime(3999)
    expect(cerrar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cerrar).toHaveBeenCalledOnce()
  })

  it('pausado no se cierra y al reanudar sigue desde donde estaba', () => {
    const cerrar = vi.fn()
    const t = createToastTimer(6000, cerrar)
    vi.advanceTimersByTime(4000)
    t.pause()
    vi.advanceTimersByTime(60_000)
    expect(cerrar).not.toHaveBeenCalled()
    t.resume()
    vi.advanceTimersByTime(1999)
    expect(cerrar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cerrar).toHaveBeenCalledOnce()
  })

  it('pausar o reanudar dos veces no duplica ni pierde tiempo', () => {
    const cerrar = vi.fn()
    const t = createToastTimer(4000, cerrar)
    t.pause(); t.pause()
    t.resume(); t.resume()
    vi.advanceTimersByTime(4000)
    expect(cerrar).toHaveBeenCalledOnce()
  })
})
