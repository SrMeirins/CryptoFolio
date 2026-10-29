import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Activos en Ajustes (#450): tabla ordenable, filtros, edición en panel, salud
// de los precios y reintento. Solo lectura: el reintento se intercepta.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('la tabla se ordena por columna y el filtro de estables solo deja estables', async ({ page }) => {
  await page.goto('/settings?tab=assets')
  const table = page.getByRole('table', { name: 'Activos y sus precios' })
  await table.waitFor({ timeout: 15_000 })
  const activo = table.getByRole('columnheader', { name: /Activo/ })
  await expect(activo).toHaveAttribute('aria-sort', 'ascending')
  const first = async () => table.locator('tbody tr').first().getAttribute('data-asset')
  const asc = await first()
  await activo.getByRole('button').click()
  await expect(activo).toHaveAttribute('aria-sort', 'descending')
  expect(await first()).not.toBe(asc)

  await page.getByRole('group', { name: 'Filtrar activos' }).getByRole('button', { name: /^Estables y fiat/ }).click()
  const estados = await table.locator('tbody tr td:nth-child(4)').allInnerTexts()
  test.skip(estados.length === 0, 'Sin estables en estos datos')
  expect(new Set(estados)).toEqual(new Set(['Estable o fiat']))
})

test('editar abre el panel lateral con el logo y Escape lo cierra', async ({ page }) => {
  await page.goto('/settings?tab=assets')
  const editar = page.getByRole('button', { name: /^Editar [A-Z0-9]+$/ }).first()
  await editar.waitFor({ timeout: 15_000 })
  const symbol = (await editar.getAttribute('aria-label'))!.replace('Editar ', '')
  await editar.click()
  const panel = page.getByRole('dialog', { name: symbol })
  await expect(panel.getByText('Logo', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(editar).toBeFocused()
})

test('reintentar precios avisa de que hay que esperar si se repite', async ({ page }) => {
  let calls = 0
  await page.route('**/api/settings/assets/retry-prices', route => {
    calls++
    return calls === 1
      ? route.fulfill({ json: { success: true } })
      : route.fulfill({ status: 429, json: { error: 'Espera un momento', retry_in_ms: 50_000 } })
  })
  await page.goto('/settings?tab=assets')
  const salud = page.getByRole('region', { name: 'Salud de los precios' })
  await salud.getByRole('button', { name: 'Reintentar precios' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Precios reintentados' })).toBeVisible()
  await salud.getByRole('button', { name: 'Reintentar precios' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Espera un minuto' })).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`Activos sin violaciones de axe, también con el panel abierto (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=assets')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('table', { name: 'Activos y sus precios' }).waitFor({ timeout: 15_000 })
    let r = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    await page.getByRole('button', { name: /^Editar [A-Z0-9]+$/ }).first().click()
    await page.waitForTimeout(400)
    r = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
