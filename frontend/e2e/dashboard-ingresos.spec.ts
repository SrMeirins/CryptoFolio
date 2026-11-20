import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Ingresos pasivos (#518): el total del año coincide con Rendimientos de
// Fiscal, enlaces a Fiscal y al Historial, desglose por activo y wallet y
// axe. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const panel = (page: Page) => page.getByRole('heading', { name: 'Ingresos pasivos' }).locator('xpath=ancestor::div[contains(@class,"px-5")][1]')
const euros = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))

async function abrir(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const barras = page.getByTestId('ingresos-barras')
  await barras.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await barras.count() === 0, 'Sin ingresos pasivos en estos datos')
  await barras.scrollIntoViewIfNeeded()
}

test('el total del año coincide con los rendimientos de Fiscal de ese ejercicio', async ({ page }) => {
  await abrir(page)
  const anio = new Date().getFullYear()
  const celda = panel(page).getByRole('link', { name: `Ver Año ${anio} en Rendimientos de Fiscal` })
  await expect(celda).toBeVisible()
  const res = await page.request.get(`/api/fiscal/${anio}/events`)
  const { rendimientos } = await res.json() as { rendimientos: Array<{ valorEur: number }> }
  const fiscal = Math.round(rendimientos.reduce((s, r) => s + r.valorEur, 0) * 100) / 100
  await expect.poll(async () => Math.abs(euros(((await celda.textContent()) ?? '').replace(`Año ${anio}`, '').split('€')[0]) - fiscal)).toBeLessThan(0.011)
})

test('enlace a Rendimientos de Fiscal', async ({ page }) => {
  await abrir(page)
  await panel(page).getByRole('link', { name: 'Ver Rendimientos en Fiscal' }).click()
  await expect(page).toHaveURL(/\/fiscal\?(?=.*vista=operaciones)(?=.*seccion=rendimientos)/)
})

test('desglose por wallet: cada fila abre el Historial con esos ingresos', async ({ page }) => {
  await abrir(page)
  await panel(page).getByRole('radiogroup', { name: 'Desglosar los ingresos por' }).getByRole('radio', { name: 'Wallet' }).click()
  const fila = page.getByTestId('ingresos-desglose').getByRole('link').first()
  await fila.click()
  await expect(page).toHaveURL(/\/history\?(?=.*tipo=STAKING_REWARD)(?=.*desde=\d{4}-\d{2}-01)/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`Ingresos pasivos sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    const sel = await panel(page).evaluate(el => { el.setAttribute('data-panel-ingresos', ''); return '[data-panel-ingresos]' })
    const { violations } = await (await axeEstable(page)).include(sel).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
