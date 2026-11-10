import { describe, expect, it } from 'vitest'
import { datosCompletos, pasosEjercicio, progresoPasos, resumenEstado, tablaDiferencias } from './pasosDeclaracion'
import type { Declaracion } from '../api/portfolio'

// Estado de la declaración por pasos (#542). Datos sintéticos.
const d = (tipo: Declaracion['tipo'], p: Partial<Declaracion> = {}): Declaracion =>
  ({ ejercicio: 2025, tipo, declaradoEn: '2026-05-01T10:00:00.000Z', cifras: { neto: 100, cuota: 19, operaciones: 3 }, ...p })
const datosOk = { porRevisar: 0, preciosPendientes: [] }

describe('datosCompletos', () => {
  it('completos sin operaciones por revisar ni precios pendientes', () => {
    expect(datosCompletos(datosOk)).toBe(true)
    expect(datosCompletos({ porRevisar: 2, preciosPendientes: [] })).toBe(false)
    expect(datosCompletos({ porRevisar: 0, preciosPendientes: ['XYZ'] })).toBe(false)
  })
})

describe('pasosEjercicio', () => {
  it('sin marcas: datos completos y el resto pendiente', () => {
    expect(pasosEjercicio(2025, [], datosOk, null).map(p => `${p.id}:${p.estado}`))
      .toEqual(['datos:hecho', 'revision:pendiente', 'renta:pendiente', 'modelo721:pendiente'])
  })
  it('con marcas; «cambiado» si las cifras cambiaron después; solo las del ejercicio', () => {
    const decl = [d('revision'), d('renta', { cambios: [{ campo: 'neto', declarado: 100, actual: 150 }] }), d('renta', { ejercicio: 2024 })]
    const p = pasosEjercicio(2025, decl, { porRevisar: 1, preciosPendientes: [] }, true)
    expect(p.map(x => `${x.id}:${x.estado}`)).toEqual(['datos:pendiente', 'revision:hecho', 'renta:cambiado', 'modelo721:pendiente'])
    expect(p[2].marca?.ejercicio).toBe(2025)
  })
  it('721 sin obligación: no aplica, con su título, salvo que se marcara igualmente', () => {
    expect(pasosEjercicio(2025, [], datosOk, false)[3]).toMatchObject({ estado: 'no-aplica', titulo: 'Modelo 721: no obligatorio' })
    expect(pasosEjercicio(2025, [d('modelo721', { cifras: { valor: 1 } })], datosOk, false)[3].estado).toBe('hecho')
  })
})

describe('tablaDiferencias', () => {
  it('declarado, actual y diferencia por concepto, en el orden de las etiquetas', () => {
    const t = tablaDiferencias(d('renta', { cambios: [{ campo: 'neto', declarado: 100, actual: 150 }, { campo: 'cuota', declarado: 19, actual: 28.5 }] }))
    expect(t.map(f => f.campo)).toEqual(['neto', 'operaciones', 'cuota'])
    expect(t[0]).toMatchObject({ concepto: 'Neto', declarado: 100, actual: 150, diferencia: 50, cambia: true })
    expect(t[1]).toMatchObject({ actual: 3, diferencia: 0, cambia: false })
    expect(t[2].diferencia).toBeCloseTo(9.5, 9)
  })
})

describe('resumenEstado (Dashboard)', () => {
  it('una frase por estado, del mismo origen que los pasos', () => {
    expect(resumenEstado(2025, [])).toEqual({ texto: 'Pendiente de revisar y presentar', tono: 'warning' })
    expect(resumenEstado(2025, [d('revision')]).texto).toBe('Revisado, falta presentar la Renta')
    expect(resumenEstado(2025, [d('revision'), d('renta')])).toEqual({ texto: 'Renta presentada', tono: 'positive' })
    expect(resumenEstado(2025, [d('renta', { cambios: [{ campo: 'neto', declarado: 1, actual: 2 }] })]).tono).toBe('warning')
    expect(resumenEstado(2024, [d('renta')]).texto).toBe('Pendiente de revisar y presentar')
  })
})

describe('progresoPasos', () => {
  it('lo que no aplica queda fuera del recuento', () => {
    expect(progresoPasos(pasosEjercicio(2025, [d('revision')], datosOk, false))).toEqual({ hechos: 2, total: 3, completo: false })
    expect(progresoPasos(pasosEjercicio(2025, [d('revision'), d('renta')], datosOk, false))).toEqual({ hechos: 3, total: 3, completo: true })
    expect(progresoPasos(pasosEjercicio(2025, [], datosOk, true)).total).toBe(4)
  })
})
