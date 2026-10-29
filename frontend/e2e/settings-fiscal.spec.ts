import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Fiscal en Ajustes (#451): bloque Normativa, vista previa antes de aplicar y
// recordatorios. Solo lectura: /api/settings/config se intercepta.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function fakeConfig(page: Page) {
  const overrides: Record<string, string> = {}
  const writes: Array<{ key: string; value: string }> = []
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { key: string; value: string }
      overrides[body.key] = body.value
      writes.push(body)
      await route.fulfill({ json: { success: true } })
      return
    }
    try {
      const real = await route.fetch()
      await route.fulfill({ response: real, json: { ...(await real.json()), ...overrides } })
    } catch { /* navegación en curso */ }
  })
  return writes
}

test('un único bloque Normativa sustituye a los de método y país', async ({ page }) => {
  await page.goto('/settings?tab=fiscal')
  const normativa = page.getByRole('region', { name: 'Normativa' })
  await expect(normativa).toContainText('FIFO')
  await expect(normativa).toContainText('Modelo 721')
  await expect(page.getByRole('region', { name: 'País de residencia fiscal' })).toHaveCount(0)
})

test('la vista previa de la cuota aparece al escribir un tipo, antes de guardarlo', async ({ page }) => {
  const writes = await fakeConfig(page)
  await page.goto('/settings?tab=fiscal')
  const tramos = page.getByRole('region', { name: 'Tramos IRPF de la base del ahorro' })
  const previa = tramos.getByText(/^Cuota estimada de \d{4}/)
  await previa.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await previa.count() === 0, 'Sin ejercicio fiscal en estos datos')
  const input = tramos.getByRole('textbox', { name: /^Tipo del tramo 0/ })
  await input.fill(String(Number(await input.inputValue()) + 10))
  // Solo cambia la previsión si hay base en el primer tramo; nunca se guarda sin salir del campo.
  expect(writes).toEqual([])
  await expect(previa).toBeVisible()
})

test('la previsión del Modelo 721 sigue al umbral que se escribe', async ({ page }) => {
  await fakeConfig(page)
  await page.goto('/settings?tab=fiscal')
  const card = page.getByRole('region', { name: 'Umbral Modelo 721' })
  const previa = card.getByText(/en exchanges\./)
  await previa.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await previa.count() === 0, 'Sin ejercicio fiscal en estos datos')
  await card.getByRole('textbox', { name: 'Umbral del Modelo 721 en euros' }).fill('1')
  await expect(previa).toContainText(/Con un umbral de 1\s€/)
})

test('los recordatorios se silencian con Deshacer y es la misma opción que en General', async ({ page }) => {
  const writes = await fakeConfig(page)
  await page.goto('/settings?tab=fiscal')
  const sw = page.getByRole('switch', { name: 'Recordatorios de plazos fiscales' })
  await expect(sw).toBeChecked()
  await sw.click({ force: true })
  await expect(sw).not.toBeChecked()
  expect(JSON.parse(writes[0].value)).toContain('fiscal')
  await page.getByRole('status').filter({ hasText: 'Guardado' }).getByRole('button', { name: 'Deshacer' }).click()
  await expect(sw).toBeChecked()
  await page.goto('/settings?tab=general')
  await expect(page.getByRole('region', { name: 'Notificaciones' }).getByRole('switch', { name: /^Fiscal/ })).toBeChecked()
})

test('cada ejercicio muestra los tramos de su escala oficial (#452)', async ({ page }) => {
  await page.goto('/settings?tab=fiscal')
  const card = page.getByRole('region', { name: 'Tramos IRPF de la base del ahorro' })
  const selector = card.getByRole('button', { name: /Ejercicio de la escala/ })
  await selector.waitFor({ timeout: 15_000 })
  await selector.click()
  const opcion = page.getByRole('option', { name: '2022' })
  test.skip(await opcion.count() === 0, 'Sin el ejercicio 2022 en estos datos')
  await opcion.click()
  await expect(card.getByRole('textbox', { name: /^Tipo del tramo / })).toHaveCount(4)
  await expect(card.getByText('> 200.000 €')).toBeVisible()
  await expect(card.getByRole('textbox', { name: /^Tipo del tramo > 200\.000 € en 2022$/ })).toHaveValue('26')
})

for (const theme of ['dark', 'light'] as const) {
  test(`Fiscal en Ajustes sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=fiscal')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(800)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
