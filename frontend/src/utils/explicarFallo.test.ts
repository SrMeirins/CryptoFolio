import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { explicarFallo, tipoFallo } from './explicarFallo'

// Texto de los fallos (#497): qué pasó y qué hacer, sin códigos ni rutas internas.
describe('explicarFallo (#497)', () => {
  it('sin conexión, tiempo agotado, límite y fallo del servidor tienen su ayuda', () => {
    expect(tipoFallo(new TypeError('Failed to fetch'))).toBe('red')
    expect(explicarFallo(new TypeError('Failed to fetch'))).toMatch(/^Sin conexión/)
    const tiempo = new Error('Tiempo de espera agotado (30s) al llamar a /fifo/lots', { cause: new DOMException('x', 'AbortError') })
    expect(explicarFallo(tiempo)).toMatch(/tarda demasiado/)
    expect(explicarFallo(tiempo)).not.toContain('/fifo')
    expect(explicarFallo(new ApiError(429, 'Too Many Requests', {}))).toMatch(/Espera un minuto/)
    expect(explicarFallo(new ApiError(500, 'relation "x" does not exist', {}))).not.toContain('relation')
  })

  it('los mensajes de validación del servidor se muestran tal cual, con punto final', () => {
    expect(explicarFallo(new ApiError(400, 'El nombre ya existe', {}))).toBe('El nombre ya existe.')
    expect(explicarFallo(new ApiError(409, 'Ya hay una copia en curso.', {}))).toBe('Ya hay una copia en curso.')
  })

  it('sin mensaje: «Vuelve a intentarlo.»', () => {
    expect(explicarFallo(undefined)).toBe('Vuelve a intentarlo.')
  })
})
