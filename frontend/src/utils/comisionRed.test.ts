import { describe, expect, it } from 'vitest'
import { comisionRedCriterio, mensajeCambioComisionRed } from './comisionRed'

// Criterio de la comisión de red (#532). Datos sintéticos.
describe('comisionRedCriterio', () => {
  it('por defecto transmisión; solo «coste» cambia el criterio', () => {
    expect(comisionRedCriterio(undefined)).toBe('transmision')
    expect(comisionRedCriterio({})).toBe('transmision')
    expect(comisionRedCriterio({ fifo_comision_red_traspaso: 'otro' })).toBe('transmision')
    expect(comisionRedCriterio({ fifo_comision_red_traspaso: 'coste' })).toBe('coste')
  })
})

describe('mensajeCambioComisionRed', () => {
  it('explica el cambio y avisa de los ejercicios declarados', () => {
    const m = mensajeCambioComisionRed('coste', [2023, 2024])
    expect(m).toContain('su coste pasará a las unidades que llegan')
    expect(m).toContain('Se recalculará el FIFO.')
    expect(m).toContain('declarados los ejercicios 2023, 2024')
  })
  it('sin ejercicios declarados no menciona ninguno', () => {
    const m = mensajeCambioComisionRed('transmision', [])
    expect(m).toContain('volverán a contar como transmisión')
    expect(m).not.toContain('declarad')
  })
  it('un solo ejercicio en singular', () => {
    expect(mensajeCambioComisionRed('coste', [2025])).toContain('declarado el ejercicio 2025')
  })
})
