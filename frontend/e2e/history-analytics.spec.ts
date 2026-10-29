import { expect, test } from '@playwright/test'

// Analítica del Historial (#413): pulsar un periodo filtra la lista por sus
// fechas y otra vez lo quita; la tabla accesible no ocupa sitio. Solo lectura.

test('pulsar un periodo del gráfico filtra por sus fechas y se quita al pulsarlo otra vez', async ({ page }) => {
  await page.goto('/history')
  const abrir = page.getByRole('button', { name: /Analítica de actividad/ })
  if (await abrir.getAttribute('aria-expanded') === 'false') await abrir.click()
  const panel = page.locator('#historial-analitica')
  const periodo = panel.getByRole('button', { name: /^Filtrar [^:]+ \d{2}: / }).first()
  await periodo.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/[?&]desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}/)
  const quitar = panel.getByRole('button', { name: /^Quitar el filtro de/ })
  await expect(quitar).toHaveAttribute('aria-pressed', 'true')
  await quitar.click()
  await expect(page).not.toHaveURL(/desde=/)

  // La tabla para lectores de pantalla sigue ahí, sin ocupar sitio.
  const oculta = panel.locator('div.sr-only').filter({ has: page.locator('caption') })
  const caja = await oculta.boundingBox()
  expect(caja && caja.width <= 1 && caja.height <= 1).toBe(true)
})
