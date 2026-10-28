import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Tarjetas del Dashboard con StatCard (#412): cada KPI lleva a su destino y
// Mejor día del P&L diario despliega su detalle. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('Valor, Coste y P&L llevan a Portfolio', async ({ page }) => {
  for (const title of ['Valor', 'Coste', 'P&L no realizado']) {
    await page.goto('/')
    await page.getByRole('button', { name: new RegExp(`^${title.replace('&', '\\&')}: .*Ver el inventario en Portfolio$`) }).click()
    await expect(page).toHaveURL(/\/portfolio$/)
  }
})

test('Rentabilidad baja al gráfico de evolución y le pasa el foco', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: /^Rentabilidad: .*Ir al gráfico de evolución$/ }).click()
  await expect(page.getByRole('region', { name: 'Evolución de la cartera' })).toBeFocused()
})

test('EUR neto abre el Historial con la tarjeta Retirado', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('button', { name: /^(EUR neto|Neto aportado): .*Ver las retiradas en el Historial$/ })
  await card.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await card.count() === 0, 'Sin flujo de fiat en estos datos')
  await card.click()
  await expect(page).toHaveURL(/\/history\?tarjeta=retirado$/)
  await expect(page.getByRole('button', { name: /^Retirado: .*Quitar el filtro/ })).toHaveAttribute('aria-pressed', 'true')
})

for (const theme of ['dark', 'light'] as const) {
  test(`Mejor día despliega su detalle, sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    // El del calendario del mes: su nombre lleva «día N».
    const best = page.getByRole('button', { name: /^Mejor día: .*día \d+\. Ver el detalle del día$/ })
    await best.first().waitFor({ timeout: 15_000 }).catch(() => {})
    test.skip(await best.count() === 0, 'Sin días cerrados en el mes con estos datos')
    await best.first().click()
    await expect(page.getByRole('button', { name: /^Mejor día: .*día \d+\. Ocultar el detalle del día$/ })).toHaveAttribute('aria-expanded', 'true')
    await page.waitForTimeout(300)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
