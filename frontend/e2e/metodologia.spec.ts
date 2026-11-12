import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Pie de metodología y panel «Cómo calculamos» (#493): se abre con teclado en
// el tema de la pantalla, el índice lleva a los demás y Escape devuelve el
// foco. Solo lectura: se bloquea cualquier petición que no sea GET.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

async function abrirConTeclado(page: Page) {
  const boton = page.getByRole('button', { name: 'Cómo calculamos' })
  await boton.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Cómo calculamos' })
  await expect(panel).toBeVisible()
  return { boton, panel }
}

const CASOS = [
  { ruta: '/fiscal', tema: 'FIFO global por activo' },
  { ruta: '/fiscal?vista=planificar', tema: 'Compensación de pérdidas' },
  { ruta: '/fiscal?vista=modelo721', tema: 'Modelo 721' },
  { ruta: '/portfolio', tema: 'Valoración y precios' },
]

for (const { ruta, tema } of CASOS) {
  test(`${ruta}: se abre en «${tema}» y Escape devuelve el foco`, async ({ page }) => {
    await soloLectura(page)
    await page.goto(ruta)
    const { boton, panel } = await abrirConTeclado(page)
    await expect(panel.getByRole('heading', { name: tema, level: 3 })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(boton).toBeFocused()
  })
}

test('el índice lleva a cada tema', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  const { panel } = await abrirConTeclado(page)
  const indice = panel.getByRole('navigation', { name: 'Temas' })
  // Uno por tema, incluido «Rendimientos» (#544).
  await expect(indice.getByRole('button')).toHaveCount(6)
  await indice.getByRole('button', { name: 'Rentabilidad' }).click()
  await expect(panel.getByRole('heading', { name: 'Rentabilidad', level: 3 })).toBeFocused()
})

for (const theme of ['dark', 'light'] as const) {
  test(`panel abierto sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await soloLectura(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/portfolio')
    await abrirConTeclado(page)
    // El cajón entra con opacidad animada: en CI, más lento, axe medía colores a
    // medio fundido. Se espera a que acaben las animaciones finitas.
    await page.waitForFunction(() => document.getAnimations()
      .every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity))
    const r = await new AxeBuilder({ page }).withTags(WCAG).include('[role="dialog"]').analyze()
    expect(r.violations).toEqual([])
  })
}

test('Notice de cada tipo en la página de componentes', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/__componentes')
  for (const tipo of ['aviso', 'consejo', 'informacion']) {
    await expect(page.locator(`[data-notice="${tipo}"]`).first()).toBeVisible()
  }
  await expect(page.locator('[data-notice="consejo"]').getByRole('button', { name: 'Añadir historial' })).toBeVisible()
})
