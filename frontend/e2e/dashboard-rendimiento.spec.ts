import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Panel Rendimiento (#517): rejilla de periodos (Dietz), vista de riesgo con
// el selector de rango común, coherencia de la máxima caída con Evolución y
// axe. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const panel = (page: Page) => page.getByRole('heading', { name: 'Rendimiento' }).locator('xpath=ancestor::div[contains(@class,"px-5")][1]')
const pct = (t: string) => Number((t.replace(/−/g, '-').replace(/\s/g, '').match(/-?\d+(?:,\d+)?(?=%)/)?.[0] ?? 'NaN').replace(',', '.'))

async function abrir(page: Page, ruta = '/') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ruta)
  const rejilla = page.getByTestId('rejilla-periodos')
  await rejilla.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await rejilla.count() === 0, 'Sin historia o históricos en preparación')
  await rejilla.scrollIntoViewIfNeeded()
  return rejilla
}

test('Periodos: tabla por años con meses, trimestres y año', async ({ page }) => {
  const rejilla = await abrir(page)
  const tabla = rejilla.getByRole('table', { name: /Rentabilidad por mes, trimestre y año/ })
  await expect(tabla.getByRole('columnheader', { name: 'T4' })).toBeVisible()
  await expect(tabla.getByRole('rowheader').first()).toHaveText(/^\d{4}$/)
  await expect(tabla.locator('.sr-only').filter({ hasText: /^año \d{4}: / }).first()).toBeAttached()
})

test('Riesgo: medidas, rango en la URL y ayuda de cada medida', async ({ page }) => {
  await abrir(page)
  await panel(page).getByRole('radio', { name: 'Riesgo' }).click()
  await expect(page.getByTestId('vista-riesgo')).toBeVisible()
  await expect(page.getByTestId('volatilidad')).toContainText('%')
  await page.getByRole('group', { name: 'Rango del rendimiento' }).getByRole('radio', { name: 'Último año' }).click()
  await expect(page).toHaveURL(/[?&]rendimiento=1a/)
  await panel(page).getByRole('button', { name: 'Cómo se calcula volatilidad anual' }).hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'raíz de 365' })).toBeVisible()
})

test('con «Todo», la máxima caída coincide con la de Evolución', async ({ page }) => {
  await abrir(page, '/?evolucion=todo')
  const evolucion = page.getByRole('region', { name: 'Evolución de la cartera' })
  const textoEvolucion = evolucion.getByText(/^Máx\. caída: /)
  await textoEvolucion.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await textoEvolucion.count() === 0, 'Sin caídas en la historia')
  await panel(page).getByRole('radio', { name: 'Riesgo' }).click()
  const riesgo = pct((await page.getByTestId('maxima-caida').textContent()) ?? '')
  expect(Math.abs(riesgo - pct((await textoEvolucion.textContent()) ?? ''))).toBeLessThan(0.02)
})

for (const theme of ['dark', 'light'] as const) {
  test(`Rendimiento sin violaciones de axe en las dos vistas (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const sel = await panel(page).evaluate(el => { el.setAttribute('data-panel-rendimiento', ''); return '[data-panel-rendimiento]' })
    const analizar = async () => (await (await axeEstable(page)).include(sel).withTags(WCAG).analyze()).violations
      .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)
    await page.mouse.move(0, 0)
    expect(await analizar()).toEqual([])
    await panel(page).getByRole('radio', { name: 'Riesgo' }).click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    expect(await analizar()).toEqual([])
  })
}
