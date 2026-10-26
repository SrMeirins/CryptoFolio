import { describe, expect, it } from 'vitest'
import { amountNetFor, editFormType, savedOperationType } from './manualTxData'

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

// Editar importadas sin formulario propio (#394): BUY y SELL usan el
// equivalente del catálogo y al guardar conservan su tipo.
describe('editFormType y savedOperationType (#394)', () => {
  const tx = (operation_type: string, cost_asset: string | null) => ({ operation_type, cost_asset })

  it('BUY y SELL con EUR o sin contrapartida: formulario de EUR', () => {
    expect(editFormType(tx('BUY', 'EUR'))).toBe('BUY_FIAT')
    expect(editFormType(tx('BUY', 'eur'))).toBe('BUY_FIAT')
    expect(editFormType(tx('BUY', null))).toBe('BUY_FIAT')
    expect(editFormType(tx('SELL', 'EUR'))).toBe('SELL_FIAT')
  })

  it('con otra contrapartida (también otra divisa): formulario de cripto', () => {
    expect(editFormType(tx('BUY', 'USDT'))).toBe('BUY_CRYPTO')
    expect(editFormType(tx('BUY', 'USD'))).toBe('BUY_CRYPTO')
    expect(editFormType(tx('SELL', 'USDC'))).toBe('SELL_CRYPTO')
  })

  it('el resto de tipos se editan con su propio formulario', () => {
    expect(editFormType(tx('BUY_CRYPTO', 'USDT'))).toBe('BUY_CRYPTO')
    expect(editFormType(tx('MARGIN_BORROW', null))).toBe('MARGIN_BORROW')
  })

  it('con el formulario equivalente se guarda el tipo original', () => {
    expect(savedOperationType('BUY_CRYPTO', tx('BUY', 'USDT'))).toBe('BUY')
    expect(savedOperationType('SELL_FIAT', tx('SELL', 'EUR'))).toBe('SELL')
  })

  it('si se elige otro tipo, o al crear, se guarda el elegido', () => {
    expect(savedOperationType('BUY_FIAT', tx('BUY', 'USDT'))).toBe('BUY_FIAT')
    expect(savedOperationType('AIRDROP', tx('BUY', 'EUR'))).toBe('AIRDROP')
    expect(savedOperationType('BUY_FIAT')).toBe('BUY_FIAT')
  })
})
