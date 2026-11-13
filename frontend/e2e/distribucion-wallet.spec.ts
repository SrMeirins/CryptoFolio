import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Distribución por wallet (#506): desglose por activo de cada wallet. Solo
// lectura: lotes, saldos y precios se interceptan con datos sintéticos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const lot = (asset: string, quantity: string, wallet: string, color: string) => ({
  asset, quantity, wallet_id: wallet, wallet_name: `Wallet ${wallet}`, wallet_color: color, wallet_kind: 'exchange',
  cost_basis_eur: '1', avg_price_eur: '1',
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
  const fila = panel(page).getByRole('button', { name: /Wallet w1/ })
  await expect(fila).toHaveAttribute('aria-expanded', 'false')
  await fila.click()
  await expect(fila).toHaveAttribute('aria-expanded', 'true')
  const composicion = panel(page).getByRole('list', { name: 'Composición de Wallet w1' })
  await expect(composicion.getByRole('listitem')).toHaveCount(2)
  await expect(composicion).toContainText('AAA')
  await expect(composicion).toContainText('BBB')
})

for (const theme of ['dark', 'light'] as const) {
  test(`distribución por wallet desplegada sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeCartera(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await panel(page).getByRole('radio', { name: 'Wallet' }).click()
    await panel(page).getByRole('button', { name: /Wallet w1/ }).click()
    const r = await (await axeEstable(page)).withTags(WCAG).include('main').analyze()
    expect(r.violations).toEqual([])
  })
}
