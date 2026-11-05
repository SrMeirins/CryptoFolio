import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Componentes comunes en su página de prueba (épica #479, solo desarrollo).
// Datos sintéticos; solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

test.describe('StatStrip y StatCard (#490)', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`sin violaciones de axe (tema ${theme})`, async ({ page }) => {
      await soloLectura(page)
      await page.emulateMedia({ colorScheme: theme })
      await page.goto('/__componentes')
      await expect(page.getByRole('list', { name: 'Tira de prueba' })).toBeVisible()
      const r = await new AxeBuilder({ page }).withTags(WCAG).include('main').analyze()
      expect(r.violations).toEqual([])
    })
  }

  test('las celdas pulsables se activan con Enter y Espacio y anuncian su destino', async ({ page }) => {
    await soloLectura(page)
    await page.goto('/__componentes')
    const boton = page.getByRole('button', { name: 'Ver Pérdidas en Operaciones' })
    await boton.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('status')).toHaveText('Última celda pulsada: Pérdidas')
    const enlace = page.getByRole('link', { name: 'Ver Ganancias en Operaciones' })
    await enlace.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/vista=operaciones&resultado=ganancia/)
  })

  test.describe('a 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test('dos columnas y sin scroll horizontal', async ({ page }) => {
      await soloLectura(page)
      await page.goto('/__componentes')
      const celdas = page.getByRole('list', { name: 'Tira de prueba' }).getByRole('listitem')
      const [a, b] = await Promise.all([celdas.nth(0).boundingBox(), celdas.nth(1).boundingBox()])
      expect(Math.abs((a?.y ?? 0) - (b?.y ?? 1))).toBeLessThan(2) // misma fila
      const desborde = await page.evaluate(() => { const m = document.querySelector('main')!; return m.scrollWidth - m.clientWidth })
      expect(desborde).toBe(0)
    })
  })

  test('las StatCard de una fila quedan alineadas aunque les falte chip o serie', async ({ page }) => {
    await soloLectura(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/__componentes')
    const alturas = await page.locator('.stat-card').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
    expect(new Set(alturas).size).toBe(1)
  })
})
