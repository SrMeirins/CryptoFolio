import { expect, test } from '@playwright/test'

// Filtros avanzados del Historial (#366): multiselección con teclado, chips,
// búsqueda con debounce y URL que restaura la vista. Solo lee: no modifica datos.

test('multiselección y chips con teclado; la URL restaura la vista', async ({ page }) => {
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

  // Chip del filtro y URL.
  const chip = page.getByRole('button', { name: 'Quitar filtro Tipo: Compra' })
  await expect(chip).toBeVisible()
  await expect(page).toHaveURL(/[?&]tipo=BUY/)

  // Recargar restaura la vista.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Quitar filtro Tipo: Compra' })).toBeVisible()

  // Quitar el chip con el teclado.
  await page.getByRole('button', { name: 'Quitar filtro Tipo: Compra' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Filtros activos' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/tipo=/)
})

test('la búsqueda espera a que dejes de teclear: una sola petición', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  const searches: string[] = []
  page.on('request', r => {
    const u = new URL(r.url())
    if (u.pathname.endsWith('/api/transactions') && u.searchParams.has('search')) searches.push(u.searchParams.get('search')!)
  })
  await page.getByRole('searchbox', { name: /Buscar por activo/ }).pressSequentially('BTC', { delay: 40 })
  await expect(page).toHaveURL(/[?&]buscar=BTC/)
  await page.waitForLoadState('networkidle').catch(() => { /* el WebSocket puede mantenerla abierta */ })
  expect(searches.filter(s => s !== 'BTC')).toEqual([])
  expect(searches.filter(s => s === 'BTC').length).toBeGreaterThanOrEqual(1)
})

test('agrupar comisiones: conmutador con teclado y estado en la URL (#371)', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  const toggle = page.getByRole('button', { name: 'Agrupar comisiones' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page).toHaveURL(/[?&]comisiones=sueltas/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Agrupar comisiones' })).toHaveAttribute('aria-pressed', 'false')
})
