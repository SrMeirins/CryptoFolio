import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { makeTx } from '../../test/fixtures/transaction'
import { FeeCell } from './FeeCell'

// Columna Fee con la comisión incluida en el coste (#415). Datos sintéticos.
const render = (over: Parameters<typeof makeTx>[0], verbose = false) =>
  renderToStaticMarkup(<FeeCell tx={makeTx(over)} currency="EUR" verbose={verbose} />)

describe('FeeCell, comisión incluida en el coste (#415)', () => {
  it('sin comisión de ningún tipo, un guion', () => {
    expect(render({})).toContain('—')
  })

  it('solo incluida: su importe atenuado con «en el coste»', () => {
    const html = render({ operation_type: 'BUY', included_fee_asset: 'EUR', included_fee_amount: '0.21' })
    expect(html).toMatch(/0,21\s€/)
    expect(html).toContain('en el coste')
    expect(html).not.toContain('—')
  })

  it('en el panel de detalle, texto largo', () => {
    expect(render({ operation_type: 'BUY', included_fee_asset: 'EUR', included_fee_amount: '0.21' }, true)).toContain('incluida en el coste')
  })

  it('en otra moneda se muestra en su activo', () => {
    expect(render({ operation_type: 'BUY', included_fee_asset: 'USDC', included_fee_amount: '0.5' })).toContain('USDC')
  })
})
