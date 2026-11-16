import { expect, test } from '@playwright/test'
import { axeEstable } from './axe'

// Tarjetas de wallet proporcionales (#526): la cabecera filtra la tabla y cada
// activo abre su detalle, ambos con teclado; «Otras» agrupa las pequeñas; el
// umbral se cambia en Ajustes > General. Solo lectura (escrituras interceptadas).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('la cabecera filtra y un activo abre su detalle, con teclado; sin violaciones de axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portfolio')
  const lista = page.getByRole('list', { name: /^Wallets:/ })
  const cabecera = lista.getByRole('button', { name: /Filtrar la tabla por esta wallet$/ }).first()
  await cabecera.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await cabecera.count() === 0, 'Sin wallets con precio en estos datos')
  await cabecera.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/[?&]wallet=/)
  await expect(lista.getByRole('button', { name: /Quitar el filtro de la tabla$/ })).toHaveAttribute('aria-pressed', 'true')
  const activo = lista.getByRole('button', { name: /^[A-Z0-9]+: .* Ver su detalle$/ }).first()
  const asset = (await activo.getAttribute('aria-label'))!.split(':')[0]
  await activo.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByRole('heading', { name: asset })).toBeVisible()
  await page.keyboard.press('Escape')
  const r = await (await axeEstable(page)).include('ul[aria-label^="Wallets:"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('con un umbral alto, las wallets pequeñas van juntas en «Otras»', async ({ page }) => {
  await page.route('**/api/settings/config', async r => {
    if (r.request().method() !== 'GET') return r.fulfill({ json: { success: true } })
    const real = await r.fetch()
    await r.fulfill({ response: real, json: { ...(await real.json()), wallets_otras_pct: '20' } })
  })
  await page.goto('/portfolio')
  const lista = page.getByRole('list', { name: /^Wallets:/ })
  await lista.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await lista.count() === 0, 'Sin wallets en estos datos')
  const otras = lista.getByText(/^Otras \(\d+\)$/)
  test.skip(await otras.count() === 0, 'Menos de dos wallets por debajo del 20 % en estos datos')
  await expect(lista.getByRole('list', { name: 'Wallets pequeñas' }).getByRole('button').first()).toHaveAccessibleName(/Filtrar la tabla por esta wallet$/)
})

test('el umbral de «Otras» se guarda en Ajustes > General', async ({ page }) => {
  const escrituras: { key: string; value: string }[] = []
  await page.route('**/api/settings/config', async r => {
    if (r.request().method() === 'PUT') { escrituras.push(r.request().postDataJSON() as { key: string; value: string }); return r.fulfill({ json: { success: true } }) }
    return r.continue()
  })
  await page.goto('/settings?tab=general')
  const campo = page.getByLabel('Wallets en «Otras»')
  await campo.fill('25')
  await campo.press('Enter')
  await expect(page.getByRole('alert')).toContainText('de 0 a 20')
  await campo.fill('5')
  await campo.press('Enter')
  await expect.poll(() => escrituras.at(-1)).toEqual({ key: 'wallets_otras_pct', value: '5' })
})

test('pasar por un activo de la lista resalta su tramo de la barra con su peso y valor', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portfolio')
  const lista = page.getByRole('list', { name: /^Wallets:/ })
  const activo = lista.getByRole('button', { name: /^[A-Z0-9]+: .* Ver su detalle$/ }).first()
  await activo.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await activo.count() === 0, 'Sin activos con precio en estos datos')
  const asset = (await activo.getAttribute('aria-label'))!.split(':')[0]
  await activo.hover()
  // El tramo muestra su activo, su peso y su valor.
  const tooltip = lista.locator('.shadow-lg', { hasText: asset })
  await expect(tooltip).toContainText('%')
  await page.mouse.move(0, 0)
  await expect(tooltip).toHaveCount(0)
  // Con el foco del teclado, igual.
  await activo.focus()
  await expect(tooltip).toBeVisible()
})
