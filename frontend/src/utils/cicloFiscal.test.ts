import { describe, expect, it } from 'vitest'
import { anilloPlazo, franjaPlazo, mesesCiclo, plazosDelMes, urgencia } from './cicloFiscal'
import type { FiscalHito } from '../api/portfolio'

// Línea del ciclo fiscal (#538). Datos sintéticos.
const h = (p: Partial<FiscalHito>): FiscalHito => ({
  id: 'renta', ejercicio: 2026, titulo: 'Renta de 2026', desde: '2027-04-08', hasta: '2027-06-30', inicioAproximado: true,
  estado: 'proximo', diasRestantes: 232, diasParaAbrir: 149, progreso: 0, ...p,
})
const ventana = { desde: '2026-11-01', hasta: '2028-04-30' }

describe('mesesCiclo', () => {
  it('18 meses desde el actual, con el año rotulado al empezar y en cada enero', () => {
    const m = mesesCiclo(ventana)
    expect(m).toHaveLength(18)
    expect(m[0]).toEqual({ clave: '2026-11', etiqueta: 'nov', anio: 2026, rotulaAnio: true })
    expect(m[2]).toMatchObject({ clave: '2027-01', rotulaAnio: true })
    expect(m[1].rotulaAnio).toBe(false)
    expect(m.at(-1)!.clave).toBe('2028-04')
  })
})

describe('franjaPlazo', () => {
  const m = mesesCiclo(ventana)
  it('cubre los meses del plazo', () => {
    expect(franjaPlazo(h({}), m)).toEqual({ inicio: 5, meses: 3 })
    expect(franjaPlazo({ desde: '2027-01-01', hasta: '2027-03-31' }, m)).toEqual({ inicio: 2, meses: 3 })
  })
  it('se recorta a la ventana por los dos lados', () => {
    expect(franjaPlazo({ desde: '2026-01-01', hasta: '2026-12-31' }, m)).toEqual({ inicio: 0, meses: 2 })
    expect(franjaPlazo({ desde: '2028-04-08', hasta: '2028-06-30' }, m)).toEqual({ inicio: 17, meses: 1 })
  })
  it('fuera de la ventana: nada', () => {
    expect(franjaPlazo({ desde: '2028-07-01', hasta: '2028-12-31' }, m)).toBeNull()
  })
})

describe('plazosDelMes', () => {
  it('los plazos que tocan el mes', () => {
    const ciclo = [h({}), h({ id: 'modelo721', desde: '2027-01-01', hasta: '2027-03-31' })]
    expect(plazosDelMes(ciclo, '2027-02').map(x => x.id)).toEqual(['modelo721'])
    expect(plazosDelMes(ciclo, '2027-04').map(x => x.id)).toEqual(['renta'])
    expect(plazosDelMes(ciclo, '2026-11')).toEqual([])
  })
})

describe('urgencia', () => {
  it('abierto: quedan N días, pronto a 30 y urgente a 7, siempre con texto', () => {
    expect(urgencia(h({ estado: 'en-curso', diasRestantes: 45 }))).toEqual({ nivel: 'normal', etiqueta: null, texto: 'Quedan 45 días' })
    expect(urgencia(h({ estado: 'en-curso', diasRestantes: 30 }))).toMatchObject({ nivel: 'pronto', etiqueta: 'Pronto', texto: 'Quedan 30 días' })
    expect(urgencia(h({ estado: 'en-curso', diasRestantes: 7 }))).toMatchObject({ nivel: 'urgente', etiqueta: 'Urgente' })
    expect(urgencia(h({ estado: 'en-curso', diasRestantes: 1 })).texto).toBe('Queda 1 día')
    expect(urgencia(h({ estado: 'en-curso', diasRestantes: 0 })).texto).toBe('Hoy es el último día')
  })
  it('sin abrir: cuándo abre; aproximado si la AEAT aún no lo ha publicado', () => {
    expect(urgencia(h({})).texto).toMatch(/^Abre hacia el 8 abr 2027$/)
    expect(urgencia(h({ inicioAproximado: false, diasParaAbrir: 40 })).texto).toBe('Abre en 40 días')
  })
  it('pasado: cerrado', () => {
    expect(urgencia(h({ estado: 'pasado' }))).toMatchObject({ nivel: 'cerrado' })
  })
})

describe('anilloPlazo', () => {
  it('abierto: días que quedan y lo transcurrido del plazo', () => {
    expect(anilloPlazo(h({ estado: 'en-curso', diasRestantes: 12, progreso: 80 }))).toEqual({ numero: 12, unidad: 'días', pct: 80 })
  })
  it('sin abrir: días para abrir, arco vacío', () => {
    expect(anilloPlazo(h({ diasParaAbrir: 1 }))).toEqual({ numero: 1, unidad: 'día para abrir', pct: 0 })
  })
})
