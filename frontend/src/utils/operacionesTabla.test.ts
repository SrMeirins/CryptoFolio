import { describe, expect, it } from 'vitest'
import { agruparOperaciones, filasTabla, hayGastos, parTexto, resumenTabla, sinEfecto } from './operacionesTabla'
import type { FiscalEvent } from '../pages/fiscal/types'

// Tabla de Operaciones (#543). Datos sintéticos.
let n = 0
const ev = (p: Partial<FiscalEvent>): FiscalEvent => ({
  fecha: '2025-03-01', tipo: 'SELL', activoTransmitido: 'AAA', activoRecibido: 'EUR', cantidadTransmitida: 1,
  contrapartidaClave: 'F', contrapartidaDescripcion: '', valorTransmisionEur: 100, gastosTransmisionEur: 0,
  valorAdquisicionEur: 80, gastosAdquisicionEur: 0, gananciaPerdidaEur: 20, wallet: 'W', txId: `t${++n}`, eventId: `e${n}`, ...p,
})

describe('agruparOperaciones', () => {
  it('una fila por operación: suma sus lotes y los ordena por fecha de compra', () => {
    const ops = agruparOperaciones([
      ev({ txId: 'v', fechaAdquisicion: '2024-02-01', gananciaPerdidaEur: 50, cantidadTransmitida: 1, gastosTransmisionEur: 1.5 }),
      ev({ txId: 'v', fechaAdquisicion: '2024-01-01', gananciaPerdidaEur: -10, cantidadTransmitida: 2, gastosTransmisionEur: 1.5, posiblePerdidaDiferida: true }),
      ev({ txId: 'w' }),
    ])
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ txId: 'v', cantidadTransmitida: 3, gananciaPerdidaEur: 40, gastosTransmisionEur: 3, posiblePerdidaDiferida: true })
    expect(ops[0].lotes.map(l => l.fechaAdquisicion)).toEqual(['2024-01-01', '2024-02-01'])
  })
  it('separa por activo: la comisión en BNB de una compra es otra operación de la misma transacción', () => {
    const ops = agruparOperaciones([
      ev({ txId: 'c', activoTransmitido: 'USDT', cantidadTransmitida: 100, comisionCompraEur: 0.3 }),
      ev({ txId: 'c', activoTransmitido: 'BNB', cantidadTransmitida: 0.01 }),
      ev({ txId: 'c', activoTransmitido: 'USDT', cantidadTransmitida: 50, comisionCompraEur: 0.15 }),
    ])
    expect(ops.map(o => [o.activoTransmitido, o.cantidadTransmitida, o.lotes.length])).toEqual([['USDT', 150, 2], ['BNB', 0.01, 1]])
    expect(new Set(ops.map(o => o.eventId)).size).toBe(2)
    expect(ops[0].comisionCompraEur).toBeCloseTo(0.45, 9)
    expect(ops[1].comisionCompraEur).toBe(0)
  })
  it('la suma de las operaciones es la de los eventos (cuadra con el neto)', () => {
    const events = [ev({ txId: 'a', gananciaPerdidaEur: 10 }), ev({ txId: 'a', gananciaPerdidaEur: -4 }), ev({ txId: 'b', gananciaPerdidaEur: 7 })]
    expect(agruparOperaciones(events).reduce((t, o) => t + (o.gananciaPerdidaEur ?? 0), 0)).toBe(13)
  })
})

describe('sinEfecto y par', () => {
  it('sin efecto: resultado y valor de transmisión a cero', () => {
    expect(sinEfecto({ gananciaPerdidaEur: 0, valorTransmisionEur: 0 })).toBe(true)
    expect(sinEfecto({ gananciaPerdidaEur: 0, valorTransmisionEur: 5 })).toBe(false)
  })
  it('«AAA por EUR»; sin contrapartida, el destino', () => {
    expect(parTexto({ activoTransmitido: 'BTC', activoRecibido: 'EUR', tipo: 'SELL' })).toBe('BTC por EUR')
    expect(parTexto({ activoTransmitido: 'BNB', activoRecibido: null, tipo: 'FEE_EXCHANGE' })).toBe('BNB en comisión')
    expect(parTexto({ activoTransmitido: 'USDT', activoRecibido: null, tipo: 'MARGIN_REPAY' })).toBe('USDT en margen')
  })
})

describe('filasTabla: microoperaciones', () => {
  const ops = agruparOperaciones([
    ev({ txId: 'grande', valorTransmisionEur: 500 }),
    ev({ txId: 'm1', activoTransmitido: 'BNB', valorTransmisionEur: 0.2, gananciaPerdidaEur: 0.01 }),
    ev({ txId: 'm2', activoTransmitido: 'BNB', valorTransmisionEur: 0.3, gananciaPerdidaEur: -0.02 }),
    ev({ txId: 'sola', activoTransmitido: 'XRP', valorTransmisionEur: 0.5 }),
    ev({ txId: 'otroDia', fecha: '2025-03-02', activoTransmitido: 'BNB', valorTransmisionEur: 0.1 }),
  ])
  it('agrupa las de menos de 1 € del mismo día y activo (dos o más), en el lugar de la primera', () => {
    const f = filasTabla(ops)
    expect(f.map(x => (x.tipo === 'micro' ? `micro:${x.grupo.activo}:${x.grupo.operaciones.length}` : x.op.txId)))
      .toEqual(['grande', 'micro:BNB:2', 'sola', 'otroDia'])
    const g = f[1].tipo === 'micro' ? f[1].grupo : null
    expect(g?.valorTransmisionEur).toBeCloseTo(0.5, 9)
    expect(g?.gananciaPerdidaEur).toBeCloseTo(-0.01, 9)
  })
  it('con otro umbral cambia lo que se agrupa', () => {
    expect(filasTabla(ops, 0.25).filter(x => x.tipo === 'micro')).toHaveLength(0)
  })
})

describe('gastos y resumen', () => {
  it('cada columna de gastos solo si alguna operación tiene gastos de ese tipo', () => {
    expect(hayGastos(agruparOperaciones([ev({})]))).toEqual({ gastosTransmision: false, gastosAdquisicion: false })
    expect(hayGastos(agruparOperaciones([ev({ gastosAdquisicionEur: 0.4 })]))).toEqual({ gastosTransmision: false, gastosAdquisicion: true })
    expect(hayGastos(agruparOperaciones([ev({ gastosTransmisionEur: 1 })]))).toEqual({ gastosTransmision: true, gastosAdquisicion: false })
  })
  it('ganancias, pérdidas y diferidas por recompra', () => {
    const r = resumenTabla(agruparOperaciones([ev({ gananciaPerdidaEur: 30 }), ev({ gananciaPerdidaEur: -10, posiblePerdidaDiferida: true }), ev({ gananciaPerdidaEur: -5 })]))
    expect(r).toEqual({ ganancias: 30, perdidas: -15, neto: 15, diferidas: -10, nDiferidas: 1 })
  })
})
