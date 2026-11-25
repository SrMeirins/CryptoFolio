import { expect, test, type Page } from './base'
import { axeEstable } from './axe'

// Distribución (#506, #514): desglose por activo de cada wallet, dos destinos
// por fila (Portfolio e Historial), peso frente a coste, diversificación e
// iconos en «Otros». Solo lectura: lotes, saldos y precios se interceptan con
// datos sintéticos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const lot = (asset: string, quantity: string, wallet: string, color: string, cost = '1') => ({
  asset, quantity, wallet_id: wallet, wallet_name: `Wallet ${wallet}`, wallet_color: color, wallet_kind: 'exchange',
  cost_basis_eur: cost, avg_price_eur: '1',
})

async function fakeCartera(page: Page) {
  await page.route('**/api/prices/live', route => route.fulfill({ json: { AAA: 100, BBB: 10, CCC: 1 } }))
  await page.route('**/api/fifo/lots', route => route.fulfill({
    json: [lot('AAA', '1', 'w1', '#8b5cf6'), lot('BBB', '5', 'w1', '#8b5cf6'), lot('AAA', '0.5', 'w2', '#3b82f6'), lot('CCC', '0.0001', 'w3', '#d97706')],
  }))
  await page.route('**/api/fifo/fiat-balances', route => route.fulfill({ json: [] }))
}

const panel = (page: Page) => page.getByRole('heading', { name: 'Distribución' }).locator('xpath=ancestor::div[contains(@class,"px-5")][1]')

test('por wallet: cada wallet se despliega con su composición por activo', async ({ page }) => {
  await fakeCartera(page)
  await page.goto('/')
  await panel(page).getByRole('radio', { name: 'Wallet' }).click()
  const fila = panel(page).getByRole('button', { name: 'Mostrar la composición de Wallet w1' })
  await expect(fila).toHaveAttribute('aria-expanded', 'false')
  await fila.click()
  await expect(panel(page).getByRole('button', { name: 'Ocultar la composición de Wallet w1' })).toHaveAttribute('aria-expanded', 'true')
  const composicion = panel(page).getByRole('list', { name: 'Composición de Wallet w1' })
  await expect(composicion.getByRole('listitem')).toHaveCount(2)
  await expect(composicion).toContainText('AAA')
  await expect(composicion).toContainText('BBB')
})

for (const theme of ['dark', 'light'] as const) {
  test(`distribución por wallet desplegada sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeCartera(page)
    // Sin movimiento, como el resto de pruebas de axe: el destello de las cifras en vivo es transitorio.
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await panel(page).getByRole('radio', { name: 'Wallet' }).click()
    await panel(page).getByRole('button', { name: 'Mostrar la composición de Wallet w1' }).click()
    await page.mouse.move(0, 0)
    const r = await (await axeEstable(page)).withTags(WCAG).include('main').analyze()
    expect(r.violations).toEqual([])
  })
}

// Cartera sintética con 11 activos: los 8 mayores y «Otros» con 3; AAA costó
// poco y pesa más en valor que en lo invertido.
async function fakeMuchos(page: Page) {
  const assets = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ', 'KKK']
  await page.route('**/api/prices/live', route => route.fulfill({ json: Object.fromEntries(assets.map((a, i) => [a, 100 - i * 8])) }))
  await page.route('**/api/fifo/lots', route => route.fulfill({
    json: assets.map((a, i) => lot(a, '1', 'w1', '#8b5cf6', a === 'AAA' ? '10' : String(100 - i * 8))),
  }))
  await page.route('**/api/fifo/fiat-balances', route => route.fulfill({ json: [] }))
}

test('cada fila tiene dos destinos con nombre claro: Portfolio e Historial', async ({ page }) => {
  await fakeMuchos(page)
  await page.goto('/')
  await panel(page).getByRole('radio', { name: 'Activo' }).click()
  await panel(page).getByRole('link', { name: /^AAA: .+\. Ver AAA en Portfolio$/ }).click()
  await expect(page).toHaveURL(/\/portfolio\?activo=AAA$/)
  await page.goBack()
  await panel(page).getByRole('link', { name: 'Ver las operaciones de AAA en el Historial' }).click()
  await expect(page).toHaveURL(/\/history\?activo=AAA$/)
})

test('peso frente a coste, diversificación e iconos de «Otros»', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await fakeMuchos(page)
  await page.goto('/')
  await panel(page).getByRole('radio', { name: 'Activo' }).click()
  // AAA pesa más en valor que en lo invertido: su diferencia es positiva.
  const aaa = panel(page).getByRole('link', { name: /^AAA: / })
  await expect(aaa).toContainText(/\+\d+ pp/)
  await expect(aaa).toHaveAttribute('aria-label', /de la cartera, [\d,]+ ?% de lo invertido/)
  await expect(panel(page).getByTestId('diversificacion')).toContainText(/equivale a [\d,]+ activos de igual peso ?\(de 11\)/)
  const otros = panel(page).getByRole('link', { name: /^Otros \(III, JJJ, KKK\)/ })
  await expect(otros).toBeVisible()
  await otros.click()
  await expect(page).toHaveURL(/\/portfolio\?activos=III,JJJ,KKK$/)
})

test('por wallet: la fila abre Portfolio filtrado por la wallet', async ({ page }) => {
  await fakeCartera(page)
  await page.goto('/')
  await panel(page).getByRole('radio', { name: 'Wallet' }).click()
  await panel(page).getByRole('link', { name: /Ver la wallet Wallet w1 en Portfolio$/ }).click()
  await expect(page).toHaveURL(/\/portfolio\?wallet=w1$/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`distribución por activo con «Otros» desplegado sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeMuchos(page)
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await panel(page).getByRole('radio', { name: 'Activo' }).click()
    await panel(page).getByRole('button', { name: 'Mostrar la composición de «Otros»' }).click()
    await page.mouse.move(0, 0)
    const r = await (await axeEstable(page)).withTags(WCAG).include('main').analyze()
    expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
