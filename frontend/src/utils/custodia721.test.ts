import { describe, expect, it } from 'vitest'
import { agruparFilas, textoEstado, textoOrigen } from './custodia721'
import type { CustodiaWallet721 } from '../pages/fiscal/types'

// Datos sintéticos.
const hoy = { enEspana: null, entidad: null, origen: 'desconocido' as const, desde: null, filaId: null, regla: null }
const w = (walletId: string, filas: CustodiaWallet721['filas']): CustodiaWallet721 => ({ walletId, nombre: walletId, regla: null, hoy, filas })

describe('custodia721', () => {
  it('estado y origen en palabras', () => {
    expect(textoEstado(true)).toBe('En España: no computa')
    expect(textoEstado(false)).toBe('Fuera de España: computa')
    expect(textoEstado(null)).toBe('No se sabe: computa por prudencia')
    expect(textoOrigen('automatico', 'Binance')).toBe('Automático, según las condiciones de Binance')
    expect(textoOrigen('usuario', null)).toBe('Lo indicaste tú')
  })
  it('agrupa las filas iguales de varias subcuentas y las ordena por fecha', () => {
    const r = agruparFilas([
      w('a', [{ id: '1', walletId: 'a', desde: '2023-01-01', enEspana: false, entidad: null }, { id: '2', walletId: 'a', desde: null, enEspana: true, entidad: null }]),
      w('b', [{ id: '3', walletId: 'b', desde: '2023-01-01', enEspana: false, entidad: null }]),
    ])
    expect(r.map(f => [f.desde, f.ids, f.wallets])).toEqual([[null, ['2'], 1], ['2023-01-01', ['1', '3'], 2]])
  })
})
