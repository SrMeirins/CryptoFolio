import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DepositRow } from './DepositRow'
import type { DepositReview } from './types'

// Fila de revisión de coste: la compra con fiat sin pago en el CSV (#435)
// explica qué precio indicar. Datos sintéticos.
const base: DepositReview = { txKey: 'k1', timestamp: '2024-01-10T10:00:00Z', asset: 'SINT', amount: 100, historicalPrice: 0.5 }
const render = (dep: DepositReview) =>
  renderToStaticMarkup(<DepositRow dep={dep} cost={undefined} reviewed={false} onSetCost={() => {}} resaltado={null} />)

describe('DepositRow, compra sin pago en el CSV (#435)', () => {
  it('una compra pide el precio pagado por unidad', () => {
    const html = render({ ...base, kind: 'compra' })
    expect(html).toContain('Compra con fiat sin el pago en el CSV')
    expect(html).toContain('EUR pagados / cantidad')
  })

  it('un depósito no muestra ese aviso', () => {
    expect(render({ ...base, kind: 'deposito' })).not.toContain('Compra con fiat')
    expect(render(base)).not.toContain('Compra con fiat')
  })
})
