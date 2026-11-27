import { describe, expect, it } from 'vitest'
import { estadoClave, faltaClave, mensajeComprobacion, usoClave } from './conexiones'

describe('conexiones (versión 1.0)', () => {
  it('el estado nunca menciona la clave, solo si está y desde cuándo', () => {
    expect(estadoClave({ estado: 'configurada', actualizada: '2026-11-26T10:00:00Z' })).toEqual({ texto: 'Configurada el 26 nov 2026', tono: 'positive' })
    expect(estadoClave({ estado: 'entorno', actualizada: null }).texto).toBe('Desde el archivo .env')
    expect(estadoClave({ estado: 'ilegible', actualizada: null }).tono).toBe('negative')
    expect(estadoClave({ estado: 'sin_configurar', actualizada: null }).texto).toBe('Sin clave')
  })

  it('explica el uso con el recuento de direcciones', () => {
    expect(usoClave({ id: 'etherscan', red: 'Ethereum', direcciones: 2 })).toContain('La usan 2 direcciones')
    expect(usoClave({ id: 'blockfrost', red: 'Cardano', direcciones: 1 })).toContain('La usa 1 dirección')
    expect(usoClave({ id: 'coingecko', red: null, direcciones: 0 })).toMatch(/^Precios/)
  })

  it('distingue rechazo, servicio caído e ilegible', () => {
    expect(mensajeComprobacion('aceptada').tipo).toBe('ok')
    expect(mensajeComprobacion('sin_respuesta').tipo).toBe('aviso')
    expect(mensajeComprobacion('rechazada').tipo).toBe('error')
    expect(mensajeComprobacion('ilegible').texto).toMatch(/vuelve a introducirla/)
    expect(mensajeComprobacion(null).tipo).toBe('aviso')
  })

  it('una red pide atención solo con direcciones y sin clave utilizable', () => {
    expect(faltaClave({ red: 'Ethereum', estado: 'sin_configurar', direcciones: 1 })).toBe(true)
    expect(faltaClave({ red: 'Ethereum', estado: 'ilegible', direcciones: 1 })).toBe(true)
    expect(faltaClave({ red: 'Ethereum', estado: 'entorno', direcciones: 1 })).toBe(false)
    expect(faltaClave({ red: 'Ethereum', estado: 'sin_configurar', direcciones: 0 })).toBe(false)
    expect(faltaClave({ red: null, estado: 'sin_configurar', direcciones: 0 })).toBe(false)
  })
})
