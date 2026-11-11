import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChipCanal, ChipComision, IconoNota } from './NotaComision'
import { canalDePermuta, textoComision, textoNota, textoValoracion } from './textoComision'

// Canal y comisión informativos de la tabla de Operaciones (#543). Datos sintéticos.
const permuta = { tipo: 'BUY', activoRecibido: 'FTT' }

describe('canal y comisión de una permuta', () => {
  it('orden con comisión: chip de canal, chip con el importe exacto y texto completo', () => {
    const op = { ...permuta, canal: 'orden' as const, comisionCompraEur: 0.5 }
    expect(renderToStaticMarkup(<ChipCanal op={op} />)).toContain('>Orden<')
    expect(renderToStaticMarkup(<ChipComision op={op} />)).toContain('Comisión 0,50')
    expect(textoComision(op)).toContain('coste del FTT recibido')
    expect(textoNota(op)).toMatch(/^Orden de mercado: .+ Comisión de la compra: 0,50/)
  })
  it('Convert: canal sin importe de comisión', () => {
    const op = { ...permuta, canal: 'convert' as const, comisionCompraEur: 0 }
    expect(renderToStaticMarkup(<ChipCanal op={op} />)).toContain('>Convert<')
    expect(renderToStaticMarkup(<ChipComision op={op} />)).toBe('')
    expect(textoNota(op)).toContain('incluida en el tipo de cambio')
  })
  it('importaciones antiguas sin canal: Convert por las notas', () => {
    expect(canalDePermuta({ ...permuta, canal: null, esConvert: true })).toBe('convert')
  })
  it('una venta a EUR no es permuta: sin chip de canal', () => {
    const op = { tipo: 'SELL', activoRecibido: 'EUR', canal: 'orden' as const }
    expect(canalDePermuta(op)).toBeNull()
    expect(renderToStaticMarkup(<ChipCanal op={op} />)).toBe('')
  })
  it('el BNB pagado como comisión dentro de una orden no lleva canal', () => {
    expect(canalDePermuta({ tipo: 'SELL', activoRecibido: null, canal: 'orden' })).toBeNull()
  })
  it('compacta: un icono con el canal y la comisión en su nombre accesible', () => {
    const html = renderToStaticMarkup(<IconoNota op={{ ...permuta, canal: 'orden', comisionCompraEur: 0.5 }} />)
    expect(html).toContain('aria-label="Orden de mercado:')
    expect(renderToStaticMarkup(<IconoNota op={{ tipo: 'SELL', activoRecibido: 'EUR' }} />)).toBe('')
  })
})

describe('textoValoracion (#599)', () => {
  it('por el mayor: los dos valores y la diferencia', () => {
    const t = textoValoracion({ valoracion: 'mayor', valorEntregadoEur: 100, valorRecibidoEur: 110 })
    expect(t).toContain('art. 37.1.h')
    expect(t).toContain('100,00')
    expect(t).toContain('110,00')
    expect(t).toContain('10,0 %')
  })
  it('precio del día: se indica', () => {
    expect(textoValoracion({ valoracion: 'diario' })).toContain('precio del día')
  })
  it('precio del momento sin más, o sin dato: nada', () => {
    expect(textoValoracion({ valoracion: 'momento' })).toBeNull()
    expect(textoValoracion({})).toBeNull()
  })
})
