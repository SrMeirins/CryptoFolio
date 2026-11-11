import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Corregir la zona horaria de una importación de Binance (#599). La detección y
// el impacto se simulan; no se aplica nada (se bloquea cualquier escritura).

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('el diálogo muestra la zona detectada, el impacto y es accesible', async ({ page }) => {
  await page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  await page.route('**/api/imports/*/zona-horaria', r => r.fulfill({ json: {
    exchange: 'binance', desfaseActual: 0, deteccion: { desfaseHoras: 2, coincidencias: 18, muestras: 20, confianza: 'alta' },
  } }))
  await page.route('**/api/imports/*/zona-horaria/impacto*', r => r.fulfill({ json: { desplazadas: 10, respetadas: 0, cambianDia: 1, cambianAnio: 0 } }))
  await page.goto('/import')
  const boton = page.getByRole('button', { name: /^Corregir la zona horaria de / }).first()
  await boton.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await boton.count() === 0, 'Sin importaciones de Binance en estos datos')

  await boton.click()
  const dialogo = page.getByRole('dialog', { name: 'Corregir zona horaria' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText('Detectada UTC+2: 18 de 20 órdenes coinciden con el mercado.')).toBeVisible()
  await expect(dialogo.getByText(/^Se desplazarán 10 transacciones 2 horas antes; 1 cambian de día y 0 de año\./)).toBeVisible()
  await expect(dialogo.getByRole('button', { name: 'Aplicar UTC+2 y recalcular' })).toBeEnabled()

  const r = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])

  await page.keyboard.press('Escape')
  await expect(dialogo).toHaveCount(0)
})
