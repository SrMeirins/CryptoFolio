import { expect, test, type Page } from './base'
import { axeEstable } from './axe'

// Actividad reciente (#516): mapa de 26 semanas que filtra la lista por día
// (teclado y clic), tira de 90 días enlazada al Historial, ráfagas agrupadas y
// desplegables, aviso de antigüedad e icono a Portfolio. Solo lectura; las
// ráfagas y el aviso, con operaciones sintéticas interceptadas.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const panel = (page: Page) => page.getByRole('heading', { name: 'Actividad reciente' }).locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')

async function abrir(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const mapa = page.getByRole('grid', { name: /^Actividad de las últimas 26 semanas/ })
  await mapa.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await mapa.count() === 0, 'Sin estadísticas de actividad')
  await mapa.scrollIntoViewIfNeeded()
  return mapa
}

/** Operación sintética mínima para la lista. */
const op = (id: string, operation_type: string, asset: string, timestamp: string, amount = '1') => ({
  id, operation_type, timestamp, asset, amount, amount_net: amount, cost_asset: 'EUR', cost_amount: '10', price_per_unit: '10', usd_per_eur: null,
  fee_asset: null, fee_amount: null, included_fee_asset: null, included_fee_amount: null, fee_in_price: false,
  wallet_id: 'w1', wallet_name: 'Wallet sintética', wallet_color: '#8b5cf6', wallet_kind: 'exchange', account: null, notes: null,
  manually_added: false, original_import: null, created_at: timestamp, destination_wallet_id: null, destination_wallet_name: null,
  destination_wallet_color: null, linked_tx_id: null, linked_tx_timestamp: null, linked_tx_operation_type: null, linked_tx_amount: null,
  linked_tx_asset: null, grouped_fees: [], fee_parent_id: null,
})

async function listaSintetica(page: Page, txs: ReturnType<typeof op>[]) {
  await page.route(/\/api\/transactions\?limit=100/, route => route.fulfill({ json: { transactions: txs, total: txs.length, flows: {}, limit: 100, offset: 0 } }))
}

test('el mapa filtra la lista por el día elegido con el teclado y se quita con Escape', async ({ page }) => {
  const mapa = await abrir(page)
  await mapa.focus()
  await page.keyboard.press('ArrowLeft')
  const activo = await mapa.getAttribute('aria-activedescendant')
  expect(activo).toBeTruthy()
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('button', { name: 'Quitar el día' })).toBeVisible()
  await expect(page.locator(`#${activo}`)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(panel(page).getByRole('button', { name: 'Quitar el día' })).toHaveCount(0)
})

test('la tira de 90 días abre el Historial con la tarjeta y el periodo', async ({ page }) => {
  await abrir(page)
  await panel(page).getByRole('link', { name: 'Ver Ventas en el Historial' }).click()
  // El Historial reescribe la URL con su propio orden de parámetros.
  await expect(page).toHaveURL(/\/history\?(?=.*tarjeta=ventas)(?=.*desde=\d{4}-\d{2}-\d{2})/)
})

test('las ráfagas del mismo tipo, activo y minuto se agrupan con su recuento y se despliegan', async ({ page }) => {
  const ahora = new Date()
  const t = (s: number) => new Date(ahora.getTime() - 60_000 + s * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  // Tres compras del mismo minuto y una venta aparte.
  const base = new Date(Math.floor((ahora.getTime() - 120_000) / 60_000) * 60_000)
  const m = (s: number) => new Date(base.getTime() + s * 1000).toISOString()
  await listaSintetica(page, [op('v1', 'SELL', 'ADA', t(50)), op('c1', 'BUY', 'XRP', m(40)), op('c2', 'BUY', 'XRP', m(20)), op('c3', 'BUY', 'XRP', m(5))])
  await abrir(page)
  const lista = page.getByTestId('lista-actividad')
  await expect(lista).toContainText('3 × Compra')
  const desplegar = lista.getByRole('button', { name: 'Mostrar las 3 operaciones' })
  await desplegar.click()
  await expect(lista.getByRole('list', { name: 'Operaciones de la ráfaga de XRP' }).getByRole('listitem')).toHaveCount(3)
  await expect(lista.getByRole('link', { name: 'Ver XRP en Portfolio' })).toBeVisible()
})

test('aviso si la última operación tiene más de 30 días', async ({ page }) => {
  await listaSintetica(page, [op('a1', 'BUY', 'XRP', new Date(Date.now() - 45 * 86_400_000).toISOString())])
  await abrir(page)
  await expect(page.getByTestId('aviso-antiguedad')).toContainText(/hace 4[45] días/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`Actividad reciente sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const sel = await panel(page).evaluate(el => { el.setAttribute('data-panel-actividad', ''); return '[data-panel-actividad]' })
    const { violations } = await (await axeEstable(page)).include(sel).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
