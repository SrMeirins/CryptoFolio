import { expect, test } from '@playwright/test'
import { axeEstable } from './axe'

// Mapa de movimientos del Dashboard (#438): con una tesela activa, el resto se
// atenúa solo en el fondo; el texto conserva su opacidad y su contraste.
// Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const theme of ['dark', 'light'] as const) {
  test(`teselas atenuadas sin perder contraste (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const tiles = page.locator('[data-heat-tile]')
    await tiles.first().waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await tiles.count() < 2, 'Menos de dos posiciones en el mapa')
    await tiles.first().hover()
    const dimmed = page.locator('[data-heat-tile][data-dimmed]')
    await expect(dimmed.first()).toBeVisible()
    // Ni la tesela ni su texto llevan opacidad: solo la capa del fondo.
    const opacity = await dimmed.first().evaluate(el => [getComputedStyle(el).opacity, getComputedStyle(el.querySelector('.font-semibold')!).opacity])
    expect(opacity).toEqual(['1', '1'])
    await page.waitForTimeout(300)
    const { violations } = await (await axeEstable(page)).include('[data-heat-tile]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

// Panel Variación (#513): foco itinerante, enlaces a Portfolio, cambio de
// métrica sin nueva petición, contadores en la leyenda y distintivos.

async function mapa(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const tiles = page.locator('[data-heat-tile]')
  await tiles.first().waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await tiles.count() < 2, 'Menos de dos posiciones en el mapa')
  await tiles.first().scrollIntoViewIfNeeded()
  return tiles
}

test('un solo Tab entra en el mapa, las flechas recorren las casillas e Intro abre Portfolio', async ({ page }) => {
  const tiles = await mapa(page)
  await expect(tiles.and(page.locator('[tabindex="0"]'))).toHaveCount(1)
  await tiles.first().focus()
  const antes = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  for (const k of ['ArrowRight', 'ArrowDown', 'End']) {
    await page.keyboard.press(k)
    if (await page.evaluate(a => document.activeElement?.getAttribute('aria-label') !== a, antes)) break
  }
  const ahora = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  expect(ahora).not.toBe(antes)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('tabindex'))).toBe('0')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/portfolio\?(activo|activos)=/)
})

test('«Otros» abre Portfolio filtrado con sus activos', async ({ page }) => {
  await mapa(page)
  const otros = page.locator('[data-heat-tile][aria-label^="Otros ("]')
  test.skip(await otros.count() === 0, 'Sin grupo «Otros» con estos datos')
  await otros.click()
  await expect(page).toHaveURL(/\/portfolio\?activos=[^&]+,/)
})

test('cada fila del ranking lleva al activo en Portfolio', async ({ page }) => {
  await mapa(page)
  const fila = page.getByRole('link', { name: /^1\. .+\. Ver .+ en Portfolio$/ }).first()
  // La barra dice qué parte del movimiento de la cartera explica el activo.
  await expect(fila).toContainText(/Aporta [+\u2212]?[\d.]+,\d{2}\s?€ de [+\u2212]?[\d.]+,\d{2}\s?€ (hoy|en 24 h|desde la compra)/)
  const nombre = (await fila.getAttribute('aria-label'))!.match(/Ver (.+) en Portfolio$/)![1]
  await fila.click()
  await expect(page).toHaveURL(new RegExp(`/portfolio\\?activo=${encodeURIComponent(nombre)}$`))
})

test('cambiar de métrica no hace peticiones y mantiene contadores y distintivos', async ({ page }) => {
  await mapa(page)
  await expect(page.getByText(/^(\d+ (suben|sube|en ganancia)|Todos (suben|bajan|en ganancia|en pérdida) \(\d+\))$/).first()).toBeVisible()
  const peticiones: string[] = []
  page.on('request', r => { if (r.url().includes('/api/')) peticiones.push(r.url()) })
  const grupo = page.getByRole('radiogroup', { name: 'Métrica de mejores y peores' })
  const actual = await grupo.getByRole('radio', { checked: true }).textContent()
  await grupo.getByRole('radio', { name: actual?.trim() === 'Total' ? '24h' : 'Total' }).click()
  await page.waitForTimeout(400)
  expect(peticiones).toEqual([])
  await expect(page.locator('[data-heat-tile][aria-label*=", mejor activo:"], [data-heat-tile][aria-label*=", peor activo:"]').first()).toBeAttached()
})

for (const theme of ['dark', 'light'] as const) {
  test(`panel Variación completo sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await mapa(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    const panel = page.locator('[data-heat-tile]').first().locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')
    const sel = await panel.evaluate(el => { el.setAttribute('data-panel-variacion', ''); return '[data-panel-variacion]' })
    const { violations } = await (await axeEstable(page)).include(sel).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('en «Hoy» el neto del panel es el P&L de hoy de la tarjeta', async ({ page }) => {
  await mapa(page)
  const num = (t: string) => Number(t.replace(/\u2212/g, '-').replace(/[^\d,+-]/g, '').replace(',', '.'))
  await page.getByRole('radiogroup', { name: 'Métrica de mejores y peores' }).getByRole('radio', { name: 'Hoy' }).click()
  const resumen = page.getByTestId('resumen-variacion')
  await expect(resumen).toContainText('(el de la tarjeta)')
  const tarjeta = page.getByRole('button', { name: /^P&L no realizado: / }).locator('xpath=..')
  // Ambos se recalculan con cada precio en vivo: se comparan hasta que coinciden.
  await expect.poll(async () => {
    const m = ((await tarjeta.textContent()) ?? '').match(/Hoy\s*([+\u2212-]?[\d.]+,\d{2})/)
    const spans = await resumen.locator('span.mono').allTextContents()
    return m ? Math.abs(num(spans[spans.length - 1]) - num(m[1])) < 0.02 : 'sin chip'
  }, { timeout: 10_000 }).toBe(true)
})
