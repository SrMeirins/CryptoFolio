import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Detalle del activo (#528): gráfico con compras abiertas, compras vendidas y
// ventas (puntos o banderas, también desde Ajustes), zoom con rueda, arrastre
// y teclado; lista de ventas que coincide con el gráfico y lleva a Historial;
// regla de precios; «Si vendo X» con el cálculo del simulador; lotes por mes
// con el origen de los traspasos y los trozos unidos; navegación con [ y ].
// Lotes, ventas, simulación y configuración se interceptan con datos
// sintéticos: la base de datos no se toca.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const WALLET = '00000000-0000-4000-8000-000000000001'
const dia = (diasAtras: number) => new Date(Date.now() - diasAtras * 86_400_000).toISOString()

const lots = (asset: string) => ({
  asset,
  lots: [
    { lot_id: 'lote-a', wallet_id: WALLET, wallet_name: 'Wallet sintética', wallet_color: '#3b82f6', wallet_kind: 'exchange',
      opened_at: dia(200), quantity_original: '10', quantity_remaining: '4', price_per_unit_eur: '1', cost_basis_eur: '4',
      usd_per_eur: null, source_type: 'BUY' },
    { lot_id: 'lote-b', wallet_id: WALLET, wallet_name: 'Wallet sintética', wallet_color: '#3b82f6', wallet_kind: 'exchange',
      opened_at: dia(190), quantity_original: '5', quantity_remaining: '5', price_per_unit_eur: '2', cost_basis_eur: '10',
      usd_per_eur: null, source_type: 'WITHDRAW', source_wallet_name: 'Wallet de origen', source_wallet_color: '#a855f7' },
    { lot_id: 'lote-c', wallet_id: WALLET, wallet_name: 'Wallet sintética', wallet_color: '#3b82f6', wallet_kind: 'exchange',
      opened_at: dia(60), quantity_original: '3', quantity_remaining: '3', price_per_unit_eur: '3', cost_basis_eur: '9',
      usd_per_eur: null, source_type: 'BUY' },
    // Trozo de la misma compra que lote-c (misma wallet, fecha y precio): se ve unido.
    { lot_id: 'lote-c2', wallet_id: WALLET, wallet_name: 'Wallet sintética', wallet_color: '#3b82f6', wallet_kind: 'exchange',
      opened_at: dia(60), quantity_original: '0.2', quantity_remaining: '0.2', price_per_unit_eur: '3', cost_basis_eur: '0.6',
      usd_per_eur: null, source_type: 'BUY' },
  ],
})

const ventas = [
  { txId: '00000000-0000-4000-8000-0000000000a1', soldAt: dia(150), kind: 'venta', quantity: 4, priceEur: 1.5, proceedsEur: 6, gainLossEur: 2 },
  { txId: '00000000-0000-4000-8000-0000000000a2', soldAt: dia(100), kind: 'permuta', quantity: 2, priceEur: 0.8, proceedsEur: 1.6, gainLossEur: -0.4 },
  { txId: '00000000-0000-4000-8000-0000000000a3', soldAt: dia(30), kind: 'venta', quantity: 1, priceEur: 2, proceedsEur: 2, gainLossEur: 1 },
]
const sales = (asset: string) => ({
  asset, count: ventas.length, realizedEur: 2.6, otherRealizedEur: 0, lastSaleAt: ventas[2].soldAt, firstAcquiredAt: dia(220),
  sales: ventas, closedBuys: [{ openedAt: dia(220), quantity: 2, priceEur: 0.9 }],
})

/** Configuración real con valores propios; los PUT se quedan en memoria. */
async function conConfig(page: Page, preset: Record<string, string> = {}) {
  const overrides: Record<string, string> = { ...preset }
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const { key, value } = route.request().postDataJSON() as { key: string; value: string }
      overrides[key] = value
      await route.fulfill({ json: { success: true } })
      return
    }
    try {
      const real = await route.fetch()
      await route.fulfill({ response: real, json: { ...(await real.json()), ...overrides } })
    } catch { /* navegación en curso */ }
  })
  return overrides
}

async function interceptar(page: Page) {
  await page.route('**/api/v1/fifo/lots/*', route => {
    const asset = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    return route.fulfill({ json: lots(asset) })
  })
  await page.route('**/api/v1/fifo/sales/*', route => {
    const asset = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    return route.fulfill({ json: sales(asset) })
  })
}

/** Abre el detalle del primer activo de la tabla y devuelve su símbolo. */
async function abrir(page: Page, config: Record<string, string> = { grafico_marcas: 'puntos' }): Promise<string> {
  await conConfig(page, config)
  await interceptar(page)
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por activo' }).click()
  const button = page.locator('tbody tr[data-row-key]').getByRole('button', { name: /^Detalle de [A-Z0-9]+$/ }).first()
  await button.waitFor({ timeout: 15_000 })
  const asset = (await button.getAttribute('aria-label'))!.replace('Detalle de ', '')
  await button.click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: asset, exact: true })).toBeVisible()
  return asset
}

