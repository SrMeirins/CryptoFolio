import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Estados vacíos (#496): con la base vacía, Dashboard, Portfolio y Fiscal
// muestran el vacío de primer uso; un filtro sin resultados en Historial ofrece
// «Quitar filtros». Solo lectura: lo que no es GET se bloquea y la base vacía
// se simula con respuestas sintéticas.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

async function baseVacia(page: Page) {
  await soloLectura(page)
  await page.route('**/api/settings/stats', route => route.fulfill({ json: {
    transactions: 0, fifoLots: 0, imports: 0, priceCache: 0, wallets: 0, assets: 0,
    dbSizeBytes: 0, lastImportAt: null, lastFifoAt: null, lastBackupAt: null,
  } }))
  await page.route('**/api/fiscal/years', route => route.fulfill({ json: [] }))
}

for (const ruta of ['/', '/portfolio', '/fiscal']) {
  test(`${ruta} con la base vacía: vacío de primer uso con sus dos acciones`, async ({ page }) => {
    await baseVacia(page)
    await page.goto(ruta)
    const vacio = page.getByText('Aún no hay operaciones')
    await expect(vacio).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Importar' })).toHaveAttribute('href', '/import')
    await expect(page.getByRole('button', { name: 'Añadir a mano' })).toBeVisible()
  })
}

test('«Añadir a mano» abre el diálogo en el sitio y Escape lo cierra', async ({ page }) => {
  await baseVacia(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir a mano' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const theme of ['dark', 'light'] as const) {
  test(`vacío de primer uso sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await baseVacia(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await expect(page.getByText('Aún no hay operaciones')).toBeVisible()
    const r = await new AxeBuilder({ page }).withTags(WCAG).include('main').analyze()
    expect(r.violations).toEqual([])
  })
}

test('Historial: un filtro sin resultados ofrece «Quitar filtros» y lo deshace', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('combobox', { name: /Buscar/ }).fill('AAA-sin-resultados')
  const vacio = page.locator('[data-empty="filtros"]')
  await expect(vacio).toBeVisible()
  await expect(vacio).toContainText('AAA-sin-resultados')
  await vacio.getByRole('button', { name: 'Quitar filtros' }).click()
  await expect(page.getByRole('table')).toBeVisible()
})
