import { describe, expect, it } from 'vitest'
import { buildEventsCsv, EMPTY_FILTERS, filterEvents, isFiltered, recompraSummary, sortEvents, toneCounts } from './fiscalOperations'
import type { FiscalEvent } from '../pages/fiscal/types'

// Operaciones de Fiscal (#299). Datos sintéticos.
let n = 0
const ev = (p: Partial<FiscalEvent>): FiscalEvent => ({
  fecha: '2025-01-10', fechaHora: '2025-01-10T10:00:00.000Z', tipo: 'SELL', activoTransmitido: 'BTC', activoRecibido: 'EUR',
  cantidadTransmitida: 1, contrapartidaClave: 'F', contrapartidaDescripcion: 'Moneda de curso legal', valorTransmisionEur: 100,
  gastosTransmisionEur: 1, valorAdquisicionEur: 80, gastosAdquisicionEur: 0, gananciaPerdidaEur: 19, wallet: 'Binance Spot',
  txId: 't', eventId: `e${n++}`, permutaWrapStaking: false, lostSinMotivo: false, posiblePerdidaDiferida: false, ...p,
} as FiscalEvent)

const events = [
  ev({ fecha: '2025-01-05', fechaHora: '2025-01-05T09:00:00.000Z' }),
  ev({ tipo: 'BUY', activoTransmitido: 'USDC', activoRecibido: 'XRP', gananciaPerdidaEur: -0.4, posiblePerdidaDiferida: true, fecha: '2025-02-01', fechaHora: '2025-02-01T09:00:00.000Z' }),
  ev({ tipo: 'BUY', activoTransmitido: 'USDC', activoRecibido: 'ADA', gananciaPerdidaEur: -0.2, posiblePerdidaDiferida: true, fecha: '2025-03-01', fechaHora: '2025-03-01T09:00:00.000Z' }),
  ev({ tipo: 'FEE_EXCHANGE', activoTransmitido: 'BNB', activoRecibido: null, gananciaPerdidaEur: 0.001, wallet: 'Binance Funding', fecha: '2025-03-02', fechaHora: '2025-03-02T09:00:00.000Z' }),
  ev({ tipo: 'LOST', activoTransmitido: 'LUNC', activoRecibido: null, gananciaPerdidaEur: -50, lostSinMotivo: true, fecha: '2025-04-01', fechaHora: '2025-04-01T09:00:00.000Z' }),
]

describe('filterEvents', () => {
  it('sin filtros devuelve todo', () => {
    expect(filterEvents(events, EMPTY_FILTERS)).toHaveLength(5)
    expect(isFiltered(EMPTY_FILTERS)).toBe(false)
  })
  it('por tipo, aviso, recompra, resultado y fechas', () => {
    expect(filterEvents(events, { ...EMPTY_FILTERS, tones: ['swap'] })).toHaveLength(2)
    expect(filterEvents(events, { ...EMPTY_FILTERS, tones: ['fee', 'loss'] }).map(e => e.tipo)).toEqual(['FEE_EXCHANGE', 'LOST'])
    expect(filterEvents(events, { ...EMPTY_FILTERS, onlyWarnings: true })).toHaveLength(3)
    expect(filterEvents(events, { ...EMPTY_FILTERS, onlyRecompra: true })).toHaveLength(2)
    expect(filterEvents(events, { ...EMPTY_FILTERS, result: 'gain' })).toHaveLength(1) // la comisión de 0,001 € no cuenta
    expect(filterEvents(events, { ...EMPTY_FILTERS, from: '2025-02-01', to: '2025-03-01' })).toHaveLength(2)
  })
  it('búsqueda por activo, wallet y clave, sin distinguir mayúsculas', () => {
    expect(filterEvents(events, { ...EMPTY_FILTERS, search: 'xrp' })).toHaveLength(1)
    expect(filterEvents(events, { ...EMPTY_FILTERS, search: 'funding' })).toHaveLength(1)
    expect(filterEvents(events, { ...EMPTY_FILTERS, search: '  ' })).toHaveLength(5)
  })
})

describe('sortEvents', () => {
  it('por fecha exacta y por G/P', () => {
    expect(sortEvents(events, 'fecha', 'desc')[0].tipo).toBe('LOST')
    expect(sortEvents(events, 'gananciaPerdidaEur', 'asc')[0].activoTransmitido).toBe('LUNC')
  })
})

describe('toneCounts y recompraSummary', () => {
  it('recuento por tipo en el orden de los chips', () => {
    expect(toneCounts(events).map(t => `${t.label}:${t.count}`)).toEqual(['Venta:1', 'Permuta:2', 'Comisión:1', 'Pérdida:1'])
  })
  it('recompras del año: número, importe y activos principales', () => {
    const r = recompraSummary(events)
    expect(r.count).toBe(2)
    expect(r.amount).toBeCloseTo(-0.6, 9)
    expect(r.topAssets).toEqual([{ asset: 'USDC', count: 2 }])
  })
})

describe('buildEventsCsv', () => {
  it('cabecera, separador «;» y cantidades sin notación científica', () => {
    const csv = buildEventsCsv([ev({ cantidadTransmitida: 0.00000229 })]).split('\n')
    expect(csv[0].split(';')).toHaveLength(14)
    expect(csv[1]).toContain(';0.00000229;')
    expect(csv[1]).toContain(';Venta;')
  })
  it('neutraliza fórmulas y separadores en los campos de texto', () => {
    const line = buildEventsCsv([ev({ wallet: '=HYPERLINK("http://x")', activoTransmitido: 'A;B' })]).split('\n')[1]
    expect(line).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(line).toContain('"A;B"')
  })
})
