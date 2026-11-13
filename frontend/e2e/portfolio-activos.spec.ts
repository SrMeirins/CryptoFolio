import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Filtro de varios activos en Portfolio (#524): el selector «Activos» junto
// al buscador o ?activos=AAA,BBB en la URL (desde el Dashboard) muestran solo
// esos activos con una pastilla de fichas quitables; un símbolo inválido se
// ignora y «Quitar filtro» limpia la URL. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Dos activos con posición abierta, según la API. */
async function dosActivos(page: Page): Promise<string[]> {
  const lotes = await (await page.request.get('/api/fifo/lots')).json() as { asset: string }[]
  const activos = [...new Set(lotes.map(l => l.asset))].sort()
  test.skip(activos.length < 3, 'Hacen falta al menos tres activos con posición')
  return activos.slice(0, 2)
}

const filasActivo = (page: Page) => page.locator('main tbody tr[data-row-key]').getByRole('button', { name: /^Detalle de [A-Z0-9]+$/ })

test('?activos= filtra la tabla, ignora lo inválido y se quita ficha a ficha', async ({ page }) => {
  const [a, b] = await dosActivos(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/portfolio?activos=${a.toLowerCase()},${b},<x>,${a}`)
  await page.getByRole('radio', { name: 'Por activo' }).click()
  const pastilla = page.getByRole('group', { name: 'Filtrando 2 activos' })
  await expect(pastilla.getByRole('list', { name: 'Activos del filtro' }).getByRole('listitem')).toHaveCount(2)
  // Solo filas de esos activos (alguno puede estar en «Saldos residuales», plegado).
  await expect.poll(() => filasActivo(page).count()).toBeGreaterThan(0)
  const etiquetas = await filasActivo(page).evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
  expect(etiquetas.every(t => t === `Detalle de ${a}` || t === `Detalle de ${b}`)).toBe(true)
  const r = await (await axeEstable(page)).include('[role="group"][aria-label^="Filtrando"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
  // Quitar una ficha deja el otro activo y actualiza la URL.
  await pastilla.getByRole('button', { name: `Quitar ${a} del filtro` }).click()
  await expect(page.getByRole('group', { name: 'Filtrando 1 activo' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`activos=${b}(&|$)`))
  // «Quitar filtro» limpia el parámetro y vuelve la cartera entera.
  await page.getByRole('group', { name: 'Filtrando 1 activo' }).getByRole('button', { name: 'Quitar filtro' }).click()
  await expect(page).not.toHaveURL(/activos=/)
  await expect(page.getByRole('group', { name: /^Filtrando/ })).toHaveCount(0)
  await expect.poll(() => filasActivo(page).count()).toBeGreaterThan(2)
})

test('una lista sin ningún símbolo válido no filtra ni rompe la página', async ({ page }) => {
  await page.goto('/portfolio?activos=<x>,a-b,')
  await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible()
  await expect(page.getByRole('group', { name: /^Filtrando/ })).toHaveCount(0)
})

test('el selector «Activos» crea el filtro, lo lleva a la URL y muestra la pastilla', async ({ page }) => {
  const [a, b] = await dosActivos(page)
  await page.goto('/portfolio')
  await page.getByRole('button', { name: /^Filtrar por activos/ }).click()
  await page.getByRole('option', { name: a, exact: true }).click()
  await page.getByRole('option', { name: b, exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Filtrando 2 activos' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`activos=${a},${b}(&|$)`))
  const r = await (await axeEstable(page)).include('main').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})
