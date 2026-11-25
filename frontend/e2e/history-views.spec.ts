import { expect, test } from '@playwright/test'

// Vistas guardadas del Historial como pestañas (#369, #552): guardar, aplicar
// con las flechas, marcar «modificada», actualizar y borrar, con el teclado.
// Crea y borra su propia vista (nombre único); al terminar elimina por la API
// cualquier resto de prueba, aunque el test falle.

const PREFIX = 'e2e-vista-'

test.afterEach(async ({ request }) => {
  const res = await request.get('/api/v1/historial/vistas')
  if (!res.ok()) return
  const { vistas } = await res.json() as { vistas: { id: string; nombre: string }[] }
  for (const v of vistas.filter(x => x.nombre.startsWith(PREFIX))) await request.delete(`/api/v1/historial/vistas/${v.id}`)
})

test('guardar, navegar con flechas, actualizar una vista modificada y borrarla', async ({ page }) => {
  const nombre = `${PREFIX}${Date.now()}`
  await page.goto('/history?tipo=BUY')
  await expect(page.getByRole('table')).toBeVisible()
  const pestanas = page.getByRole('tablist', { name: 'Vistas guardadas' })
  await expect(pestanas.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true')

  // Guardar la vista actual (tipo = Compra): queda como pestaña seleccionada.
  await page.getByRole('button', { name: 'Guardar vista' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Guardar vista' })
  await dialogo.getByLabel('Nombre de la vista').fill(nombre)
  await page.keyboard.press('Enter')
  const pestana = pestanas.getByRole('tab', { name: new RegExp(nombre) })
  await expect(pestana).toHaveAttribute('aria-selected', 'true')

  // Con las flechas: «Todas» quita los filtros al llegar; volver aplica la vista.
  await pestana.focus()
  await page.keyboard.press('Home')
  await expect(pestanas.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).not.toHaveURL(/tipo=/)
  await page.keyboard.press('End')
  await expect(pestana).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/[?&]tipo=BUY/)

  // Cambiar los filtros: la pestaña queda «modificada»; actualizarla guarda el cambio.
  await page.getByRole('button', { name: 'Quitar el filtro de tipos' }).click()
  await expect(pestana).toContainText('modificada')
  await expect(pestana).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Actualizar vista' }).click()
  await expect(pestana).not.toContainText('modificada')
  const vistas = (await (await page.request.get('/api/v1/historial/vistas')).json()).vistas as { nombre: string; filtros: Record<string, string> }[]
  expect(vistas.find(v => v.nombre === nombre)?.filtros.tipo).toBeUndefined()

  // Borrar con confirmación desde su menú (el foco va primero a «Cancelar»).
  await page.getByRole('button', { name: `Gestionar la vista «${nombre}»` }).click()
  await page.getByRole('dialog', { name: `Gestionar la vista «${nombre}»` }).getByRole('button', { name: 'Borrar' }).click()
  const confirmar = page.getByRole('group', { name: `Confirmar el borrado de ${nombre}` })
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await confirmar.getByRole('button', { name: 'Borrar' }).click()
  await expect(pestanas.getByRole('tab', { name: new RegExp(nombre) })).toHaveCount(0)
  await expect(pestanas.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true')
})
