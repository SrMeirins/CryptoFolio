import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Ajustes (#445): menú lateral, guardado al momento con Deshacer y validación.
// Solo lectura: /api/settings/config se intercepta y los cambios viven en la
// memoria de la prueba; la base de datos real no se toca.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function fakeConfig(page: Page) {
  const overrides: Record<string, string> = {}
  const writes: Array<{ key: string; value: string }> = []
  await page.route('**/api/settings/config', async route => {
    const req = route.request()
    if (req.method() === 'PUT') {
      const { key, value } = req.postDataJSON() as { key: string; value: string }
      overrides[key] = value
      writes.push({ key, value })
      await route.fulfill({ json: { success: true } })
      return
    }
    const real = await route.fetch()
    await route.fulfill({ response: real, json: { ...(await real.json()), ...overrides } })
  })
  return writes
}

test('el menú cambia de sección por clic, teclado y URL', async ({ page }) => {
  await page.goto('/settings?tab=datos')
  const menu = page.getByRole('tablist', { name: 'Secciones de Ajustes' })
  await expect(menu.getByRole('tab', { name: /Datos/ })).toHaveAttribute('aria-selected', 'true')
  await menu.getByRole('tab', { name: /Fiscal/ }).click()
  await expect(page).toHaveURL(/tab=fiscal/)
  await expect(page.getByRole('region', { name: 'Umbral Modelo 721' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('tab', { name: /Datos/ })).toBeFocused()
  await expect(page).toHaveURL(/tab=datos/)
})

test('el tema se guarda al momento y Deshacer lo devuelve', async ({ page }) => {
  const writes = await fakeConfig(page)
  await page.goto('/settings?tab=general')
  const tema = page.getByRole('region', { name: 'Tema' }).getByRole('radiogroup', { name: 'Tema' })
  const before = await tema.getByRole('radio', { checked: true }).innerText()
  const other = before === 'Claro' ? 'Oscuro' : 'Claro'
  await tema.getByRole('radio', { name: other }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Guardado' })
  await expect(toast).toBeVisible()
  await expect(tema.getByRole('radio', { name: other })).toHaveAttribute('aria-checked', 'true')
  await toast.getByRole('button', { name: 'Deshacer' }).click()
  await expect(tema.getByRole('radio', { name: before })).toHaveAttribute('aria-checked', 'true')
  expect(writes.length).toBe(2)
})

test('el umbral del 721: un valor no válido se rechaza y uno válido se guarda con Deshacer', async ({ page }) => {
  const writes = await fakeConfig(page)
  await page.goto('/settings?tab=fiscal')
  const input = page.getByRole('textbox', { name: 'Umbral del Modelo 721 en euros' })
  const original = await input.inputValue()
  await input.fill('0')
  await input.press('Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'Entre 1 y 10.000.000' })).toBeVisible()
  expect(writes).toEqual([])
  await input.fill('60000')
  await input.press('Enter')
  const toast = page.getByRole('status').filter({ hasText: 'Guardado' })
  await expect(toast).toContainText(/60\.000/)
  await toast.getByRole('button', { name: 'Deshacer' }).click()
  await expect(input).toHaveValue(original)
  expect(writes.map(w => w.value)).toEqual(['60000', original])
})

test('un tramo IRPF se guarda al salir del campo y Deshacer lo devuelve', async ({ page }) => {
  const writes = await fakeConfig(page)
  await page.goto('/settings?tab=fiscal')
  const input = page.getByRole('textbox', { name: /^Tipo del tramo 0/ })
  const original = await input.inputValue()
  const next = original === '20' ? '22' : '20'
  await input.fill(next)
  await page.getByRole('textbox', { name: /^Tipo del tramo 6/ }).focus()
  const toast = page.getByRole('status').filter({ hasText: 'Guardado' })
  await expect(toast).toBeVisible()
  await expect(input).toHaveValue(next)
  await toast.getByRole('button', { name: 'Deshacer' }).click()
  await expect(input).toHaveValue(original)
  expect(writes).toHaveLength(2)
  expect(JSON.parse(writes[1].value)[0]).toBe(Number(original))
})

for (const theme of ['dark', 'light'] as const) {
  test(`Ajustes con menú lateral sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    for (const tab of ['fiscal', 'datos']) {
      await page.goto(`/settings?tab=${tab}`)
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
      await page.waitForTimeout(500)
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    }
  })
}
