import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Página «no encontrada» (#487). Solo lectura: se bloquea cualquier petición
// que no sea GET.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

test('una ruta con errata muestra la página, la sugerencia y lleva al Dashboard', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/portfolioo')
  const titulo = page.getByRole('heading', { level: 1, name: 'Esta página no existe' })
  await expect(titulo).toBeVisible()
  await expect(titulo).toBeFocused()
  await expect(page).toHaveTitle('Página no encontrada · CryptoFolio')
  await expect(page.getByText('/portfolioo', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Portfolio' }).last().click()
  await expect(page).toHaveURL(/\/portfolio$/)
})

test('sin parecido no hay sugerencia; «Ir al Dashboard» funciona con teclado', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/zzzzzzzz')
  await expect(page.getByText('¿Buscabas')).toHaveCount(0)
  await page.getByRole('link', { name: 'Ir al Dashboard' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/$/)
})

test('una ruta con HTML se muestra como texto literal, sin ejecutarse', async ({ page }) => {
  await soloLectura(page)
  let dialogo = false
  page.on('dialog', d => { dialogo = true; void d.dismiss() })
  await page.goto('/%3Cimg%20src=x%20onerror=alert(1)%3E')
  await expect(page.getByRole('heading', { level: 1, name: 'Esta página no existe' })).toBeVisible()
  await expect(page.locator('section img')).toHaveCount(0)
  await expect(page.locator('section code')).toContainText('<img src=x onerror=alert(1)>')
  expect(dialogo).toBe(false)
})

for (const theme of ['dark', 'light'] as const) {
  test(`sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await soloLectura(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/portfolioo')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([])
  })
}
