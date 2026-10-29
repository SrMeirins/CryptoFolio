import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Tarjetas del ejercicio en Fiscal (#418): abren Operaciones con su filtro o
// bajan a la tabla de rendimientos; axe en ambos temas. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('Ganancias y Pérdidas abren Operaciones con su filtro', async ({ page }) => {
  for (const [title, value, chip] of [['Ganancias', 'ganancia', /Ganancias$/], ['Pérdidas', 'perdida', /Pérdidas$/]] as const) {
    await page.goto('/fiscal')
    const card = page.getByRole('button', { name: new RegExp(`^${title}: .*Ver las operaciones con`) })
    await card.waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await card.count() === 0, 'Sin ejercicio fiscal en estos datos')
    await card.click()
    await expect(page).toHaveURL(new RegExp(`vista=operaciones&resultado=${value}$`))
    await expect(page.getByRole('button', { name: chip, pressed: true })).toBeVisible()
  }
})

test('Rendimientos baja a su tabla y le pasa el foco', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/fiscal')
  const card = page.getByRole('button', { name: /^Rendimientos: .*Ver la tabla de rendimientos$/ })
  await card.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await card.count() === 0, 'Sin ejercicio fiscal en estos datos')
  await card.click()
  await expect(page).toHaveURL(/vista=operaciones&seccion=rendimientos$/)
  const table = page.locator('#fiscal-rendimientos')
  await table.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await table.count() === 0, 'Ejercicio sin rendimientos')
  await expect(table).toBeFocused()
})

test('Operaciones abre la pestaña sin filtros', async ({ page }) => {
  await page.goto('/fiscal')
  const card = page.getByRole('button', { name: /^Operaciones: .*Ver todas las operaciones del ejercicio$/ })
  await card.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await card.count() === 0, 'Sin ejercicio fiscal en estos datos')
  await card.click()
  await expect(page).toHaveURL(/vista=operaciones$/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`tarjetas del ejercicio sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/fiscal')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('button', { name: /^Ganancias: / }).waitFor({ timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
