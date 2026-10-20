import { describe, expect, it } from 'vitest'
import { cambiosDeDestino, comoTransaccion, destinosEfectivos } from './existentes'
import { txKey } from './withdrawalDestinationsHelpers'

// Retiros ya importados (#330). Datos sintéticos.
describe('existentes', () => {
  it('se agrupan como retiros con su id como clave', () => {
    const t = comoTransaccion({ id: 'u1', exchange: 'binance', timestamp: '2024-05-10T10:20:00.000Z', asset: 'XRP', amount: 10.2, account: 'Spot', destinoActual: '__external__',
      destino: { address: 'rSintetica', networkId: 'n', network: 'XRP Ledger', txHash: null } })
    expect(txKey(t)).toBe('u1')
    expect(t.destino?.address).toBe('rSintetica')
  })
  it('solo envía los destinos que cambian', () => {
    expect(cambiosDeDestino({ a: '__external__', b: '__external__', c: '' }, { a: '__external__', b: 'w1', c: '' })).toEqual({ b: 'w1' })
  })
  it('una dirección reconocida propone su wallet solo si sigue en externa o pendiente; lo elegido manda', () => {
    const actuales = { a: '__external__', b: '__gift__', c: '', d: '__external__' }
    const d = destinosEfectivos([{ ids: ['a', 'b', 'c'], wallet: 'w1' }, { ids: ['d'], wallet: null }], actuales, {})
    expect(d).toEqual({ a: 'w1', b: '__gift__', c: 'w1', d: '__external__' })
    expect(destinosEfectivos([{ ids: ['a'], wallet: 'w1' }], actuales, { a: '__lost__' })).toEqual({ a: '__lost__' })
  })
})
