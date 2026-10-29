import { describe, expect, it } from 'vitest'
import { balanceAsset, formatBalance, shortfallSummary, shortfallText } from './balanceFormat'

describe('saldo corrido — textos (#380)', () => {
  it('solo hay columna con un único activo filtrado', () => {
    expect(balanceAsset([])).toBeNull()
    expect(balanceAsset(['xrp'])).toBe('XRP')
    expect(balanceAsset(['XRP', 'BTC'])).toBeNull()
  })

  it('formatea la cantidad con su activo y los decimales de la app según su magnitud', () => {
    expect(formatBalance(3087.53005116, 'XRP')).toBe('3.087,53 XRP')
    expect(formatBalance(0.00012345, 'BTC')).toBe('0,00012345 BTC')
  })

  it('el aviso de hueco dice cuánto faltaba y por qué importa', () => {
    expect(shortfallText(62, 'XRP')).toBe('Faltaban 62 XRP: posible importación incompleta')
  })

  it('el resumen concuerda en número', () => {
    expect(shortfallSummary(1, 'XRP')).toBe('1 operación de XRP sin saldo suficiente')
    expect(shortfallSummary(3, 'XRP')).toBe('3 operaciones de XRP sin saldo suficiente')
  })
})
