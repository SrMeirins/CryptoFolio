import { expect, test, type Page } from '@playwright/test'

// Teclado en Historial (#351): foco visible, panel de detalle (#373) y borrado
// cancelable.
// La auditoría con axe de todas las vistas está en a11y.spec.ts (#356). No
// modifica datos: el borrado solo se abre y se cancela.

async function openHistory(page: Page, theme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto('/history')
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
  await expect(page.getByRole('table')).toBeVisible()
}

test('teclado: foco visible, acciones de la fila y borrado cancelable con Esc', async ({ page }) => {
  await openHistory(page, 'dark')

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

test('panel de detalle (#373): se abre con teclado, navega y Esc devuelve el foco', async ({ page }) => {
  await openHistory(page, 'dark')
  const abrir = page.getByRole('button', { name: 'Ver detalle' }).first()
  await expect(abrir).toHaveAttribute('aria-haspopup', 'dialog')
  await abrir.focus()
  await page.keyboard.press('Enter')

  // Diálogo con nombre, foco inicial en «Cerrar» y URL compartible (?tx=).
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cerrar el detalle' })).toBeFocused()
  await expect(page).toHaveURL(/[?&]tx=/)
  await expect(dialog.getByRole('heading', { name: 'Trazabilidad FIFO (EUR, como Fiscal)' })).toBeVisible()
  const titulo = await dialog.getByRole('heading', { level: 2 }).textContent()

  // Siguiente cambia de transacción sin cerrar el panel; Anterior vuelve.
  const siguiente = dialog.getByRole('button', { name: 'Transacción siguiente' })
  if (await siguiente.isEnabled()) {
    const antes = page.url()
    await siguiente.click()
    await expect(page).not.toHaveURL(antes)
    await dialog.getByRole('button', { name: 'Transacción anterior' }).click()
    await expect(page).toHaveURL(antes)
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(titulo ?? '')
  }

  // Esc cierra, quita ?tx= y devuelve el foco al botón que lo abrió.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]tx=/)
  await expect(abrir).toBeFocused()
})

test('panel de detalle (#373): una operación relacionada se abre en el mismo panel', async ({ page }) => {
  await openHistory(page, 'dark')
  // Una venta consume lotes: su trazabilidad enlaza con la compra de origen.
  await page.goto('/history?tipo=SELL')
  await expect(page.getByRole('table')).toBeVisible()
  const ver = page.getByRole('button', { name: 'Ver detalle' }).first()
  if (await ver.count() === 0) return // sin ventas en estos datos
  await ver.click()
  const dialog = page.getByRole('dialog')
  const fifo = dialog.locator('section', { has: page.getByRole('heading', { name: /Trazabilidad FIFO/ }) })
  const origen = fifo.getByRole('button').first()
  if (await origen.count() === 0) return
  const antes = page.url()
  await origen.click()
  await expect(page).not.toHaveURL(antes)
  await expect(dialog).toBeVisible()
})
