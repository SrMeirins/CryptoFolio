import { describe, expect, it } from 'vitest'
import { amountNetFor } from './manualTxData'

// Neto al editar (#378): editar sin cambiar la cantidad no altera el neto de
// una importada con la comisión descontada (antes se igualaba a la cantidad).
describe('amountNetFor (#378)', () => {
  const importada = { amount: '526.3', amount_net: '525.8' }

  it('misma cantidad (aunque llegue como número): conserva el neto guardado', () => {
    expect(amountNetFor('526.3', importada)).toBe('525.8')
    expect(amountNetFor(526.3, importada)).toBe('525.8')
  })

  it('cantidad cambiada: el neto es la cantidad, como al crear', () => {
    expect(amountNetFor(500, importada)).toBe(500)
  })

  it('sin original (alta) o sin cantidad', () => {
    expect(amountNetFor(10)).toBe(10)
    expect(amountNetFor(null, importada)).toBeNull()
    expect(amountNetFor('', importada)).toBeNull()
  })
})
