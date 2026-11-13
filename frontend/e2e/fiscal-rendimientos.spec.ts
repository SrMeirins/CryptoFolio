import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Rendimientos de Fiscal (#544): tira por tipo que filtra, secciones por base
// agrupadas por mes, estado de las unidades, «Revisar» y ayuda. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const eur = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'))

/** Ejercicio con rendimientos, según la API. */
async function anioConRendimientos(page: Page): Promise<number | null> {
  const years = await (await page.request.get('/api/fiscal/years')).json() as number[]
  for (const y of years) {
    const { rendimientos } = await (await page.request.get(`/api/fiscal/${y}/events`)).json() as { rendimientos: unknown[] }
    if (rendimientos.length > 0) return y
  }
  return null
}

async function abrir(page: Page) {
  const anio = await anioConRendimientos(page)
  test.skip(anio === null, 'Sin rendimientos en estos datos')
  await page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  await page.setViewportSize({ width: 1680, height: 1050 })
  // Sin animaciones de entrada: axe mide el contraste de la pantalla asentada,
  // no un fotograma del fundido (en CI, con el runner cargado, lo pillaba a medias).
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/fiscal?vista=operaciones&anio=${anio}&seccion=rendimientos`)
  const seccion = page.locator('#fiscal-rendimientos')
  await seccion.waitFor({ timeout: 15_000 })
  return { seccion, anio: anio! }
}

test('los totales de cada base cuadran con el resumen del ejercicio', async ({ page }) => {
  const { seccion, anio } = await abrir(page)
  const s = await (await page.request.get(`/api/fiscal/${anio}/summary`)).json() as { totalRendimientos: number; totalBaseGeneral?: number }
  const tablas = seccion.getByRole('table')
  const ahorro = tablas.filter({ has: page.locator('caption', { hasText: /^Rendimientos del capital mobiliario/ }) })
  if (await ahorro.count() > 0) expect(eur(await ahorro.locator('tfoot td.font-bold').innerText())).toBeCloseTo(s.totalRendimientos, 1)
  const general = tablas.filter({ has: page.locator('caption', { hasText: /^Rendimientos de la base general/ }) })
  if (await general.count() > 0 && s.totalBaseGeneral !== undefined) {
    expect(eur(await general.locator('tfoot td.font-bold').innerText())).toBeCloseTo(s.totalBaseGeneral, 1)
  }
})

test('la tira filtra por tipo y cada fila dice el estado de sus unidades', async ({ page }) => {
  const { seccion } = await abrir(page)
  const celdas = seccion.getByRole('button', { name: /^Ver .+ en la tabla/ })
  test.skip(await celdas.count() < 2, 'Un solo tipo de rendimiento')
  const filas = () => seccion.locator('tr[data-rendimiento]')
  const antes = await filas().count()
  await celdas.first().click()
  await expect.poll(() => filas().count()).toBeLessThan(antes)
  await celdas.first().click()
  await expect.poll(() => filas().count()).toBe(antes)
  await expect(seccion.getByRole('button', { name: /^(Conservadas|Ya no las tienes|Conservas el \d+ %)\. Ver detalle$/ }).first()).toBeVisible()
})

test('«¿Cómo tributan?» abre la ayuda en Rendimientos y la sección no tiene violaciones de axe', async ({ page }) => {
  const { seccion } = await abrir(page)
  const r = await new AxeBuilder({ page }).include('#fiscal-rendimientos').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
  await seccion.getByRole('button', { name: '¿Cómo tributan?' }).click()
  await expect(page.getByRole('heading', { name: 'Rendimientos', exact: true })).toBeFocused()
})

test('pulsar «Revisar» abre la ayuda (un enlace dentro del tooltip no se alcanza)', async ({ page }) => {
  const { seccion } = await abrir(page)
  const revisar = seccion.getByRole('button', { name: /^Por revisar: .+ Pulsa para ver cómo tributan los rendimientos\.$/ }).first()
  test.skip(await revisar.count() === 0, 'Sin airdrops ni cashback en estos datos')
  await revisar.click()
  await expect(page.getByRole('heading', { name: 'Rendimientos', exact: true })).toBeFocused()
})