test('las ventas del gráfico coinciden con la lista, y las compras vendidas salen huecas', async ({ page }) => {
  await abrir(page)
  const panel = page.getByRole('dialog')
  // Panel ancho (#528): cabe la tabla de lotes.
  expect((await panel.boundingBox())!.width).toBeGreaterThan(650)
  const filas = panel.getByTestId('venta-fila')
  await expect(filas).toHaveCount(ventas.length)
  const grafico = panel.getByRole('img', { name: /^Precio de / })
  await expect(grafico.locator('[data-marker="venta"]')).toHaveCount(ventas.length)
  await expect(grafico.locator('[data-marker="compra-vendida"]')).toHaveCount(1)
  await expect(grafico.locator('[data-marker="compra"]')).toHaveCount(3)
  // Resumen: cada cifra y su línea secundaria se leen enteras.
  for (const celda of await panel.getByRole('list', { name: /^Resumen de / }).locator('li span.truncate').all()) {
    expect(await celda.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
  await expect(panel.getByText('Compras ya vendidas')).toBeVisible()
  // Al pasar por una venta de la lista se resalta su marca.
  await filas.first().hover()
  await expect(grafico.locator('[data-marker="venta"][data-resaltada]')).toHaveCount(1)
  // La fecha lleva a la operación en Historial, y también pulsar en cualquier parte de la fila.
  await expect(filas.first().getByRole('link')).toHaveAttribute('href', `/history?tx=${ventas[2].txId}`)
  await filas.nth(1).getByRole('cell').nth(2).click()
  await expect(page).toHaveURL(new RegExp(`/history\\?tx=${ventas[1].txId}`))
})

test('zoom: rueda, arrastre, teclado y volver a la vista inicial', async ({ page }) => {
  await abrir(page)
  const panel = page.getByRole('dialog')
  const grafico = panel.getByTestId('grafico-precio')
  const todo = panel.getByRole('radio', { name: 'Desde la primera compra' })
  await expect(todo).toHaveAttribute('aria-checked', 'true')
  const box = (await grafico.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2)
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200)
  // Zoom libre: ningún rango rápido activo y el tramo visible con sus fechas.
  await expect(todo).toHaveAttribute('aria-checked', 'false')
  await expect(panel.getByText(/^Del .+ al .+$/)).toBeVisible()
  const antes = await panel.getByText(/^Del .+ al .+$/).textContent()
  // Arrastrar desplaza el tramo.
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(panel.getByText(/^Del .+ al .+$/)).not.toHaveText(antes!)
  // El panel no se ha desplazado con la rueda.
  await expect(panel.getByRole('heading', { level: 2 })).toBeInViewport()
  await panel.getByRole('button', { name: 'Restablecer la vista del gráfico' }).click()
  await expect(todo).toHaveAttribute('aria-checked', 'true')
  // Teclado: + acerca, Inicio vuelve.
  await grafico.focus()
  await page.keyboard.press('+')
  await expect(todo).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Home')
  await expect(todo).toHaveAttribute('aria-checked', 'true')
  // Doble clic también vuelve.
  await panel.getByRole('radio', { name: 'Últimos 30 días' }).click()
  await grafico.dblclick()
  await expect(todo).toHaveAttribute('aria-checked', 'true')
})

test('marcas como banderas fuera de la línea, elegibles en el gráfico y guardadas', async ({ page }) => {
  const guardado = await conConfig(page, { grafico_marcas: 'puntos' })
  await interceptar(page)
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por activo' }).click()
  const button = page.locator('tbody tr[data-row-key]').getByRole('button', { name: /^Detalle de [A-Z0-9]+$/ }).first()
  await button.waitFor({ timeout: 15_000 })
  await button.click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('button', { name: /^Marcas de las operaciones/ }).click()
  await page.getByRole('option', { name: 'Banderas arriba' }).click()
  await expect.poll(() => guardado.grafico_marcas).toBe('banderas-arriba')
  const grafico = panel.getByTestId('grafico-precio')
  await expect(grafico.getByTestId('banderas-arriba')).toBeVisible()
  await expect(grafico.locator('[data-marker="venta"]')).toHaveCount(ventas.length)
  // Las banderas quedan por encima del área de la línea, sin taparla.
  const linea = (await grafico.locator('.recharts-area-curve').boundingBox())!
  for (const b of await grafico.locator('[data-marker]').all()) {
    const caja = (await b.boundingBox())!
    expect(caja.y + caja.height).toBeLessThanOrEqual(linea.y + 1)
  }
})

test('las marcas del gráfico también se eligen en Ajustes', async ({ page }) => {
  const guardado = await conConfig(page, { grafico_marcas: 'puntos' })
  await page.goto('/settings?tab=general')
  await page.getByRole('button', { name: /^Marcas del gráfico de un activo/ }).click()
  await page.getByRole('option', { name: 'Banderas abajo' }).click()
  await expect.poll(() => guardado.grafico_marcas).toBe('banderas-abajo')
})

test('regla de precios, lotes por mes, trozos unidos y el origen de los traspasos', async ({ page }) => {
  await abrir(page)
  const panel = page.getByRole('dialog')
  const regla = panel.getByTestId('regla-precios')
  await expect(regla.getByRole('heading', { name: 'Precios de compra frente al precio actual' })).toBeVisible()
  // Un círculo por compra: los dos trozos de la misma compra cuentan como una.
  await expect(regla.getByTestId('regla-compra')).toHaveCount(3)
  await regla.getByTestId('regla-compra').last().hover()
  await expect(regla.getByText(/^Compra del /)).toBeVisible()
  const grupos = panel.getByRole('list', { name: 'Lotes abiertos por mes de compra' })
  // Abre todos los grupos y comprueba el texto del origen del lote traspasado.
  for (const b of await grupos.getByRole('button', { expanded: false }).all()) await b.click()
  await expect(grupos.locator('tr[data-lot-id]')).toHaveCount(3)
  await expect(grupos.getByText('Traspaso desde Wallet de origen')).toBeVisible()
  await expect(grupos.getByText('(2 trozos)')).toBeVisible()
})

test('«Si vendo X» usa el simulador y resalta los lotes que saldrían', async ({ page }) => {
  const asset = await abrir(page)
  let body: Record<string, unknown> | null = null
  await page.route('**/api/fiscal/simulate-sale', async route => {
    body = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ json: {
      asset, quantity: 6, priceEur: 2, feePct: 0.1, walletId: WALLET, wallets: [],
      totalProceeds: 12, totalFee: 0.01, netProceeds: 11.99, totalCostBasis: 8, totalGain: 4, totalLoss: 0, netGainLoss: 3.99,
      irpfEstimate: 0, irpf: { year: 2026, baseAntes: 0, baseDespues: 0, marginal: 0, desglose: [] }, recompra: { aviso: false, comprasRecientes: [] },
      netoEnMano: 11.99, resultadoNeto: 3.99,
      lotsConsumed: [
        { lotId: 'lote-a', walletName: 'Wallet sintética', openedAt: dia(200), qtyAvailable: 4, qtyConsumed: 4, costBasisConsumed: 4, pricePerUnit: 1, proceedsEur: 8, feeEur: 0, partial: false, gainLossEur: 4 },
        { lotId: 'lote-b', walletName: 'Wallet sintética', openedAt: dia(190), qtyAvailable: 5, qtyConsumed: 2, costBasisConsumed: 4, pricePerUnit: 2, proceedsEur: 4, feeEur: 0, partial: true, gainLossEur: 0 },
      ],
    } })
  })
  const panel = page.getByRole('dialog')
  const siVendo = panel.getByTestId('si-vendo')
  await siVendo.getByLabel(`Cantidad de ${asset}`).fill('6')
  await expect(siVendo.getByText(/Saldrían/)).toContainText('2 lotes')
  // Misma petición que el simulador: activo, cantidad y la wallet de la venta.
  expect(body).toMatchObject({ asset, quantity: 6, walletId: WALLET })
  await expect(panel.locator('tr[data-saldria]')).toHaveCount(2)
  await expect(panel.getByText('Saldrían 2', { exact: true })).toBeVisible()
})

