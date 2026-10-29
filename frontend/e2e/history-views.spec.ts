import { expect, test } from '@playwright/test'

// Vistas guardadas del Historial (#369): guardar, aplicar e indicar la activa,
// y borrar, con el teclado. Crea y borra su propia vista (nombre único); al
// terminar elimina por la API cualquier resto de prueba, aunque el test falle.

const PREFIX = 'e2e-vista-'

test.afterEach(async ({ request }) => {
  const res = await request.get('/api/v1/historial/vistas')
  if (!res.ok()) return
  const { vistas } = await res.json() as { vistas: { id: string; nombre: string }[] }
  for (const v of vistas.filter(x => x.nombre.startsWith(PREFIX))) await request.delete(`/api/v1/historial/vistas/${v.id}`)
})

test('guardar, aplicar y borrar una vista con el teclado', async ({ page }) => {
  const nombre = `${PREFIX}${Date.now()}`
  await page.goto('/history?tipo=BUY')
  await expect(page.getByRole('table')).toBeVisible()

  // Guardar la vista actual (tipo = Compra).
  const menu = page.getByRole('button', { name: /^Vistas guardadas/ })
  await menu.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Vistas guardadas' })
  await dialog.getByLabel('Guardar vista actual').fill(nombre)
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('button', { name: nombre, exact: true })).toBeVisible()
  await expect(menu).toHaveAccessibleName(`Vistas guardadas (activa: ${nombre})`)

  // Cambiar los filtros: deja de estar activa; aplicarla los restaura.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Quitar filtro Tipo: Compra' }).click()
  await expect(menu).toHaveAccessibleName('Vistas guardadas')
  await menu.click()
  await dialog.getByRole('button', { name: nombre, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Quitar filtro Tipo: Compra' })).toBeVisible()
  await expect(page).toHaveURL(/[?&]tipo=BUY/)

  // Borrar con confirmación (el foco va primero a «Cancelar»).
  await menu.click()
  await dialog.getByRole('button', { name: `Borrar «${nombre}»` }).click()
  const confirm = dialog.getByRole('group', { name: `Confirmar el borrado de ${nombre}` })
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Borrar' }).click()
  await expect(dialog.getByRole('button', { name: nombre, exact: true })).toHaveCount(0)
})
