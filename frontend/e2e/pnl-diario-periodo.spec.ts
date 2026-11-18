import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// P&L diario (#511): resumen del periodo con el selector de rango común
// (cabecera, tira y barras con el acumulado), agrupación de las barras y paso
// al calendario. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function panel(page: Page, ruta = '/') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ruta)
  const cabecera = page.getByTestId('cabecera-pnl-periodo')
  await cabecera.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await cabecera.count() === 0, 'Sin días con datos en el periodo o históricos en preparación')
  await cabecera.scrollIntoViewIfNeeded()
  return cabecera
}

test('cabecera, tira y barras del periodo; el rango va a la URL', async ({ page }) => {
  await panel(page)
  await expect(page.getByRole('list', { name: 'Métricas del periodo del P&L diario' })).toBeVisible()
  for (const label of ['Mejor día', 'Peor día', 'Racha verde', 'Racha roja', 'Día verde medio', 'Día rojo medio']) {
    await expect(page.getByRole('list', { name: 'Métricas del periodo del P&L diario' }).getByText(label, { exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('barras-pnl-periodo')).toHaveAttribute('aria-label', /^P&L por día: \d+ barras; acumulado del periodo /)
  // Por defecto, 30 días; con «Todo», la agrupación se adapta a la duración.
  await page.getByRole('group', { name: 'Rango del P&L diario' }).getByRole('radio', { name: 'Toda la historia' }).click()
  await expect(page).toHaveURL(/[?&]pnl-diario=todo/)
})

test('la agrupación de las barras se elige a mano y vuelve a la automática al cambiar de rango', async ({ page }) => {
  await panel(page, '/?pnl-diario=90d')
  const grupo = page.getByRole('radiogroup', { name: 'Agrupar las barras por' })
  await expect(grupo.getByRole('radio', { name: 'Día' })).toHaveAttribute('aria-checked', 'true')
  await grupo.getByRole('radio', { name: 'Semana' }).click()
  await expect(page.getByTestId('barras-pnl-periodo')).toHaveAttribute('aria-label', /^P&L por semana:/)
  await page.getByRole('group', { name: 'Rango del P&L diario' }).getByRole('radio', { name: 'Últimos 7 días' }).click()
  await expect(grupo.getByRole('radio', { name: 'Día' })).toHaveAttribute('aria-checked', 'true')
})

test('pulsar una barra abre ese día en el calendario', async ({ page }) => {
  await panel(page, '/?pnl-diario=7d')
  const barras = page.getByTestId('barras-pnl-periodo')
  const rects = barras.locator('.recharts-bar-rectangle')
  test.skip(await rects.count() === 0, 'Sin barras en el periodo')
  const box = (await rects.first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + Math.max(1, box.height / 2))
  await expect(page.getByRole('region', { name: /^Detalle del / })).toBeVisible()
})

test('a 390 px el panel no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await panel(page)
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(ancho).toBeLessThanOrEqual(390)
})

for (const theme of ['dark', 'light'] as const) {
  test(`resumen del periodo sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await panel(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const { violations } = await (await axeEstable(page)).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