test('[ y ] cambian de activo sin cerrar el panel; accesos a Historial y Fiscal', async ({ page }) => {
  const asset = await abrir(page)
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('link', { name: 'Ver en Historial', exact: true })).toHaveAttribute('href', `/history?buscar=${asset}`)
  await expect(panel.getByRole('link', { name: 'Ver en Fiscal', exact: true })).toHaveAttribute('href', `/fiscal?vista=operaciones&activo=${asset}`)
  const nav = panel.getByRole('group', { name: 'Cambiar de activo' })
  test.skip(await nav.count() === 0, 'Un solo activo en estos datos')
  await expect(nav).toContainText('1 de')
  await page.keyboard.press(']')
  await expect(nav).toContainText('2 de')
  await expect(panel.getByRole('heading', { level: 2 })).not.toHaveText(asset)
  await page.keyboard.press('[')
  await expect(panel.getByRole('heading', { name: asset, exact: true })).toBeVisible()
  // Escribiendo en un campo, [ no navega.
  await panel.getByTestId('si-vendo').getByRole('textbox').first().press('[')
  await expect(panel.getByRole('heading', { name: asset, exact: true })).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`detalle del activo sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const grupos = page.getByRole('list', { name: 'Lotes abiertos por mes de compra' })
    for (const b of await grupos.getByRole('button', { expanded: false }).all()) await b.click()
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('[role="dialog"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
