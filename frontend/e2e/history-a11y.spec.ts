import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accesibilidad de Historial (#351): sin violaciones WCAG 2.2 AA en ambos
// temas y recorrido básico con teclado. No modifica datos: el borrado solo se
// abre y se cancela.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openHistory(page: Page, theme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto('/history')
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
  await expect(page.getByRole('table')).toBeVisible()
}

for (const theme of ['dark', 'light'] as const) {
  test(`Historial sin violaciones WCAG 2.2 AA (tema ${theme})`, async ({ page }) => {
    await openHistory(page, theme)
    // También la analítica abierta y una fila con su detalle.
    await page.getByRole('button', { name: /Analítica de actividad/ }).click()
    await page.getByRole('button', { name: 'Expandir detalle' }).first().click()
    await page.waitForTimeout(300)
    // Solo el contenido de la pestaña: la barra lateral y la cabecera común
    // se auditan aparte (no forman parte de Historial).
    const { violations } = await new AxeBuilder({ page }).include('main').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('teclado: foco visible, detalle con aria-expanded y borrado cancelable con Esc', async ({ page }) => {
  await openHistory(page, 'dark')

  // El botón de detalle anuncia su estado.
  const detalle = page.getByRole('button', { name: 'Expandir detalle' }).first()
  await detalle.focus()
  await expect(detalle).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Contraer detalle' }).first()).toHaveAttribute('aria-expanded', 'true')

  // Las acciones de la fila son visibles al recibir el foco.
  const editar = page.getByRole('button', { name: 'Editar transacción' }).first()
  await editar.focus()
  await expect(editar.locator('..')).toHaveCSS('opacity', '1')

  // Borrado: el foco va a «Cancelar», Esc cancela y el foco vuelve al botón.
  const borrar = page.getByRole('button', { name: 'Eliminar transacción' }).first()
  if (await borrar.count() === 0) return // sin transacciones manuales en estos datos
  await borrar.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: /Confirmar el borrado/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Eliminar transacción' }).first()).toBeFocused()
})
