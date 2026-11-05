import { expect, test, type Page } from '@playwright/test'

// Formato de importes (#489): ninguna pantalla muestra «-0,00» ni «-0 €».
// Solo lectura: se bloquea cualquier petición que no sea GET.

const RUTAS = ['/', '/portfolio', '/fiscal', '/fiscal?vista=operaciones', '/fiscal?vista=modelo721', '/fiscal?vista=planificar',
  '/import', '/history', '/settings', '/settings?tab=fiscal', '/settings?tab=datos', '/settings?tab=general']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

for (const ruta of RUTAS) {
  test(`${ruta} sin «-0,00»`, async ({ page }) => {
    await soloLectura(page)
    await page.goto(ruta)
    await page.waitForLoadState('networkidle')
    const texto = await page.locator('body').innerText()
    // Guion o signo menos tipográfico seguido de un cero que no lleva a ninguna cifra distinta.
    expect(texto).not.toMatch(/[-−]0,00(?!\d)/)
    expect(texto).not.toMatch(/[-−]0\s?[€$]/)
  })
}
