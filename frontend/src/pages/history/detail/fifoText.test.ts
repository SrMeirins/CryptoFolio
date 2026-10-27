import { describe, expect, it } from 'vitest'
import { fiscalCause, preciseEur, roleText, signedEur, usedFraction } from './fifoText'
import type { TransactionDetail } from '../../../api/portfolio'

// Textos de la trazabilidad FIFO (#405). Datos sintéticos.
type C = TransactionDetail['fifo']['consumed'][number]
const c = (role: C['role'], fiscal: C['fiscal_event_type']) => ({ role, fiscal_event_type: fiscal }) as C

describe('fifoText (#405)', () => {
  it('papel con destino solo en los traslados', () => {
    expect(roleText('traslado', 'Fría')).toBe('Traslado a Fría')
    expect(roleText('traslado', null)).toBe('Traslado')
    expect(roleText('comision_red', 'Fría')).toBe('Comisión de red')
    // En línea, en minúscula sin tocar el nombre de la wallet.
    expect(roleText('traslado', 'Tangem Fría', true)).toBe('traslado a Tangem Fría')
    expect(roleText('comision_red', null, true)).toBe('comisión de red')
  })

  it('importes pequeños con 2 cifras significativas y signo', () => {
    expect(preciseEur(0.004)).toMatch(/^0,004/)
    expect(preciseEur(1.5)).toMatch(/^1,50/)
    expect(signedEur(0.0042)).toMatch(/^\+0,0042/)
    expect(signedEur(-0.004)).toMatch(/^-0,004/)
    expect(signedEur(null)).toBe('—')
  })

  it('fracción usada de un lote, acotada entre 0 y 1', () => {
    expect(usedFraction(10, 4)).toBeCloseTo(0.6)
    expect(usedFraction(10, 10)).toBe(0)
    expect(usedFraction(0, 0)).toBe(0)
  })

  it('qué causa el efecto fiscal', () => {
    expect(fiscalCause([c('comision_red', 'GAIN'), c('traslado', 'NONE')])).toBe('solo la comisión de red')
    expect(fiscalCause([c('venta', 'GAIN')])).toBe('la venta')
    expect(fiscalCause([c('devolucion_margen', 'NONE'), c('intereses_margen', 'LOSS')])).toBe('solo los intereses de margen')
    expect(fiscalCause([c('traslado', 'NONE')])).toBeNull()
  })
})
