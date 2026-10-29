import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Zona horaria en Ajustes (#390). Solo lectura: la zona y su cambio se simulan
// con respuestas falsas, así que no se toca el ajuste real.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function simulate(page: Page, opts: { declaradas?: number } = {}) {
  let zone = 'Europe/Madrid'
  const puts: string[] = []
  await page.route('**/api/settings/timezone', route => route.fulfill({
    json: { timezone: zone, source: zone === 'Europe/Madrid' ? 'defecto' : 'ajuste', invalidSetting: null, default: 'Europe/Madrid' },
  }))
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    const body = route.request().postDataJSON() as { key: string; value: string }
    if (body.key !== 'timezone') return route.continue()
    puts.push(body.value)
    zone = body.value || 'Europe/Madrid'
    await route.fulfill({ json: { success: true } })
  })
  if (opts.declaradas !== undefined) {
    await page.route('**/api/fiscal/declaraciones', route => route.fulfill({
      json: Array.from({ length: opts.declaradas! }, (_, i) => ({ ejercicio: 2020 + i, tipo: 'renta', declaradoEn: '2021-06-01T10:00:00Z', cifras: {} })),
    }))
  }
  return { puts }
}

async function pickZone(page: Page, search: string, name: RegExp) {
  await page.getByRole('button', { name: /^Zona horaria/ }).click()
  await page.getByRole('textbox', { name: /Buscar en Zona horaria/ }).fill(search)
  await page.getByRole('option', { name }).click()
}

test('cambiar a Canarias en Ajustes se refleja en el Historial sin recargar', async ({ page }) => {
  const { puts } = await simulate(page, { declaradas: 0 })
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  const horaFila = () => page.locator('tbody tr[data-row-index="0"] td').first().locator('.mono').textContent()
  const antes = (await horaFila())?.trim() ?? ''
  expect(antes).toMatch(/^\d{2}:\d{2}$/)
  await page.evaluate(() => { (window as unknown as { sinRecarga: boolean }).sinRecarga = true })

  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByRole('tab', { name: 'General' }).click()
  await expect(page.getByText(/Ahora: hora de Madrid/)).toBeVisible()
  await pickZone(page, 'Canar', /Canarias/)
  expect(puts).toEqual(['Atlantic/Canary'])
  await expect(page.getByText(/Ahora: hora de Canarias/)).toBeVisible()

  await page.getByRole('link', { name: 'Historial' }).click()
  await expect(page.getByRole('table')).toBeVisible()
  const [h, m] = antes.split(':').map(Number)
  const esperada = `${String((h + 23) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}` // Canarias: una hora menos
  await expect(page.locator('tbody tr[data-row-index="0"] td').first().locator('.mono')).toHaveText(esperada)
  expect(await page.evaluate(() => (window as unknown as { sinRecarga?: boolean }).sinRecarga)).toBe(true)
})

test('con ejercicios declarados se pide confirmación, y cancelar no cambia nada', async ({ page }) => {
  const { puts } = await simulate(page, { declaradas: 2 })
  await page.goto('/settings?tab=general')
  await pickZone(page, 'Canar', /Canarias/)
  const dialog = page.getByRole('dialog', { name: 'Cambiar la zona horaria' })
  await expect(dialog).toContainText('2 ejercicios declarados')
  await expect(dialog).toContainText('Fiscal te mostrará si las actuales difieren')
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include('[role="dialog"]').analyze()
  expect(violations.map(v => v.id)).toEqual([])
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(puts).toEqual([])
  await expect(page.getByText(/Ahora: hora de Madrid/)).toBeVisible()
})

test('Ajustes con el selector de zona sin violaciones WCAG 2.2 AA en ambos temas', async ({ page }) => {
  await simulate(page, { declaradas: 0 })
  await page.goto('/settings?tab=general')
  await expect(page.getByRole('heading', { name: 'Zona horaria' })).toBeVisible()
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include('main').analyze()
    expect(violations.map(v => `${theme}: ${v.id}`)).toEqual([])
  }
})
