import { describe, expect, it } from 'vitest'
import { avanceAnio, cascadaCuota } from './cascadaCuota'
import { baseTramosCompensada } from './tramosIrpf'
import type { CarryforwardDetalle } from '../pages/fiscal/types'

// Cascada de la cuota (#537). Datos sintéticos.

const cf = (p: Partial<CarryforwardDetalle>): CarryforwardDetalle => ({
  year: 2025, netoAntes: 0, rendimientos: 0, perdida: 0, compensadoPatrim: 0, compensadoRend: 0,
  compensado: 0, compensadoRendAnio: 0, limiteRend25: 0, netoDespues: 0, ...p,
})
const keys = (c: ReturnType<typeof cascadaCuota>) => c.pasos.map(p => p.key)
const ultimo = (c: ReturnType<typeof cascadaCuota>) => c.pasos.at(-1)!

describe('cascadaCuota', () => {
  it('sin compensación: ganancias, pérdidas, neto, rendimientos y base', () => {
    const d = cf({ netoAntes: 700, rendimientos: 50, netoDespues: 700 })
    const c = cascadaCuota({ ganancias: 1000, perdidas: -300, rendimientos: 50, cf: d })
    expect(keys(c)).toEqual(['ganancias', 'perdidas', 'neto', 'rendimientos', 'base'])
    expect(c.base).toBe(750)
    expect(ultimo(c)).toMatchObject({ tipo: 'total', importe: 750 })
    expect(c.pasos.find(p => p.key === 'neto')).toMatchObject({ importe: 700 })
  })

  it('con compensación de años anteriores: resta contra ganancias y contra el 25 % de rendimientos', () => {
    const d = cf({ netoAntes: 400, rendimientos: 200, compensadoPatrim: 400, compensadoRend: 50, compensado: 450, limiteRend25: 50, netoDespues: 0 })
    const c = cascadaCuota({ ganancias: 600, perdidas: -200, rendimientos: 200, cf: d })
    expect(keys(c)).toEqual(['ganancias', 'perdidas', 'neto', 'compPatrim', 'rendimientos', 'compRend', 'base'])
    expect(c.pasos.find(p => p.key === 'compPatrim')).toMatchObject({ tipo: 'resta', importe: -400 })
    expect(c.pasos.find(p => p.key === 'compRend')).toMatchObject({ tipo: 'resta', importe: -50 })
    expect(c.base).toBe(150)
  })

  it('la base coincide siempre con la de la cuota y con la suma de los movimientos', () => {
    const casos = [
      { ganancias: 1000, perdidas: -300, rendimientos: 50, cf: cf({ netoAntes: 700, rendimientos: 50, netoDespues: 700 }) },
      { ganancias: 600, perdidas: -200, rendimientos: 200, cf: cf({ netoAntes: 400, rendimientos: 200, compensadoPatrim: 400, compensadoRend: 50, netoDespues: 0 }) },
      { ganancias: 100, perdidas: -400, rendimientos: 80, cf: cf({ netoAntes: -300, rendimientos: 80, perdida: 300, compensadoRend: 20, compensadoRendAnio: 20, netoDespues: 0 }) },
      { ganancias: 0, perdidas: -4, rendimientos: 40, cf: cf({ netoAntes: -4, rendimientos: 40, perdida: 4, compensadoRend: 10, compensadoRendAnio: 4, netoDespues: 0 }) },
      { ganancias: 100, perdidas: -400, rendimientos: 80 },
    ]
    for (const a of casos) {
      const c = cascadaCuota(a)
      expect(c.base).toBeCloseTo(baseTramosCompensada(a.cf, a.ganancias + a.perdidas, a.rendimientos), 10)
      // El extracto cuadra: los movimientos suman exactamente la base.
      const suma = c.pasos.filter(p => p.tipo !== 'total').reduce((t, p) => t + p.importe, 0)
      expect(suma).toBeCloseTo(c.base, 10)
    }
  })

  it('año en pérdidas (fase 1): la pérdida compensa el 25 % de los rendimientos del año y el resto pasa', () => {
    const d = cf({ netoAntes: -300, rendimientos: 80, perdida: 300, compensadoRend: 20, compensadoRendAnio: 20, compensado: 20, netoDespues: 0 })
    const c = cascadaCuota({ ganancias: 100, perdidas: -400, rendimientos: 80, cf: d })
    expect(keys(c)).toEqual(['ganancias', 'perdidas', 'neto', 'arrastre', 'rendimientos', 'compRendAnio', 'base'])
    expect(c.pasos.find(p => p.key === 'arrastre')).toMatchObject({ tipo: 'suma', importe: 300 })
    expect(c.pasos.find(p => p.key === 'arrastre')!.nota).toMatch(/el resto, 280,00\s€, pasa a los 4 ejercicios siguientes/)
    expect(c.pasos.find(p => p.key === 'compRendAnio')).toMatchObject({ tipo: 'resta', importe: -20 })
    expect(c.base).toBe(60)
  })

  it('el 25 % conjunto: separa la pérdida del año de las anteriores', () => {
    const d = cf({ netoAntes: -4, rendimientos: 40, perdida: 4, compensadoRend: 10, compensadoRendAnio: 4, compensado: 10, netoDespues: 0 })
    const c = cascadaCuota({ ganancias: 0, perdidas: -4, rendimientos: 40, cf: d })
    expect(c.pasos.find(p => p.key === 'compRendAnio')).toMatchObject({ importe: -4 })
    expect(c.pasos.find(p => p.key === 'compRend')).toMatchObject({ importe: -6 })
    expect(c.base).toBe(30)
  })

  it('sin datos de compensación: base = neto + rendimientos', () => {
    const c = cascadaCuota({ ganancias: 100, perdidas: -400, rendimientos: 80 })
    expect(keys(c)).toEqual(['ganancias', 'perdidas', 'neto', 'rendimientos', 'base'])
    expect(c.base).toBe(-220)
  })
})

describe('avanceAnio', () => {
  it('día N de 365 o 366', () => {
    expect(avanceAnio('2025-01-01')).toMatchObject({ dia: 1, dias: 365 })
    expect(avanceAnio('2025-12-31')).toMatchObject({ dia: 365, dias: 365, pct: 100 })
    expect(avanceAnio('2024-12-31')).toMatchObject({ dia: 366, dias: 366 })
    expect(avanceAnio('2026-11-09').dia).toBe(313)
  })
})
