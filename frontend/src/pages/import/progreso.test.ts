import { describe, expect, it } from 'vitest'
import { estadoProgreso, eventosLog, formatoDuracion, tituloPestana } from './progreso'
import type { ProgressEvent } from './types'

// Pantalla de importación en curso (#324). Datos sintéticos.
const ev = (e: Partial<ProgressEvent> & Pick<ProgressEvent, 'phase'>): ProgressEvent => ({ message: '', ...e })

describe('estadoProgreso', () => {
  it('fase actual, detalle y porcentaje global por tramos', () => {
    const e = estadoProgreso([ev({ phase: 'importing', progress: 10, total: 10 }), ev({ phase: 'prices', progress: 21, total: 42 })], 0)
    expect(e).toMatchObject({ fase: 'prices', titulo: 'Buscando precios históricos', detalle: '21 de 42', porcentaje: 50, espera: null })
    expect(e.fases.map(f => f.estado)).toEqual(['hecha', 'actual', 'pendiente'])
  })

  it('cuenta atrás de la espera y desaparece al llegar otro evento', () => {
    const espera = ev({ phase: 'prices', espera: 60, t: 1000 })
    expect(estadoProgreso([espera], 11_000)).toMatchObject({ titulo: 'CoinGecko pide una pausa', espera: 50 })
    expect(estadoProgreso([espera], 999_000).espera).toBe(0)
    expect(estadoProgreso([espera, ev({ phase: 'prices', progress: 1, total: 2, t: 5000 })], 11_000).espera).toBeNull()
  })

  it('terminado: 100 % y todas las fases hechas; error: marca la fase en curso', () => {
    const fin = estadoProgreso([ev({ phase: 'fifo', progress: 1, total: 4 }), ev({ phase: 'done' })], 0)
    expect(fin).toMatchObject({ fase: 'done', porcentaje: 100, detalle: null })
    expect(fin.fases.every(f => f.estado === 'hecha')).toBe(true)
    const err = estadoProgreso([ev({ phase: 'prices' }), ev({ phase: 'error', message: 'x' })], 0)
    expect(err.fase).toBe('error')
    expect(err.fases.map(f => f.estado)).toEqual(['hecha', 'error', 'pendiente'])
  })

  it('sin eventos: empieza en importar al 0 %', () => {
    expect(estadoProgreso([], 0)).toMatchObject({ fase: 'importing', porcentaje: 0 })
  })
})

describe('utilidades', () => {
  it('duración legible', () => {
    expect(formatoDuracion(8_400)).toBe('8 s')
    expect(formatoDuracion(65_000)).toBe('1 min 05 s')
  })
  it('título de la pestaña', () => {
    expect(tituloPestana(estadoProgreso([ev({ phase: 'prices', progress: 21, total: 42 })], 0))).toBe('50 % · Importando')
    expect(tituloPestana(estadoProgreso([ev({ phase: 'done' })], 0))).toBe('✓ Importación lista')
  })
  it('el log técnico omite los eventos de solo avance', () => {
    expect(eventosLog([ev({ phase: 'fifo', soloProgreso: true }), ev({ phase: 'fifo', message: 'ok' })]).map(e => e.message)).toEqual(['ok'])
  })
})
