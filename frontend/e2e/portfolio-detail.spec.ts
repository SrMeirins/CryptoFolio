import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Detalle de un activo en Portfolio (#460): se abre desde «Por activo», «Por
// wallet» y Polvo, con ratón y con teclado. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openFromRow(page: Page, scope = page.locator('main')) {
  const button = scope.locator('tbody tr[data-row-key]').getByRole('button', { name: /^Detalle de [A-Z0-9]+$/ }).first()
  await button.waitFor({ timeout: 15_000 })
  const asset = (await button.getAttribute('aria-label'))!.replace('Detalle de ', '')
  // Visible sin pasar el cursor: atenuado, nunca invisible.
  expect(Number(await button.evaluate(el => getComputedStyle(el).opacity))).toBeGreaterThan(0.3)
  await button.click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('heading', { name: asset })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
}

test('detalle desde la vista «Por activo»', async ({ page }) => {
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por activo' }).click()
  await openFromRow(page)
})

test('detalle desde la vista «Por wallet», también con teclado', async ({ page }) => {
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por wallet' }).click()
  await openFromRow(page)
  const button = page.locator('tbody tr[data-row-key]').getByRole('button', { name: /^Detalle de [A-Z0-9]+$/ }).first()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('detalle desde Polvo', async ({ page }) => {
  await page.goto('/portfolio')
  const polvo = page.getByRole('region', { name: 'Polvo' })
  await polvo.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await polvo.count() === 0, 'Sin polvo en estos datos')
  const toggle = polvo.getByRole('button', { expanded: false })
  if (await toggle.count()) await toggle.first().click()
  await openFromRow(page, polvo)
})

test('las tarjetas de wallet y las filas no comparten nombre accesible', async ({ page }) => {
  await page.goto('/portfolio')
  await page.locator('tbody tr[data-row-key]').first().waitFor({ timeout: 15_000 })
  const names = await page.getByRole('button', { name: /^Detalle de / }).evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
  expect(new Set(names).size).toBe(names.length)
})

for (const theme of ['dark', 'light'] as const) {
  test(`Portfolio «Por wallet» sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/portfolio')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('radio', { name: 'Por wallet' }).click()
    await page.locator('tbody tr[data-row-key]').first().waitFor({ timeout: 15_000 })
    await page.mouse.move(0, 0)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
