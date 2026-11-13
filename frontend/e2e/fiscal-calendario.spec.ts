import { expect, test } from '@playwright/test'
import { axeEstable } from './axe'

// Línea del ciclo fiscal (#538): siempre visible, teselas con teclado, detalle
// del mes, campana y «Añadir al calendario». Axe en ambos temas. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function abrir(page: import('@playwright/test').Page) {
  await page.goto('/fiscal')
  const meses = page.getByRole('tablist', { name: 'Meses del ciclo fiscal' })
  await meses.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await meses.count() === 0, 'Sin ejercicio fiscal en estos datos')
  return meses
}

test('siempre visible: próximo plazo con la urgencia en texto y 18 meses', async ({ page }) => {
  const meses = await abrir(page)
  await expect(page.getByRole('heading', { name: 'Próximo plazo fiscal' })).toBeVisible()
  await expect(page.getByRole('img', { name: /: (quedan? \d+ días?|hoy es el último día|abre (en|hacia) .+)$/ })).toBeVisible()
  await expect(meses.getByRole('tab')).toHaveCount(18)
  await expect(meses.getByRole('tab', { selected: true })).toHaveAccessibleName(/mes actual/)
})

test('las flechas, Inicio y Fin recorren los meses y el detalle los sigue', async ({ page }) => {
  const meses = await abrir(page)
  const tabs = meses.getByRole('tab')
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tabs.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  // Un solo punto de tabulación en la fila de meses.
  await expect(meses.locator('[tabindex="0"]')).toHaveCount(1)
  const nombre = (await tabs.nth(1).getAttribute('aria-label'))!.split(',')[0].split(':')[0]
  await tabs.nth(1).click()
  await expect(page.getByRole('tabpanel').filter({ has: page.getByRole('heading', { level: 3 }) }).first()).toContainText(new RegExp(nombre, 'i'))
})

test('«Ver avisos» abre la campana', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Ver avisos' }).click()
  await expect(page.locator('#panel-avisos')).toBeVisible()
})

test('«Añadir al calendario» descarga un .ics válido', async ({ page }) => {
  await abrir(page)
  const boton = page.getByRole('button', { name: 'Añadir al calendario' })
  test.skip(await boton.count() === 0, 'Sin plazos que añadir')
  const [descarga] = await Promise.all([page.waitForEvent('download'), boton.click()])
  expect(descarga.suggestedFilename()).toBe('plazos-fiscales.ics')
  const ics = (await import('node:fs')).readFileSync(await descarga.path(), 'utf8')
  expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
  expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/)
  expect(ics).not.toContain('€')
})

for (const theme of ['dark', 'light'] as const) {
  test(`línea del ciclo sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(400)
    const { violations } = await (await axeEstable(page)).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
