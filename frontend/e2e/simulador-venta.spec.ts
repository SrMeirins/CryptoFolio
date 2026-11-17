import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Simulador de venta (#529): «Qué vendes» y «Qué recibes» con la cascada que
// suma el neto en mano, curva con punto que se mueve con flechas, escenarios,
// campos en formato español, avisos con enlaces y «Copiar resumen» sin datos
// de otras wallets. Lotes, precios y simulación se interceptan con datos
// sintéticos: la base de datos no se toca.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const W1 = '00000000-0000-4000-8000-000000000001'
const W2 = '00000000-0000-4000-8000-000000000002'

const lote = (id: string, wallet: string, nombre: string, fecha: string, qty: number, precio: number) => ({
  lot_id: id, wallet_id: wallet, wallet_name: nombre, wallet_color: '#3b82f6', wallet_kind: 'exchange', opened_at: fecha,
  quantity_original: String(qty), quantity_remaining: String(qty), price_per_unit_eur: String(precio),
  cost_basis_eur: String(qty * precio), usd_per_eur: null, source_type: 'BUY',
})

function simulacion(asset: string, quantity: number, priceEur: number, feePct: number) {
  const totalProceeds = quantity * priceEur
  const totalFee = totalProceeds * (feePct / 100)
  const totalCostBasis = quantity * 1
  const netGainLoss = Math.round((totalProceeds - totalFee - totalCostBasis) * 100) / 100
  const marginal = Math.round(Math.max(0, netGainLoss) * 0.19 * 100) / 100
  return {
    asset, quantity, priceEur, feePct, walletId: W1,
    wallets: [{ walletId: W1, walletName: 'Wallet de venta', quantity: 100 }, { walletId: W2, walletName: 'Wallet ajena', quantity: 50 }],
    totalProceeds, totalFee, netProceeds: totalProceeds - totalFee, totalCostBasis,
    totalGain: Math.max(0, netGainLoss), totalLoss: Math.min(0, netGainLoss), netGainLoss,
    irpfEstimate: marginal,
    irpf: { year: 2026, baseAntes: 500, baseDespues: 500 + netGainLoss, marginal, desglose: [{ tipo: 19, desde: 0, hasta: 6000, base: Math.max(0, netGainLoss), cuota: marginal }] },
    recompra: { aviso: true, comprasRecientes: ['2026-10-03'] },
    netoEnMano: totalProceeds - totalFee - marginal, resultadoNeto: netGainLoss - marginal,
    lotsConsumed: [
      { lotId: 'a', walletName: 'Wallet ajena', openedAt: '2024-03-01', qtyAvailable: 50, qtyConsumed: Math.min(50, quantity), costBasisConsumed: Math.min(50, quantity), pricePerUnit: 1, proceedsEur: 0, feeEur: 0, partial: false, gainLossEur: 1 },
      ...(quantity > 50 ? [{ lotId: 'b', walletName: 'Wallet de venta', openedAt: '2024-06-01', qtyAvailable: 100, qtyConsumed: quantity - 50, costBasisConsumed: quantity - 50, pricePerUnit: 1, proceedsEur: 0, feeEur: 0, partial: quantity < 150, gainLossEur: 1 }] : []),
    ],
  }
}

async function preparar(page: Page) {
  const peticiones: Array<Record<string, number | string>> = []
  const posiciones = await (await page.request.get('/api/fifo/lots')).json() as Array<{ asset: string }>
  test.skip(posiciones.length === 0, 'Sin posiciones abiertas')
  // Precio en vivo sintético (sin mercado en CI): 2 € para todo.
  await page.route('**/api/prices/live', route => route.fulfill({ json: Object.fromEntries(posiciones.map(p => [p.asset, 2])) }))
  // Sin el WebSocket de precios: el precio sintético no se sustituye por el real.
  await page.routeWebSocket(/.*/, () => { /* sin conexión */ })
  await page.route('**/api/v1/fifo/lots/*', route => {
    const asset = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    return route.fulfill({ json: { asset, lots: [
      lote('a', W2, 'Wallet ajena', '2024-03-01T10:00:00Z', 50, 1),
      lote('b', W1, 'Wallet de venta', '2024-06-01T10:00:00Z', 100, 1),
    ] } })
  })
  await page.route('**/api/fiscal/simulate-sale', async route => {
    const b = route.request().postDataJSON() as { asset: string; quantity: number; priceEur: number; feePct?: number }
    peticiones.push(b)
    await route.fulfill({ json: simulacion(b.asset, b.quantity, b.priceEur, b.feePct ?? 0) })
  })
  await page.route('**/api/fiscal/simulate-sale/curve', async route => {
    const b = route.request().postDataJSON() as { quantity: number; prices: number[]; feePct?: number }
    await route.fulfill({ json: { quantity: b.quantity, points: b.prices.map(p => {
      const s = simulacion('X', b.quantity, p, b.feePct ?? 0)
      return { price: p, netGainLoss: s.netGainLoss, irpf: s.irpf.marginal, netoEnMano: s.netoEnMano, resultadoNeto: s.resultadoNeto }
    }) } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por activo' }).click()
  const boton = page.locator('tbody tr[data-row-key]').getByRole('button', { name: /^Simular venta de / }).first()
  await boton.waitFor({ timeout: 15_000 })
  await boton.click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByTestId('cascada')).toBeVisible({ timeout: 10_000 })
  return { dialogo, peticiones }
}

const centimos = async (page: Page) => (await page.getByTestId('cascada').locator('[data-cents]').evaluateAll(els => els.map(e => Number(e.getAttribute('data-cents')))))

test('la cascada suma exactamente el neto en mano y no repite cifras', async ({ page }) => {
  const { dialogo } = await preparar(page)
  const [importe, comision, irpf, neto] = await centimos(page)
  expect(neto).toBe(importe - comision - irpf)
  await expect(dialogo.getByRole('heading', { name: 'Qué vendes' })).toBeVisible()
  await expect(dialogo.getByRole('heading', { name: 'Qué recibes' })).toBeVisible()
  // Línea temporal: una fila por lote con chips de coste y resultado (con texto, no solo color).
  const filas = dialogo.getByTestId('tramo-lote')
  await expect(filas).toHaveCount(2)
  await expect(filas.first()).toContainText('coste')
  await expect(filas.first()).toContainText(/gana|pierde|resultado/)
  // El cálculo por tramos se despliega bajo la línea del IRPF.
  await dialogo.getByRole('button', { name: 'Ver el cálculo por tramos' }).click()
  await expect(dialogo.getByText(/^Base del ahorro de 2026/)).toBeVisible()
})

test('el punto de la curva se mueve con las flechas y fija el precio', async ({ page }) => {
  const { dialogo } = await preparar(page)
  const precio = dialogo.getByLabel('Precio de venta (€/ud.)')
  await expect(precio).toHaveValue('2,00')
  const curva = dialogo.getByRole('slider', { name: 'Precio de venta en la curva del resultado' })
  await curva.focus()
  await page.keyboard.press('ArrowRight')
  await expect(precio).toHaveValue('2,02')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(precio).toHaveValue('1,82')
  await page.keyboard.press('Home')
  await expect(precio).toHaveValue('2,00')
  await expect(curva).toHaveAttribute('aria-valuetext', /^Precio de venta 2,00/)
  // Escenarios: -10 % fija el precio.
  await dialogo.getByRole('button', { name: /^-10 %/ }).click()
  await expect(precio).toHaveValue('1,80')
})

test('campos en formato español: coma decimal y error con texto', async ({ page }) => {
  const { dialogo, peticiones } = await preparar(page)
  const precio = dialogo.getByLabel('Precio de venta (€/ud.)')
  await precio.fill('2,5')
  await precio.blur()
  await expect(precio).toHaveValue('2,50')
  await expect.poll(() => peticiones.at(-1)?.priceEur).toBe(2.5)
  await precio.fill('abc')
  await expect(dialogo.getByRole('alert').filter({ hasText: 'Escribe un precio válido' })).toBeVisible()
  await expect(precio).toHaveAttribute('aria-invalid', 'true')
})

test('avisos de recompra y del ejercicio con fechas y enlaces', async ({ page }) => {
  const { dialogo } = await preparar(page)
  await expect(dialogo.getByText(/Compraste .+ el 3 oct 2026/)).toBeVisible()
  await expect(dialogo.getByRole('link', { name: /^Ver las compras de .+ en Historial$/ })).toHaveAttribute('href', /\/history\?buscar=/)
  await expect(dialogo.getByText(/Cuenta en el IRPF de 2026, que se declara en 2027/)).toBeVisible()
  await expect(dialogo.getByRole('link', { name: 'Planificar el ejercicio 2026 en Fiscal' })).toHaveAttribute('href', '/fiscal?vista=planificar')
})

test('«Copiar resumen» copia texto plano sin datos de otras wallets', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { dialogo } = await preparar(page)
  await dialogo.getByRole('button', { name: 'Copiar resumen' }).click()
  await expect(page.getByText('Resumen de la simulación copiado')).toBeVisible()
  const texto = await page.evaluate(() => navigator.clipboard.readText())
  expect(texto).toMatch(/^Simulación de venta de /)
  expect(texto).toContain('Wallet de venta: Wallet de venta')
  expect(texto).toMatch(/Neto en mano: /)
  expect(texto).not.toContain('Wallet ajena')
})

for (const theme of ['dark', 'light'] as const) {
  test(`simulador sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await preparar(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('[role="dialog"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
