import { expect, test } from '@playwright/test'

// Resumen del Historial (#403): interruptor de margen en la URL y ayuda de
// cada tarjeta. Solo lectura.

test('el interruptor de margen va a la URL y se puede usar con el teclado', async ({ page }) => {
  await page.goto('/history?margen=excluido')
  const sw = page.getByRole('switch', { name: 'Incluir margen' })
  await expect(sw).not.toBeChecked()
  await sw.focus()
  await page.keyboard.press('Space')
  await expect(sw).toBeChecked()
  await expect(page).toHaveURL(/[?&]margen=incluido/)
  await page.keyboard.press('Space')
  await expect(page).not.toHaveURL(/margen=incluido/)
})

test('cada tarjeta explica qué suma', async ({ page }) => {
  await page.goto('/history')
  for (const t of ['Invertido', 'Retirado', 'Ventas', 'Ingresos', 'Comisiones']) {
    await expect(page.getByRole('button', { name: `Qué suma ${t}` })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Qué suma Ventas' }).focus()
  await expect(page.getByRole('tooltip')).toContainText('Valor de lo vendido')
  await expect(page.getByRole('tooltip')).toContainText('A stablecoin')
})
