import { describe, expect, it } from 'vitest'
import { etiquetaEje, fechasRacha, textoDias, tituloBarra } from './pnlPeriodoTexto'

describe('textos del periodo del P&L diario (#511)', () => {
  it('recuentos de días con y sin planos', () => {
    expect(textoDias({ verdes: 12, rojos: 8, planos: 0 })).toBe('12 días en verde y 8 en rojo')
    expect(textoDias({ verdes: 1, rojos: 0, planos: 1 })).toBe('1 día en verde, 0 en rojo y 1 plano')
  })
  it('fechas de la racha', () => {
    expect(fechasRacha({ desde: '2026-11-03', hasta: '2026-11-07' })).toBe('del 3 nov 2026 al 7 nov 2026')
    expect(fechasRacha({ desde: '2026-11-03', hasta: '2026-11-03' })).toBe('el 3 nov 2026')
  })
  it('eje y título por agrupación', () => {
    expect(etiquetaEje('2026-11-18', 'dia')).toBe('18 nov')
    expect(etiquetaEje('2026-11-01', 'mes')).toBe('nov 26')
    expect(tituloBarra({ key: '2026-11-18', desde: '2026-11-18', hasta: '2026-11-18' }, 'dia')).toBe('miércoles, 18 de noviembre de 2026')
    expect(tituloBarra({ key: '2026-11-16', desde: '2026-11-16', hasta: '2026-11-18' }, 'semana')).toBe('Semana del 16 nov 2026 al 18 nov 2026')
    expect(tituloBarra({ key: '2026-11-01', desde: '2026-11-02', hasta: '2026-11-18' }, 'mes')).toMatch(/^[Nn]oviembre de 2026$/)
  })
})
