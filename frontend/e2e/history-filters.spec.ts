import { expect, test } from '@playwright/test'
import { abrirOpcionesVista } from './historyHelpers'

// Filtros avanzados del Historial (#366, #552): multiselección con teclado,
// cada filtro una sola vez (en su control, con su X), búsqueda con debounce y
// URL que restaura la vista. Solo lee: no modifica datos.

test('multiselección con teclado; el filtro se ve una vez y se quita desde el control', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()

  // Abrir el filtro de tipos con el teclado y marcar «Compra» sin cerrar.
  const trigger = page.getByRole('button', { name: /^Filtrar por tipo/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const list = page.getByRole('listbox', { name: 'Filtrar por tipo' })
  await expect(list).toHaveAttribute('aria-multiselectable', 'true')
  const compra = list.getByRole('option', { name: 'Compra', exact: true })
  // La opción activa la indica aria-activedescendant del elemento enfocado (el
  // buscador de la lista, o la propia lista si no lleva buscador).
  const activeId = () => page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant'))
  const compraId = await compra.getAttribute('id')
  for (let i = 0; i < 40 && (await activeId()) !== compraId; i++) await page.keyboard.press('ArrowDown')
  expect(await activeId()).toBe(compraId)
  await page.keyboard.press('Enter')
  await expect(compra).toHaveAttribute('aria-selected', 'true')
  await expect(list).toBeVisible()                       // sigue abierto
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  // El valor se ve en el propio control, con su X, y no hay chips aparte.
  await expect(trigger).toHaveAccessibleName('Filtrar por tipo: Compra')
  const quitar = page.getByRole('button', { name: 'Quitar el filtro de tipos' })
  await expect(quitar).toBeVisible()
  await expect(page.getByRole('region', { name: 'Filtros activos' })).toHaveCount(0)
  await expect(page.getByText('Tipo: Compra', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Limpiar filtros (1)' })).toBeVisible()
  await expect(page).toHaveURL(/[?&]tipo=BUY/)

  // Recargar restaura la vista.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Quitar el filtro de tipos' })).toBeVisible()

  // Quitarlo desde su control con el teclado.
  await page.getByRole('button', { name: 'Quitar el filtro de tipos' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Filtrar por tipo/ })).toHaveAccessibleName('Filtrar por tipo: Todos los tipos')
  await expect(page.getByRole('button', { name: /^Limpiar filtros/ })).toHaveCount(0)
  await expect(page).not.toHaveURL(/tipo=/)
})

test('«Limpiar filtros» quita todos los filtros de una vez', async ({ page }) => {
  await page.goto('/history?tipo=BUY&desde=2024-01-01&hasta=2024-12-31&manuales=1')
  await expect(page.getByRole('table').or(page.getByText(/Sin resultados/)).first()).toBeVisible()
  const limpiar = page.getByRole('button', { name: /^Limpiar filtros \(\d+\)$/ })
  await expect(limpiar).toBeVisible()
  await limpiar.click()
  await expect(page).not.toHaveURL(/tipo=|desde=|manuales=/)
  await expect(page.getByRole('button', { name: /^Limpiar filtros/ })).toHaveCount(0)
})

test('la búsqueda espera a que dejes de teclear: una sola petición', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  const searches: string[] = []
  page.on('request', r => {
    const u = new URL(r.url())
    if (u.pathname.endsWith('/api/transactions') && u.searchParams.has('search')) searches.push(u.searchParams.get('search')!)
  })
  await page.getByRole('combobox', { name: /Buscar por activo/ }).pressSequentially('BTC', { delay: 40 })
  await expect(page).toHaveURL(/[?&]buscar=BTC/)
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  expect(searches.filter(s => s !== 'BTC')).toEqual([])
  expect(searches.filter(s => s === 'BTC').length).toBeGreaterThanOrEqual(1)
})

test('agrupar comisiones: en las opciones de vista, con teclado y estado en la URL (#371, #552)', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  await abrirOpcionesVista(page)
  const opciones = page.getByRole('dialog', { name: 'Opciones de vista' })
  const toggle = opciones.getByRole('switch', { name: 'Agrupar comisiones' })
  await expect(toggle).toBeChecked()
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).not.toBeChecked()
  await expect(page).toHaveURL(/[?&]comisiones=sueltas/)
  await page.reload()
  await abrirOpcionesVista(page)
  await expect(page.getByRole('dialog', { name: 'Opciones de vista' }).getByRole('switch', { name: 'Agrupar comisiones' })).not.toBeChecked()
})
