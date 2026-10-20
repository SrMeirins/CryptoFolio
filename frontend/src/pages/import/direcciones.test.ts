import { describe, expect, it } from 'vitest'
import { abreviarDireccion, agruparPorDireccion, esCabeceraRetiradas, normalizarDireccion, urlExplorador, walletsPorDireccion } from './direcciones'
import type { PreviewTransaction } from './types'

// Direcciones de retiro en la revisión (#320). Datos sintéticos.
const EVM = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'
const tx = (hash: string, address: string | null, iso = '2024-03-01T10:00:00Z', networkId: string | null = 'n-xrp'): PreviewTransaction => ({
  operationType: 'WITHDRAW', timestamp: iso, asset: 'XRP', amount: 1, amountNet: 1, account: 'Spot', subTradeCount: 1, rawRowHashes: [hash],
  ...(address ? { destino: { address, networkId, network: networkId ? 'XRP Ledger' : null, txHash: null } } : {}),
})

describe('direcciones', () => {
  it('normaliza EVM sin mayúsculas y deja el resto igual', () => {
    expect(normalizarDireccion(EVM)).toBe(EVM.toLowerCase())
    expect(normalizarDireccion('rAbCSintetica')).toBe('rAbCSintetica')
  })

  it('abrevia las largas y deja las cortas', () => {
    expect(abreviarDireccion('rSinteticaLarga123456')).toBe('rSinte…3456')
    expect(abreviarDireccion('0.0.1234')).toBe('0.0.1234')
  })

  it('el explorador solo admite https y codifica el valor', () => {
    expect(urlExplorador('https://livenet.xrpl.org/accounts/{address}', '{address}', 'rSintetica')).toBe('https://livenet.xrpl.org/accounts/rSintetica')
    expect(urlExplorador('https://x.org/tx/{tx_hash}', '{tx_hash}', 'a/../b?c')).toBe('https://x.org/tx/a%2F..%2Fb%3Fc')
    expect(urlExplorador('javascript:alert(1)//{address}', '{address}', 'r')).toBeNull()
    expect(urlExplorador('https://x.org/', '{address}', 'r')).toBeNull()
    expect(urlExplorador(null, '{address}', 'r')).toBeNull()
  })

  it('agrupa por dirección canónica (EVM con distinto caso juntas) y separa los retiros sin dirección', () => {
    const { grupos, sinDireccion } = agruparPorDireccion([
      tx('a', EVM, '2024-03-02T00:00:00Z', null),
      tx('b', EVM.toLowerCase(), '2024-03-03T00:00:00Z', 'n-eth'),
      tx('c', 'rSintetica1234', '2024-03-01T00:00:00Z'),
      tx('d', null),
    ])
    expect(grupos.map(g => g.txs.length)).toEqual([1, 2])
    expect(grupos[1]).toMatchObject({ clave: EVM.toLowerCase(), networkId: 'n-eth' })
    expect(sinDireccion.map(t => t.rawRowHashes?.[0])).toEqual(['d'])
  })

  it('reconoce direcciones guardadas en wallets propias, nunca en exchanges', () => {
    const m = walletsPorDireccion([
      { id: 'w1', name: 'Ledger', color: '#111111', type: 'hardware', addresses: [{ address: EVM } as never] },
      { id: 'w2', name: 'Binance', color: '#222222', type: 'exchange', addresses: [{ address: 'rSintetica1234' } as never] },
    ])
    expect(m.get(EVM.toLowerCase())?.name).toBe('Ledger')
    expect(m.has('rSintetica1234')).toBe(false)
  })

  it('distingue el historial de retiradas por su cabecera', () => {
    expect(esCabeceraRetiradas('\uFEFFTime,Coin,Network,Amount,Fee,Address,TXID,Status')).toBe(true)
    expect(esCabeceraRetiradas('User ID,Time,Account,Operation,Coin,Change,Remark')).toBe(false)
  })
})
