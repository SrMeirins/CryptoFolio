import { describe, expect, it } from 'vitest'
import { anadirASeleccion, exchangeDeCabecera, firmaLote, indicesAConfirmar, type ArchivoSel } from './lote'
import type { ArchivoLote } from './types'

// Lote de varios archivos (#326). Datos sintéticos.
const sel = (id: string, tipo: ArchivoSel['tipo'] = 'transacciones'): ArchivoSel => ({ id, file: new File([''], `${id}.csv`), tipo, exchange: null, forzado: null })
const arch = (indice: number, estado: ArchivoLote['estado']): ArchivoLote =>
  ({ indice, nombre: `${indice}.csv`, exchange: 'binance', reconocido: true, estado, motivo: null, nuevas: 0, duplicadas: 0, repetidasEnLote: 0, rango: null })

describe('lote', () => {
  it('reconoce el exchange por la cabecera', () => {
    expect(exchangeDeCabecera('\uFEFFUser ID,Time,Account,Operation,Coin,Change,Remark')).toBe('binance')
    expect(exchangeDeCabecera('ID de usuario,Tiempo,Cuenta,Operación,Moneda,Cambio,Observación')).toBe('binance')
    expect(exchangeDeCabecera('Timezone,Date,Time,Type,Currency,Amount')).toBe('bitvavo')
    expect(exchangeDeCabecera('a,b,c')).toBeNull()
  })

  it('añade sin repetir y respeta el máximo por tipo', () => {
    const r = anadirASeleccion([sel('a')], [sel('a'), sel('b'), sel('w', 'retiradas')])
    expect(r.seleccion.map(s => s.id)).toEqual(['a', 'b', 'w'])
    const lleno = Array.from({ length: 5 }, (_, i) => sel(`t${i}`))
    const r2 = anadirASeleccion(lleno, [sel('t5')])
    expect(r2.error).toMatch(/Como máximo 5/)
    expect(r2.seleccion).toHaveLength(5)
  })

  it('la firma no depende del orden', () => {
    expect(firmaLote([sel('a'), sel('b')])).toBe(firmaLote([sel('b'), sel('a')]))
  })

  it('confirma los archivos con novedades; si no hay, el primero reconocido', () => {
    expect(indicesAConfirmar([arch(0, 'sin_novedades'), arch(1, 'listo'), arch(2, 'no_reconocido'), arch(3, 'listo')])).toEqual([1, 3])
    expect(indicesAConfirmar([arch(0, 'no_reconocido'), arch(1, 'sin_novedades')])).toEqual([1])
    expect(indicesAConfirmar([arch(0, 'no_reconocido')])).toEqual([])
  })

  it('también confirma los archivos sin novedades que completan filas originales (#374)', () => {
    const completa = (i: number) => ({ ...arch(i, 'sin_novedades'), faltanOriginales: 3 })
    expect(indicesAConfirmar([completa(0), arch(1, 'sin_novedades'), completa(2)])).toEqual([0, 2])
    expect(indicesAConfirmar([arch(0, 'listo'), completa(1)])).toEqual([0, 1])
    expect(indicesAConfirmar([{ ...arch(0, 'no_reconocido'), faltanOriginales: 3 }])).toEqual([])
  })
})
