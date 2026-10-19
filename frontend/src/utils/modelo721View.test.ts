import { describe, expect, it } from 'vitest'
import { buildModelo721Csv, liveModelo721, margenUmbral, modelo721View } from './modelo721View'
import type { Modelo721, Modelo721Activo } from '../pages/fiscal/types'

// Modelo 721 (#303). Datos sintéticos.
const act = (asset: string, wallet: string, kind: string, valor: number, extra: Partial<Modelo721Activo> = {}): Modelo721Activo => ({
  asset, wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: kind,
  quantity: 2, costBasisEur: 0, precioEur: valor / 2, valorEur: valor, sinPrecio: false, ...extra,
})

const activos = [
  act('BTC', 'spot', 'exchange', 30_000),
  act('ETH', 'spot', 'exchange', 5_000),
  act('ADA', 'fund', 'exchange', 1_000),
  act('XRP', 'ledger', 'hardware', 20_000),
  act('NEW', 'fund', 'exchange', 0, { sinPrecio: true }),
]

describe('modelo721View', () => {
  const v = modelo721View(activos)
  it('agrupa por exchange de mayor a menor y resume la autocustodia', () => {
    expect(v.exchanges.map(g => `${g.name}:${g.valor}`)).toEqual(['W spot:35000', 'W fund:1000'])
    expect(v.exchanges[0].activos.map(a => a.asset)).toEqual(['BTC', 'ETH'])
    expect(v.exchanges[1].sinPrecio).toBe(1)
    expect(v.autocustodia).toEqual({ valor: 20_000, activos: 1, wallets: 1 })
  })
  it('la suma de los exchanges es el total en custodia de terceros', () => {
    expect(v.totalExchanges).toBe(36_000)
  })
  it('margen hasta el umbral', () => {
    expect(margenUmbral({ totalValorCustodia: 36_000, umbral: 50_000 })).toBe(14_000)
    expect(margenUmbral({ totalValorCustodia: 60_000, umbral: 50_000 })).toBe(-10_000)
  })
})

describe('buildModelo721Csv', () => {
  const base = { year: 2025, esAnioEnCurso: false, fecha: '2025-12-31', totalValor: 0, totalValorCustodia: 0, superaUmbral: false, umbral: 50_000, preciosPendientes: [], incompleto: false, aviso: '' } as Omit<Modelo721, 'activos'>
  it('solo exchanges, con la fecha de valoración', () => {
    const lines = buildModelo721Csv({ ...base, activos }).split('\n')
    expect(lines).toHaveLength(1 + 4)
    expect(lines[1]).toBe('2025-12-31;W spot;BTC;2;15000;30000.00;')
    expect(lines.some(l => l.includes('XRP'))).toBe(false)
    expect(lines.find(l => l.includes(';NEW;'))?.endsWith(';sí')).toBe(true)
  })
  it('neutraliza fórmulas en los nombres', () => {
    const csv = buildModelo721Csv({ ...base, activos: [act('BTC', 'x', 'exchange', 10, { wallet_name: '=cmd|calc' })] })
    expect(csv.split('\n')[1]).toContain(";'=cmd|calc;")
  })
})

describe('liveModelo721', () => {
  const data = { year: 2026, esAnioEnCurso: true, fecha: '2026-10-19', activos, totalValor: 56_000, totalValorCustodia: 36_000, superaUmbral: false, umbral: 50_000, preciosPendientes: ['NEW'], incompleto: true, aviso: '' } as Modelo721
  it('revalora con el precio en vivo y recalcula totales y estado', () => {
    const live = liveModelo721(data, { BTC: 25_000, XRP: 12_000, NEW: 3 })
    expect(live.activos.find(a => a.asset === 'BTC')?.valorEur).toBe(50_000)
    expect(live.totalValorCustodia).toBe(50_000 + 5_000 + 1_000 + 6)
    expect(live.totalValor).toBe(live.totalValorCustodia + 24_000)
    expect(live.superaUmbral).toBe(true)
    expect(live.incompleto).toBe(false)
  })
  it('sin precio en vivo se mantiene la valoración del backend', () => {
    expect(liveModelo721(data, {})).toBe(data)
    expect(liveModelo721(data, { ETH: 0 })).toBe(data)
  })
  it('los años cerrados no se tocan', () => {
    const closed = { ...data, esAnioEnCurso: false }
    expect(liveModelo721(closed, { BTC: 1 })).toBe(closed)
  })
})
