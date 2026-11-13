import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Fallo de una consulta (#498): el panel dice qué no se pudo cargar y ofrece
// Reintentar; el resto de la página sigue. Se fuerza un 500 sintético y, al
// reintentar, la consulta vuelve a ir al servidor. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function fallar(page: Page, patron: string) {
  let fallando = true
  await page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  await page.route(patron, r => (fallando ? r.fulfill({ status: 500, json: { error: 'fallo sintético' } }) : r.continue()))
  return { arreglar: () => { fallando = false } }
}

const CASOS = [
  { nombre: 'Dashboard, posiciones', ruta: '/', patron: '**/api/fifo/lots', titulo: 'No se pudieron cargar las posiciones' },
  { nombre: 'Fiscal, ejercicios', ruta: '/fiscal', patron: '**/api/fiscal/years', titulo: 'No se pudieron cargar los ejercicios fiscales' },
  { nombre: 'Ajustes, estadísticas', ruta: '/settings?tab=datos', patron: '**/api/settings/stats', titulo: 'No se pudieron cargar las estadísticas' },
]

for (const c of CASOS) {
  test(`${c.nombre}: error con Reintentar y recuperación`, async ({ page }) => {
    const red = await fallar(page, c.patron)
    await page.goto(c.ruta)
    const error = page.getByRole('alert').filter({ hasText: c.titulo })
    // react-query reintenta dos veces antes de dar el fallo por bueno.
    await expect(error).toBeVisible({ timeout: 15_000 })
    await expect(error).toContainText('Fallo interno de la aplicación')
    await expect(error).not.toContainText('fallo sintético')
    red.arreglar()
    await error.getByRole('button', { name: 'Reintentar' }).click()
    await expect(error).toHaveCount(0, { timeout: 15_000 })
  })
}

test('el error no tiene violaciones de axe', async ({ page }) => {
  await fallar(page, '**/api/fifo/lots')
  await page.goto('/')
  const error = page.getByRole('alert').filter({ hasText: 'No se pudieron cargar las posiciones' })
  await expect(error).toBeVisible({ timeout: 15_000 })
  const r = await (await axeEstable(page)).withTags(WCAG).include('main').analyze()
  expect(r.violations).toEqual([])
})
