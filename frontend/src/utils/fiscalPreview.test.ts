import { describe, expect, it } from 'vitest'
import { preview721, previewCuota } from './fiscalPreview'
import { cuotaAhorro } from './fiscalHeader'
import { TRAMOS_DEFAULT } from './tramosIrpf'

// Vista previa de los ajustes fiscales (#451). Datos sintéticos.
describe('fiscalPreview', () => {
  it('la cuota prevista coincide con la que calcula Fiscal con los tipos nuevos', () => {
    const tipos = [20, 22, 23, 27, 30]
    const p = previewCuota(10_000, TRAMOS_DEFAULT, tipos)
    expect(p.antes).toBeCloseTo(cuotaAhorro(10_000, TRAMOS_DEFAULT).cuota, 9)
    expect(p.despues).toBeCloseTo(cuotaAhorro(10_000, TRAMOS_DEFAULT.map((t, i) => ({ ...t, tipo: tipos[i] }))).cuota, 9)
    // 6.000 al 20 % y 4.000 al 22 %, frente a 19 % y 21 %.
    expect(p.diferencia).toBeCloseTo(100, 6)
  })

  it('sin base no hay cuota ni diferencia', () => {
    expect(previewCuota(0, TRAMOS_DEFAULT, [50, 50, 50, 50, 50])).toEqual({ antes: 0, despues: 0, diferencia: 0 })
  })

  it('Modelo 721: obligado por encima del umbral; con precios pendientes, solo seguro si ya lo supera', () => {
    expect(preview721(60_000, 50_000, false)).toEqual({ obligado: true, seguro: true })
    expect(preview721(40_000, 50_000, false)).toEqual({ obligado: false, seguro: true })
    expect(preview721(40_000, 50_000, true)).toEqual({ obligado: false, seguro: false })
    expect(preview721(60_000, 50_000, true)).toEqual({ obligado: true, seguro: true })
  })
})
