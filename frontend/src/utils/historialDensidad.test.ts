import { describe, expect, it } from 'vitest'
import { densidadHistorial } from './historialDensidad'

describe('densidadHistorial (#552)', () => {
  it('compacta solo si está guardada así; si no, cómoda', () => {
    expect(densidadHistorial({ historial_densidad: 'compacta' })).toBe('compacta')
    expect(densidadHistorial({ historial_densidad: 'comoda' })).toBe('comoda')
    expect(densidadHistorial({ historial_densidad: 'otra' })).toBe('comoda')
    expect(densidadHistorial(undefined)).toBe('comoda')
  })
})
