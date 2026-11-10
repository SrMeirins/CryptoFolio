import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Pérdidas pendientes (#541): tira pulsable, escala común, cuenta atrás,
// Planificar, detalle año a año y «¿Cómo funciona?». La compensación se
// simula con datos sintéticos para tener una pérdida ya compensada.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const anio = new Date().getFullYear()

async function simular(page: Page) {
  await page.route('**/api/fiscal/carryforward', route => route.fulfill({ json: {
    pendienteTotal: 270, pendienteProvisional: 40,
    detalle: [{ year: anio, netoAntes: -40, rendimientos: 0, perdida: 40, compensadoPatrim: 0, compensadoRend: 0, compensadoRendAnio: 0, compensado: 0, limiteRend25: 0, netoDespues: 0 }],
    origenes: [
      { year: anio - 4, original: 100, compensadoPatrim: 30, compensadoRend: 0, pendiente: 70, caducado: 0, caducaEn: anio, provisional: false, aplicaciones: [{ year: anio - 3, patrim: 30, rend: 0 }] },
      { year: anio - 2, original: 200, compensadoPatrim: 0, compensadoRend: 0, pendiente: 200, caducado: 0, caducaEn: anio + 2, provisional: false, aplicaciones: [] },
      { year: anio, original: 40, compensadoPatrim: 0, compensadoRend: 0, pendiente: 40, caducado: 0, caducaEn: anio + 4, provisional: true, aplicaciones: [] },
    ],
  } }))
}

async function abrir(page: Page) {
  await simular(page)
  await page.goto('/fiscal')
  const panel = page.getByRole('heading', { name: 'Pérdidas pendientes de compensar' })
  await panel.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await panel.count() === 0, 'Sin ejercicio fiscal en estos datos')
}

test('la tira baja a la fila y «Caduca este año» lleva a Planificar', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Ver Provisional en la lista de pérdidas' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'provisional' }).first()).toBeFocused()
  await page.getByRole('button', { name: 'Ver Caduca este año en Planificar' }).click()
  await expect(page).toHaveURL(/vista=planificar/)
})

test('el detalle año a año y la cuenta atrás', async ({ page }) => {
  await abrir(page)
  await expect(page.getByText(/^Caduca en \d+ (días?|meses?)$|^Caduca en Hoy$/).first()).toBeVisible()
  const ver = page.getByRole('button', { name: /^Ver el detalle de \d{4}$/ })
  await expect(ver).toHaveCount(1)
  await ver.click()
  const tabla = page.getByRole('table', { name: `Compensación año a año de la pérdida de ${anio - 4}` })
  await expect(tabla.getByRole('row', { name: new RegExp(`^${anio - 3} 30,00\\s€ 0,00\\s€ 70,00\\s€$`) })).toBeVisible()
})

test('«¿Cómo funciona?» abre «Cómo calculamos» en la compensación', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: '¿Cómo funciona?' }).click()
  const cajon = page.getByRole('dialog', { name: 'Cómo calculamos' })
  await expect(cajon).toBeVisible()
  await expect(cajon.getByText(/hasta el 25 % de los rendimientos del capital mobiliario/)).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`pérdidas pendientes sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('button', { name: /^Ver el detalle de \d{4}$/ }).click()
    await page.waitForTimeout(300)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
