import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Tabla de posiciones (#527): columnas elegibles que se guardan en la
// configuración, break-even legible (precio medio, barra y distancia sin
// solaparse) y tarjetas en pantallas estrechas. Solo lectura:
// /api/settings/config se intercepta y la base de datos real no se toca.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function withConfig(page: Page, preset: Record<string, string> = {}) {
  const overrides: Record<string, string> = { ...preset }
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const { key, value } = route.request().postDataJSON() as { key: string; value: string }
      overrides[key] = value
      await route.fulfill({ json: { success: true } })
      return
    }
    try {
      const real = await route.fetch()
      await route.fulfill({ response: real, json: { ...(await real.json()), ...overrides } })
    } catch { /* navegación en curso */ }
  })
  return overrides
}

// Pantalla ancha: con el menú abierto caben todas las columnas (#527).
test.use({ viewport: { width: 1920, height: 1000 } })

const tabla = (page: Page) => page.getByRole('region', { name: 'Posiciones' }).getByRole('table')
const cabeceras = async (page: Page) => (await tabla(page).locator('thead th').allTextContents()).map(t => t.trim())

async function abrirPortfolio(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/portfolio')
  await page.getByRole('radio', { name: 'Por activo' }).click()
  const lotes = await (await page.request.get('/api/fifo/lots')).json() as unknown[]
  test.skip(lotes.length === 0, 'Sin posiciones abiertas')
  await tabla(page).locator('tbody tr[data-row-key]').first().waitFor({ timeout: 15_000 })
}

