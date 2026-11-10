import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Resumen de Fiscal (#418, #537): la tira de la cabecera abre Operaciones con
// su filtro o baja a la tabla de rendimientos; el bloque «Neto a declarar»
// explica la cuota en cascada y despliega los tramos. Axe en ambos temas.
// Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const celda = (label: string) => ({ name: `Ver ${label} en Operaciones`, exact: true })

test('Ganancias y Pérdidas abren Operaciones con su filtro', async ({ page }) => {
  for (const [label, value, chip] of [['Ganancias', 'ganancia', /Ganancias$/], ['Pérdidas', 'perdida', /Pérdidas$/]] as const) {
    await page.goto('/fiscal')
    const cell = page.getByRole('button', celda(label))
    await cell.waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await cell.count() === 0, 'Sin ejercicio fiscal en estos datos')
    await cell.click()
    // El ejercicio va en la URL (#536): Operaciones se abre en el mismo año.
    await expect(page).toHaveURL(new RegExp(`vista=operaciones&anio=\\d{4}&resultado=${value}$`))
    await expect(page.getByRole('button', { name: chip, pressed: true })).toBeVisible()
  }
})

test('Rendimientos baja a su tabla y le pasa el foco', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/fiscal')
  const cell = page.getByRole('button', celda('Rendimientos'))
  await cell.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await cell.count() === 0, 'Sin ejercicio fiscal en estos datos')
  await cell.click()
  await expect(page).toHaveURL(/vista=operaciones&anio=\d{4}&seccion=rendimientos$/)
  const table = page.locator('#fiscal-rendimientos')
  await table.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await table.count() === 0, 'Ejercicio sin rendimientos')
  await expect(table).toBeFocused()
})

test('Operaciones abre la vista sin filtros', async ({ page }) => {
  await page.goto('/fiscal')
  const cell = page.getByRole('button', celda('Operaciones'))
  await cell.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await cell.count() === 0, 'Sin ejercicio fiscal en estos datos')
  await cell.click()
  await expect(page).toHaveURL(/vista=operaciones&anio=\d{4}$/)
})

test('la cascada termina en la cuota de la cabecera del bloque y despliega los tramos', async ({ page }) => {
  await page.goto('/fiscal')
  const bloque = page.getByRole('region', { name: /^Resultado fiscal de \d{4}$/ })
  await bloque.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await bloque.count() === 0, 'Sin ejercicio fiscal en estos datos')
  const cascada = bloque.getByRole('table', { name: 'De dónde sale la cuota' })
  await expect(cascada.getByRole('rowheader', { name: 'Ganancias', exact: true })).toBeVisible()
  await expect(cascada.getByRole('rowheader', { name: 'Base del ahorro' })).toBeVisible()
  // La última fila es la misma cuota que el bloque muestra en grande.
  await page.waitForTimeout(800)
  const cuotaFila = (await cascada.getByRole('row').last().getByRole('cell').last().innerText()).trim()
  await expect(bloque.getByText('Cuota IRPF estimada').locator('xpath=following-sibling::*[1]')).toHaveText(cuotaFila)
  const ver = bloque.getByRole('button', { name: 'Ver el cálculo por tramos' })
  test.skip(await ver.count() === 0, 'Ejercicio sin base positiva')
  await ver.click()
  await expect(bloque.getByRole('button', { name: 'Ocultar el cálculo por tramos' })).toHaveAttribute('aria-expanded', 'true')
  await expect(bloque.getByText(/^Estimación orientativa/)).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`resumen del ejercicio sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/fiscal')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('button', celda('Ganancias')).waitFor({ timeout: 15_000 }).catch(() => {})
    const ver = page.getByRole('button', { name: 'Ver el cálculo por tramos' })
    if (await ver.count()) await ver.click()
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
