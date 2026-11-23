import { expect, test } from '@playwright/test'
import { axeEstable } from './axe'

// Resumen de los últimos 7 días (#522): las cifras coinciden con las de cada
// pantalla para el mismo periodo (P&L diario con «7 d» y el Historial con ese
// rango), los enlaces llevan a su sitio, privacidad, axe y 390 px.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// El panel se fuerza abierto solo en el navegador de la prueba, sin escribir
// la configuración (otra prueba o el usuario pueden tenerlo minimizado).
test.beforeEach(async ({ page }) => {
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    const json = await res.json() as Record<string, string>
    json.dashboard_diseno = JSON.stringify({ orden: [], ocultos: [], contraidos: [] })
    await route.fulfill({ response: res, json })
  })
})

// Sin desvíos en vuelo al terminar: si no, el error cae en la siguiente prueba del worker.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

const celda = (page: import('@playwright/test').Page, etiqueta: RegExp) =>
  page.getByTestId('resumen-semana').getByTestId('celda-resumen').filter({ hasText: etiqueta })

test('el P&L de 7 días coincide con P&L diario y su celda lleva allí', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const pnl = celda(page, /P&L de la semana/)
  await expect(pnl.locator('.mono').first()).toHaveText(/\d/, { timeout: 20_000 })
  const cifra = (await pnl.locator('.mono').first().innerText()).trim()
  await pnl.getByRole('button').click()
  await expect(page).toHaveURL(/pnl-diario=7d/)
  const cabecera = page.getByTestId('cabecera-pnl-periodo')
  await expect(cabecera).toBeVisible()
  // Hoy va en vivo en los dos: se compara el texto mostrado tras la misma actualización.
  await expect.poll(async () => {
    const a = (await cabecera.locator('.text-3xl').innerText()).trim()
    const b = (await celda(page, /P&L de la semana/).locator('.mono').first().innerText()).trim()
    return a === b
  }, { timeout: 15_000 }).toBe(true)
  expect(cifra).toMatch(/€|\$/)
})

test('las operaciones coinciden con el Historial del mismo rango', async ({ page }) => {
  await page.goto('/')
  const ops = celda(page, /Operaciones/)
  await expect(ops.locator('.mono').first()).toHaveText(/^\d+$/, { timeout: 20_000 })
  const n = Number((await ops.locator('.mono').first().innerText()).trim())
  await ops.getByRole('link').click()
  await expect(page).toHaveURL(/\/history\?desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}/)
  const subtitulo = page.locator('header').filter({ has: page.getByRole('heading', { name: 'Historial', level: 1 }) })
  if (n === 0) await expect(subtitulo).toContainText('Sin resultados para estos filtros')
  else await expect(subtitulo).toContainText(`${n.toLocaleString('es-ES')} transacciones filtradas`)
})

test('Avisos abre la campana', async ({ page }) => {
  await page.goto('/')
  await celda(page, /Avisos/).getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Avisos del sistema' })).toBeVisible()
})

test('con la privacidad, ningún importe en el resumen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cryptofolio.privacy', '1'))
  await page.goto('/')
  const panel = page.getByTestId('resumen-semana')
  await expect(celda(page, /P&L de la semana/)).toContainText('%', { timeout: 20_000 })
  expect(await panel.innerText()).not.toMatch(/\d[\d.,]*\s?[€$]/)
})

for (const theme of ['dark', 'light'] as const) {
  test(`resumen de 7 días sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(celda(page, /P&L de la semana/)).toContainText('%', { timeout: 20_000 })
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('[data-testid="resumen-semana"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('a 390 px el resumen no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('resumen-semana')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