test('las columnas elegidas se aplican al momento y se mantienen al recargar', async ({ page }) => {
  const guardado = await withConfig(page)
  await abrirPortfolio(page)
  // Por defecto: las nuevas visibles y las opcionales ocultas.
  expect(await cabeceras(page)).toEqual(expect.arrayContaining(['Coste', 'Resultado total', 'Antigüedad']))
  expect((await cabeceras(page)).join('|')).not.toMatch(/Ingresos|Desde máx/)

  await page.getByRole('button', { name: /^Columnas de la tabla/ }).click()
  await page.getByRole('option', { name: 'Coste', exact: true }).click()
  await page.getByRole('option', { name: 'Ingresos', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => cabeceras(page)).toContain('Ingresos')
  expect(await cabeceras(page)).not.toContain('Coste')
  expect(JSON.parse(guardado.portfolio_columnas)).toEqual(expect.arrayContaining(['ingresos']))
  expect(JSON.parse(guardado.portfolio_columnas)).not.toContain('coste')

  // La cantidad va bajo el activo, no como columna; «Valor» sigue tras precio y tendencia.
  const h = await cabeceras(page)
  expect(h).not.toContain('Cantidad')
  expect(h.indexOf('Valor')).toBeGreaterThan(h.indexOf('Precio'))
  expect(h.indexOf('Valor')).toBeLessThan(h.indexOf('P&L'))

  await page.reload()
  await page.getByRole('radio', { name: 'Por activo' }).click()
  await expect.poll(() => cabeceras(page)).toContain('Ingresos')
  expect(await cabeceras(page)).not.toContain('Coste')
  // Cada fila tiene tantas celdas como cabeceras.
  const n = (await cabeceras(page)).length
  await expect(tabla(page).locator('tbody tr[data-row-key]').first().locator('td')).toHaveCount(n)
})

test('el mismo ajuste se edita desde Ajustes', async ({ page }) => {
  const guardado = await withConfig(page, { portfolio_columnas: '["precio","pnl"]' })
  await page.goto('/settings?tab=general')
  const selector = page.getByRole('button', { name: /^Columnas de la tabla/ })
  await expect(selector).toHaveAccessibleName('Columnas de la tabla: 2 columnas')
  await selector.click()
  await page.getByRole('option', { name: 'Coste', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => guardado.portfolio_columnas).toBe('["precio","coste","pnl"]')
})

test('break-even: precio medio, barra y distancia sin solaparse', async ({ page }) => {
  await withConfig(page)
  await abrirPortfolio(page)
  const barra = tabla(page).getByTestId('breakeven-bar').first()
  test.skip(await barra.count() === 0, 'Sin precios en vivo no hay distancia al break-even')
  const celda = barra.locator('xpath=ancestor::td[1]')
  const [precio, distancia] = [celda.locator('span.leading-none').first(), celda.locator('span.text-\\[11px\\]').first()]
  const [a, b, c] = await Promise.all([precio.boundingBox(), barra.boundingBox(), distancia.boundingBox()])
  expect(a && b && c).toBeTruthy()
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y + 0.5)
  expect(b!.y + b!.height).toBeLessThanOrEqual(c!.y + 0.5)
  await expect(distancia).toHaveText(/sobre coste|falta/)
})

test('la tabla y el selector de columnas pasan axe', async ({ page }) => {
  await withConfig(page, { portfolio_columnas: '["cantidad","precio","tendencia","coste","pnl","resultado","breakeven","antiguedad","peso","maximo90","ingresos"]' })
  await abrirPortfolio(page)
  await expect.poll(() => cabeceras(page)).toContain('Desde máx. 90 d')
  const r = await (await axeEstable(page)).include('main').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('si no caben, se ocultan las de menor prioridad con aviso y vuelven al plegar el menú o ampliar', async ({ page }) => {
  await withConfig(page)
  await page.addInitScript(() => localStorage.setItem('cflio_sidebar_collapsed', 'false'))
  await abrirPortfolio(page)
  const completas = (await cabeceras(page)).length
  const aviso = page.getByRole('region', { name: 'Posiciones' }).getByRole('status').filter({ hasText: /No caben? / })
  await expect(aviso).toHaveCount(0)

  await page.setViewportSize({ width: 1150, height: 1000 })
  await expect(aviso).toBeVisible()
  expect((await cabeceras(page)).length).toBeLessThan(completas)
  // Nada se corta: la tabla no es más ancha que su panel.
  expect(await tabla(page).evaluate(t => t.scrollWidth <= (t.parentElement?.clientWidth ?? 0) + 1)).toBe(true)
  const ocultas = completas - (await cabeceras(page)).length

  await aviso.getByRole('button', { name: 'Plegar el menú' }).click()
  await expect.poll(async () => completas - (await cabeceras(page)).length).toBeLessThan(ocultas)

  await page.setViewportSize({ width: 1920, height: 1000 })
  await expect.poll(async () => (await cabeceras(page)).length).toBe(completas)
  await expect(aviso).toHaveCount(0)
})

test('el resultado total desglosa lo realizado en su globo', async ({ page }) => {
  await withConfig(page)
  await abrirPortfolio(page)
  const disparador = tabla(page).locator('tbody tr[data-row-key]').getByRole('button').filter({ hasText: /^[+-]\d/ }).first()
  test.skip(await disparador.count() === 0, 'Sin precios en vivo no hay resultado total')
  await disparador.hover()
  const globo = page.getByRole('tooltip').filter({ hasText: 'Resultado total' })
  await expect(globo).toContainText('No realizado (lo que tienes)')
})

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('tarjetas con lo esencial en lugar de la tabla, sin desplazamiento lateral', async ({ page }) => {
    await withConfig(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/portfolio')
    await page.getByRole('radio', { name: 'Por activo' }).click()
    const lotes = await (await page.request.get('/api/fifo/lots')).json() as unknown[]
    test.skip(lotes.length === 0, 'Sin posiciones abiertas')
    const region = page.getByRole('region', { name: 'Posiciones' })
    const lista = region.getByRole('list', { name: 'Posiciones' })
    await expect(lista.getByRole('listitem').first()).toBeVisible({ timeout: 15_000 })
    await expect(region.getByRole('table')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const r = await (await axeEstable(page)).include('main').withTags(WCAG).analyze()
    expect(r.violations).toEqual([])
  })
})
