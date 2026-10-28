import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { abrirMasFiltros } from './historyHelpers'

// Atajos de teclado y saltos por año del Historial (#382). Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openHistory(page: Page, path = '/history') {
  await page.goto(path)
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  await expect(page.getByRole('table')).toBeVisible()
}
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
const years = async (page: Page) => ((await (await page.request.get('/api/transactions/facets')).json()) as { years: number[] }).years

test('«/» enfoca la búsqueda y las flechas saltan de año fiscal', async ({ page }) => {
  await openHistory(page)
  // El selector de año está en «Más filtros» (#414); las flechas funcionan igual.
  await abrirMasFiltros(page)
  const ys = await years(page)
  const ultimo = ys[ys.length - 1]

  await blur(page)
  await page.keyboard.press('/')
  await expect(page.getByRole('combobox', { name: /Buscar/ })).toBeFocused()

  // Escribiendo, las flechas no cambian de año.
  await page.keyboard.press('ArrowLeft')
  await expect(page).not.toHaveURL(/desde=/)

  await blur(page)
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(new RegExp(`desde=${ultimo}-01-01&hasta=${ultimo}-12-31`))
  await expect(page.getByRole('button', { name: /Filtrar por año/ })).toContainText(String(ultimo))
  await expect(page.getByRole('button', { name: 'Año siguiente' })).toBeDisabled()

  if (ys.length > 1) {
    await blur(page)
    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(new RegExp(`desde=${ys[ys.length - 2]}-01-01`))
    await page.getByRole('button', { name: 'Año siguiente' }).click()
    await expect(page).toHaveURL(new RegExp(`desde=${ultimo}-01-01`))
  }
})

test('«?» abre la ayuda accesible; Esc la cierra y devuelve el foco', async ({ page }) => {
  await openHistory(page)
  const boton = page.getByRole('button', { name: 'Atajos de teclado' })
  await expect(boton).toHaveAttribute('aria-keyshortcuts', '?')
  await blur(page)
  await page.keyboard.press('Shift+?')
  const dialog = page.getByRole('dialog', { name: 'Atajos de teclado' })
  await expect(dialog).toBeVisible()
  for (const theme of ['dark', 'light'] as const) {
    // Sin transiciones y con una pausa: axe no debe medir colores a medio cambiar.
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include('[role="dialog"]').analyze()
    expect(violations.map(v => `${theme}: ${v.id}`)).toEqual([])
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await boton.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(boton).toBeFocused()
})

test('la tabla es una sola parada de Tab: flechas, Inicio/Fin e Intro abren el detalle', async ({ page }) => {
  await openHistory(page)
  const filas = page.locator('tbody tr[data-row-index]')
  const n = await filas.count()
  test.skip(n < 2, 'hacen falta al menos dos filas')
  // Solo la fila activa (y sus botones) entra en el orden de Tab.
  await expect(page.locator('tbody tr[data-row-index][tabindex="0"]')).toHaveCount(1)

  await filas.nth(0).focus()
  await page.keyboard.press('ArrowDown')
  await expect(filas.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(filas.nth(n - 1)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(filas.nth(0)).toBeFocused()
  await expect(filas.nth(0)).toHaveAttribute('tabindex', '0')

  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/[?&]tx=/)
  const antes = page.url()
  // En el panel, flecha derecha pasa a la transacción siguiente.
  await page.keyboard.press('ArrowRight')
  await expect(page).not.toHaveURL(antes)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('Fiscal enlaza las operaciones de su año en el Historial', async ({ page }) => {
  await page.goto('/fiscal')
  const enlace = page.getByRole('link', { name: /^Ver las operaciones de \d{4} en Historial$/ })
  // Fiscal carga sus años de forma asíncrona.
  await enlace.waitFor({ timeout: 10_000 }).catch(() => { /* sin años fiscales */ })
  test.skip(await enlace.count() === 0, 'sin años fiscales en estos datos')
  const anio = (await enlace.textContent())?.match(/\d{4}/)?.[0]
  await enlace.click()
  await expect(page).toHaveURL(new RegExp(`/history\\?desde=${anio}-01-01&hasta=${anio}-12-31`))
  await abrirMasFiltros(page)
  await expect(page.getByRole('button', { name: /Filtrar por año/ })).toContainText(anio ?? '')
})
