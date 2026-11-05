import { expect, test, type Page } from '@playwright/test'

// Cabecera común (#491): un único h1 por ruta y un h2 de la pestaña en las
// páginas con pestañas. Solo lectura.

const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

const RUTAS: Array<[string, string | null]> = [
  ['/', null], ['/portfolio', null], ['/import', null], ['/history', null],
  ['/fiscal', 'Resumen del ejercicio'], ['/fiscal?vista=operaciones', 'Operaciones de'],
  ['/fiscal?vista=modelo721', 'Modelo 721 de'], ['/fiscal?vista=planificar', 'Planificar el ejercicio en curso'],
  ['/settings', 'Wallets'], ['/settings?tab=assets', 'Activos y precios'], ['/settings?tab=fiscal', 'Fiscal'],
  ['/settings?tab=datos', 'Datos'], ['/settings?tab=general', 'General'],
]

for (const [ruta, h2] of RUTAS) {
  test(`${ruta}: un h1${h2 ? ` y el h2 «${h2}»` : ''}`, async ({ page }) => {
    await soloLectura(page)
    await page.goto(ruta)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    if (h2) await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${h2}`) })).toBeVisible()
  })
}

test.describe('acciones secundarias en «Más» a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('la cabecera no se corta', async ({ page }) => {
    await soloLectura(page)
    await page.goto('/settings?tab=assets')
    await expect(page.getByRole('heading', { level: 2, name: 'Activos y precios' })).toBeVisible()
    const desborde = await page.evaluate(() => { const m = document.querySelector('main')!; return m.scrollWidth - m.clientWidth })
    expect(desborde).toBe(0)
  })
})

test.describe('menú «Más» en la página de prueba', () => {
  test('en escritorio las acciones secundarias están a la vista', async ({ page }) => {
    await soloLectura(page)
    await page.goto('/__componentes')
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Más acciones/ })).toHaveCount(0)
  })
  test.describe('a 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test('las acciones secundarias pasan a «Más» y se abren con teclado', async ({ page }) => {
      await soloLectura(page)
      await page.goto('/__componentes')
      await expect(page.getByRole('button', { name: 'Exportar' })).toHaveCount(0)
      const mas = page.getByRole('button', { name: 'Más acciones de Componentes comunes' })
      await mas.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: 'Más acciones de Componentes comunes' }).getByRole('button', { name: 'Exportar' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(mas).toBeFocused()
    })
  })
})
