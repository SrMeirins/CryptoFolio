import { describe, expect, it } from 'vitest'
import type { AllocationItem } from './allocation'
import { destinosDistribucion } from './distribucionDestinos'

const item = (key: string, kind: AllocationItem['kind'], extra: Partial<AllocationItem> = {}): AllocationItem =>
  ({ key, label: key.toUpperCase(), value: 1, pct: 1, color: '#000000', kind, change24h: null, members: [], breakdown: [], ...extra })

describe('destinosDistribucion (#514)', () => {
  it('activo: su detalle en Portfolio y sus operaciones en el Historial', () => {
    expect(destinosDistribucion(item('XRP', 'crypto'), 'asset')).toEqual({
      portfolio: { to: '/portfolio?activo=XRP', nombre: 'Ver XRP en Portfolio' },
      historial: { to: '/history?activo=XRP', nombre: 'Ver las operaciones de XRP en el Historial' },
    })
  })
  it('efectivo: la cartera en Portfolio (sin detalle) y su Historial', () => {
    expect(destinosDistribucion(item('EUR', 'fiat'), 'asset').portfolio?.to).toBe('/portfolio')
  })
  it('wallet: filtrada por su id en los dos', () => {
    const d = destinosDistribucion(item('w-1', 'wallet', { label: 'Mi wallet' }), 'wallet')
    expect([d.portfolio?.to, d.historial?.to]).toEqual(['/portfolio?wallet=w-1', '/history?wallet=w-1'])
    expect(d.portfolio?.nombre).toBe('Ver la wallet Mi wallet en Portfolio')
  })
  it('«Otros»: sus activos filtrados; con wallets, sin destino común', () => {
    const otros = item('__otros', 'other', { members: [{ key: 'AAA', label: 'AAA', value: 1, pct: 1 }, { key: 'BBB', label: 'BBB', value: 1, pct: 1 }] })
    expect(destinosDistribucion(otros, 'asset').portfolio?.to).toBe('/portfolio?activos=AAA,BBB')
    expect(destinosDistribucion(otros, 'asset').historial?.to).toBe('/history?activo=AAA,BBB')
    expect(destinosDistribucion(otros, 'wallet')).toEqual({ portfolio: null, historial: null })
  })
})
