import { describe, expect, it } from 'vitest'
import { etiquetaEstado, hayPendientes } from './helpers'

// Estado de verificación de las direcciones (#336). Datos sintéticos.
describe('etiquetaEstado', () => {
  it('en un error, nombra el motivo concreto', () => {
    expect(etiquetaEstado('ok', []).label).toBe('Verificado')
    expect(etiquetaEstado('error', [{ diagnostico: { tipo: 'api_key' } }]).label).toBe('Falta API key')
    expect(etiquetaEstado('error', [{ diagnostico: { tipo: 'contrato' } }]).label).toBe('Falta contrato')
    expect(etiquetaEstado('error', [{ diagnostico: { tipo: 'sin_proveedor' } }]).label).toBe('No verificable')
    expect(etiquetaEstado('error', [{ diagnostico: { tipo: 'red' } }]).label).toBe('Sin conexión')
  })
})

describe('hayPendientes', () => {
  it('solo direcciones con dirección y sin verificar', () => {
    expect(hayPendientes([{ addresses: [{ address: 'r1', sync_status: 'ok' }, { address: null, sync_status: 'pending' }] }])).toBe(false)
    expect(hayPendientes([{ addresses: [{ address: 'r1', sync_status: 'pending' }] }])).toBe(true)
    expect(hayPendientes([{}])).toBe(false)
  })
})
