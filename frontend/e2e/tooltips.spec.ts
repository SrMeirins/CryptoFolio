import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Sin title nativo (#495): tres explicaciones que antes eran title se abren
// ahora con teclado, al pasar el ratón o al tocar, y se cierran con Escape.
// Solo lectura: se bloquea cualquier petición que no sea GET.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

test('Hint de un botón de icono: se abre al enfocarlo y Escape lo cierra', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/history')
  const boton = page.getByRole('button', { name: 'Copiar el enlace de esta vista' })
  await boton.focus()
  const globo = page.getByRole('tooltip')
  await expect(globo).toHaveText('Copiar el enlace de esta vista')
  await page.keyboard.press('Escape')
  await expect(globo).toHaveCount(0)
})

test('ayuda de una cabecera de tabla en Fiscal: con teclado y al tocar', async ({ page }) => {
  // La tabla (y no las fichas) aparece con el contenido a partir de 896 px de ancho (#535: menú lateral).
  await page.setViewportSize({ width: 1680, height: 900 })
  await soloLectura(page)
  await page.goto('/fiscal?vista=operaciones')
  const ayuda = page.getByRole('button', { name: 'Qué incluye Transmisión' })
  await ayuda.focus()
  await expect(page.getByRole('tooltip')).toContainText('Valor de transmisión: lo que recibiste')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  // Al tocar se fija abierto; al tocar fuera se cierra.
  await ayuda.click()
  await expect(page.getByRole('tooltip')).toContainText('Valor de transmisión')
  await page.mouse.click(5, 5)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('atajos: anunciados al lector, sin globo al enfocar, y explicados en el panel (#535)', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  const tab = page.getByRole('tablist', { name: 'Secciones de Fiscal' }).getByRole('tab', { name: /Resumen/ })
  await expect(tab).toHaveAttribute('aria-keyshortcuts', '1')
  await tab.focus()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Atajos de teclado' }).click()
  const panel = page.getByRole('dialog', { name: 'Atajos de teclado' })
  await expect(panel).toContainText('Ir a Resumen, Operaciones, Modelo 721 o Planificar')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

for (const theme of ['dark', 'light'] as const) {
  test(`globo abierto sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await soloLectura(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/history')
    await page.getByRole('button', { name: 'Copiar el enlace de esta vista' }).focus()
    await expect(page.getByRole('tooltip')).toBeVisible()
    const r = await (await axeEstable(page)).withTags(WCAG).include('[role="tooltip"]').analyze()
    expect(r.violations).toEqual([])
  })
}
