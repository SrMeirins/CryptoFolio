import { expect, test } from '@playwright/test'

// Editar importadas sin formulario propio (#394). Solo lectura: abre el
// asistente y lo cierra sin guardar.

test('editar una venta importada abre en Detalles con sus datos', async ({ page }) => {
  await page.goto('/history?tipo=SELL')
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: 'Editar transacción' }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Editar transacción')).toBeVisible()
  await expect(dialog.getByText('Selecciona el tipo de operación')).toHaveCount(0)
  // Formulario equivalente de venta (con EUR o con cripto) con los campos precargados.
  await expect(dialog.getByText(/^Venta /).first()).toBeVisible()
  await expect(dialog.getByLabel(/^Activo (vendido|entregado)/)).not.toHaveValue('')
  await expect(dialog.getByLabel(/^Cantidad (vendida|entregada)/)).not.toHaveValue('')

  await dialog.getByRole('button', { name: 'Cerrar' }).click()
  await expect(dialog).toHaveCount(0)
})

test('los tipos de margen no se ofrecen al crear una operación', async ({ page }) => {
  await page.goto('/history')
  await page.getByRole('button', { name: /Nueva/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Especial/ }).click()
  await expect(dialog.getByRole('button', { name: /^Ignorar/ })).toBeVisible()
  await expect(dialog.getByText('Préstamo de margen')).toHaveCount(0)
  await expect(dialog.getByText('Devolución de margen')).toHaveCount(0)
})
