import { describe, expect, it } from 'vitest'
import { columnasVisibles, leerPreferencias } from './preferencias'

// Preferencias de la tabla de Operaciones (#543).
describe('leerPreferencias', () => {
  it('sin nada guardado: todas menos Cantidad y densidad cómoda', () => {
    expect(leerPreferencias(null)).toEqual({ columnas: ['tipo', 'clave', 'transmision', 'gastosTransmision', 'adquisicion', 'gastosAdquisicion', 'renta'], densidad: 'comoda' })
  })
  it('la antigua columna «gastos» pasa a las dos de la Renta', () => {
    expect(leerPreferencias(JSON.stringify({ columnas: ['gastos', 'renta'] })).columnas).toEqual(['gastosTransmision', 'gastosAdquisicion', 'renta'])
  })
  it('las columnas de gastos solo se ven si hay gastos de ese tipo, en su orden', () => {
    const v = columnasVisibles(['renta', 'gastosAdquisicion', 'gastosTransmision', 'transmision'], { gastosTransmision: false, gastosAdquisicion: true })
    expect([...v]).toEqual(['transmision', 'gastosAdquisicion', 'renta'])
  })
  it('lo guardado, descartando columnas desconocidas', () => {
    expect(leerPreferencias(JSON.stringify({ columnas: ['clave', 'otra', 'renta'], densidad: 'compacta' }))).toEqual({ columnas: ['clave', 'renta'], densidad: 'compacta' })
  })
  it('datos corruptos: lo de por defecto', () => {
    expect(leerPreferencias('{no es json').densidad).toBe('comoda')
    expect(leerPreferencias(JSON.stringify({ densidad: 'rara' })).densidad).toBe('comoda')
  })
})
