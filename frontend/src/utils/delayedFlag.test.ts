import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOADING_DELAY_MS, scheduleDelayedFlag } from './delayedFlag'

// Retraso de 300 ms de los indicadores de carga (#494).
describe('scheduleDelayedFlag (#494)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('el retraso por defecto es de 300 ms', () => {
    expect(LOADING_DELAY_MS).toBe(300)
  })

  it('no se activa antes de 300 ms y sí al llegar', () => {
    const set = vi.fn()
    scheduleDelayedFlag(true, LOADING_DELAY_MS, set)
    vi.advanceTimersByTime(299)
    expect(set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(set).toHaveBeenCalledWith(true)
  })

  it('una carga que acaba antes de 300 ms nunca lo muestra', () => {
    const set = vi.fn()
    const cancel = scheduleDelayedFlag(true, LOADING_DELAY_MS, set)
    vi.advanceTimersByTime(150)
    cancel()
    vi.advanceTimersByTime(1000)
    expect(set).not.toHaveBeenCalled()
  })

  it('inactivo: se apaga en el acto', () => {
    const set = vi.fn()
    scheduleDelayedFlag(false, LOADING_DELAY_MS, set)
    expect(set).toHaveBeenCalledWith(false)
  })
})
