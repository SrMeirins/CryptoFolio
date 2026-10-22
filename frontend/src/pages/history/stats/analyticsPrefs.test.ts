import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAnalyticsOpen, readChartMode, saveAnalyticsOpen, saveChartMode } from './analyticsPrefs'

// Preferencias de la analítica (#376): se recuerdan y, si el almacenamiento
// falla, se usan los valores por defecto sin romper la página.

afterEach(() => { vi.unstubAllGlobals() })

describe('analyticsPrefs (#376)', () => {
  it('recuerda si la analítica estaba abierta y el modo del gráfico', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } })
    expect(readAnalyticsOpen()).toBe(false)
    expect(readChartMode()).toBe('ops')
    saveAnalyticsOpen(true)
    saveChartMode('valor')
    expect(readAnalyticsOpen()).toBe(true)
    expect(readChartMode()).toBe('valor')
  })

  it('con el almacenamiento bloqueado no lanza y usa los valores por defecto', () => {
    const boom = () => { throw new DOMException('bloqueado', 'SecurityError') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom })
    expect(() => saveAnalyticsOpen(true)).not.toThrow()
    expect(() => saveChartMode('valor')).not.toThrow()
    expect(readAnalyticsOpen()).toBe(false)
    expect(readChartMode()).toBe('ops')
  })

  it('un valor desconocido guardado vuelve al modo por defecto', () => {
    vi.stubGlobal('localStorage', { getItem: () => '<script>', setItem: () => {} })
    expect(readChartMode()).toBe('ops')
  })
})
