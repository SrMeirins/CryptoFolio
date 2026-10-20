import { describe, expect, it } from 'vitest'
import { firmaArchivo, pasoDeStage, puedeIrA, textoPendiente } from './wizard'

// Asistente de importación (#318). Datos sintéticos.
describe('pasos', () => {
  it('cada etapa en su paso', () => {
    expect(pasoDeStage('upload')).toBe('subir')
    expect(pasoDeStage('catalog')).toBe('revisar')
    expect(pasoDeStage('progress')).toBe('importar')
    expect(pasoDeStage('done')).toBe('listo')
  })
  it('solo se vuelve atrás, nunca mientras se importa; desde Listo, a Subir', () => {
    expect(puedeIrA('subir', 'revisar')).toBe(true)
    expect(puedeIrA('importar', 'revisar')).toBe(false)
    expect(puedeIrA('subir', 'importar')).toBe(false)
    expect(puedeIrA('revisar', 'listo')).toBe(false)
    expect(puedeIrA('subir', 'listo')).toBe(true)
  })
})

describe('firmaArchivo', () => {
  it('distingue archivos por nombre, tamaño y fecha', () => {
    expect(firmaArchivo({ name: 'a.csv', size: 10, lastModified: 1 })).not.toBe(firmaArchivo({ name: 'a.csv', size: 11, lastModified: 1 }))
  })
})


describe('textoPendiente', () => {
  it('lo que falta, con singular y plural', () => {
    expect(textoPendiente({ retiros: 3, depositos: 0, operaciones: 0 })).toBe('Faltan 3 retiros por asignar')
    expect(textoPendiente({ retiros: 1, depositos: 0, operaciones: 0 })).toBe('Falta 1 retiro por asignar')
    expect(textoPendiente({ retiros: 2, depositos: 1, operaciones: 1 })).toBe('Faltan 2 retiros por asignar, 1 depósito por valorar y 1 operación desconocida por catalogar')
    expect(textoPendiente({ retiros: 0, depositos: 0, operaciones: 0 })).toBeNull()
  })
})
