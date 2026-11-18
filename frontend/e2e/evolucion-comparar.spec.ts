import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { axeEstable } from './axe'

// Evolución (#510): comparar con BTC o ETH, exportar a PNG y CSV (este no con
// los importes ocultos) y pantalla completa. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function grafico(page: Page, ruta = '/?evolucion=1a') {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ruta)
  const g = page.getByTestId('grafico-evolucion')
  await g.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await g.count() === 0, 'Sin historia diaria en estos datos')
  await g.scrollIntoViewIfNeeded()
  return g
}

async function comparar(page: Page, ref: 'BTC' | 'ETH') {
  await page.getByRole('button', { name: `Comparar con ${ref}` }).click()
}

test('comparar con BTC: leyenda, línea y su valor en el tooltip', async ({ page }) => {
  const g = await grafico(page)
  await comparar(page, 'BTC')
  await expect(page.getByRole('button', { name: 'Comparar con BTC' })).toHaveAttribute('aria-pressed', 'true')
  const sinPrecios = page.getByText(/^Preparando los precios de BTC/)
  await expect(page.getByText(/^BTC con tus mismos depósitos y retiradas/).or(sinPrecios)).toBeVisible({ timeout: 15_000 })
  test.skip(await sinPrecios.isVisible(), 'Sin cierres de BTC en este entorno')
  await expect(g.locator('.recharts-area path[name="BTC"], .recharts-area-curve[name="BTC"]').first()).toBeAttached()
  const box = (await g.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 4 })
  await expect(page.getByText('Con BTC', { exact: true })).toBeVisible()
  // La ayuda explica qué significa la línea.
  await page.getByRole('button', { name: 'Qué muestra la comparación' }).hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'mismos depósitos y retiradas' })).toBeVisible()
  // Sin comparar, la línea desaparece.
  await page.getByRole('group', { name: 'Comparar' }).getByRole('button', { name: 'Ninguno' }).click()
  await expect(page.getByText(/^BTC con tus mismos depósitos/)).toHaveCount(0)
})

test('exportar a CSV para hoja de cálculo en castellano y a PNG', async ({ page }) => {
  await grafico(page)
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar los datos a CSV' }).click()])
  expect(csv.suggestedFilename()).toMatch(/^evolucion_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/)
  const texto = readFileSync((await csv.path())!, 'utf8')
  expect(texto.charCodeAt(0)).toBe(0xfeff)
  const [cab, fila] = texto.slice(1).split('\r\n')
  expect(cab.split(';')[0]).toBe('Fecha')
  expect(fila).toMatch(/^\d{4}-\d{2}-\d{2};/)
  expect(fila).not.toMatch(/\d\.\d/)
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar el gráfico a PNG' }).click()])
  expect(png.suggestedFilename()).toMatch(/\.png$/)
  const bytes = readFileSync((await png.path())!)
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
})

test('con los importes ocultos no se ofrece el CSV', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cryptofolio.privacy', '1'))
  await grafico(page)
  await expect(page.getByRole('region', { name: 'Evolución de la cartera' }).getByRole('button', { name: 'Exportar a CSV (no disponible con los importes ocultos)' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Exportar el gráfico a PNG' })).toBeEnabled()
})

test('pantalla completa con el botón y salida con Escape', async ({ page }) => {
  await grafico(page)
  const boton = page.getByRole('button', { name: 'Ver en pantalla completa' })
  test.skip(await boton.count() === 0, 'Sin API de pantalla completa en este navegador')
  await boton.click()
  // En pantalla completa queda el panel de Evolución, con su gráfico dentro.
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement?.querySelector('[data-testid="grafico-evolucion"]'))).toBe(true)
  await expect(page.getByRole('button', { name: 'Salir de pantalla completa' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()
})

for (const theme of ['dark', 'light'] as const) {
  test(`comparación y exportar sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await grafico(page)
    await comparar(page, 'ETH')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('#evolucion').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
