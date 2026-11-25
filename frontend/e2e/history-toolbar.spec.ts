import { expect, test } from './base'
import { abrirMasFiltros } from './historyHelpers'

// Barra de filtros por niveles (#414) con el panel agrupado (#552). Solo lectura.

test('el buscador sugiere activos y, al elegir con el teclado, añade su filtro', async ({ page }) => {
  await page.goto('/history')
  await expect(page.getByRole('table')).toBeVisible()
  const activo = ((await (await page.request.get('/api/transactions/facets')).json()) as { assets: string[] }).assets[0]
  test.skip(!activo, 'sin activos en estos datos')
  const buscador = page.getByRole('combobox', { name: /Buscar/ })
  await buscador.fill(activo.slice(0, 2))
  await expect(buscador).toHaveAttribute('aria-expanded', 'true')
  // Sin icono, CryptoIcon pinta sus iniciales delante del nombre.
  await expect(page.getByRole('option').filter({ hasText: activo }).first()).toBeVisible()
  // Bajar hasta su opción y elegirla con Enter.
  const opciones = await page.getByRole('option').allInnerTexts()
  const i = opciones.findIndex(t => t.split('\n').includes(activo))
  for (let n = 0; n <= i; n++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`[?&]activo=${activo}`))
  await expect(buscador).toHaveValue('')
  await expect(page.getByRole('button', { name: /^Filtrar por activo/ })).toHaveAccessibleName(`Filtrar por activo: ${activo}`)
  await expect(page.getByRole('button', { name: 'Quitar el filtro de activos' })).toBeVisible()
})

test('«Filtros» se despliega en cuatro grupos y cuenta sus filtros; el año completo no cuenta', async ({ page }) => {
  await page.goto('/history?manuales=1&desde=2024-02-01&hasta=2024-03-31')
  const filtros = page.getByRole('button', { name: /^Filtros(,|$)/ })
  await expect(filtros).toHaveAccessibleName('Filtros, 2 activos')
  await abrirMasFiltros(page)
  await expect(filtros).toHaveAttribute('aria-expanded', 'true')
  const panel = page.getByRole('group', { name: 'Filtros', exact: true })
  for (const g of ['Qué', 'Dónde', 'Cuándo', 'Importes']) await expect(panel.getByRole('group', { name: g, exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Manuales' })).toHaveAttribute('aria-pressed', 'true')
  // Las fechas usan el botón de quitar del propio selector (sin duplicarlo).
  await expect(panel.getByRole('button', { name: 'Quitar filtro de fechas' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /Filtrar por cuenta/ })).toHaveCount(0)

  // Un año completo se elige y se ve en la barra: no cuenta en «Filtros».
  await page.goto('/history?desde=2024-01-01&hasta=2024-12-31')
  await expect(page.getByRole('button', { name: /^Filtros(,|$)/ })).toHaveAccessibleName('Filtros')
  await expect(page.getByRole('button', { name: 'Quitar el filtro de año' })).toBeVisible()
})

test('un enlace antiguo con «cuenta» sigue filtrando y se quita desde el panel', async ({ page }) => {
  await page.goto('/history?cuenta=Spot')
  await abrirMasFiltros(page)
  const quitar = page.getByRole('button', { name: 'Quitar el filtro de cuenta' })
  await expect(quitar).toBeVisible()
  await quitar.click()
  await expect(page).not.toHaveURL(/cuenta=/)
})
