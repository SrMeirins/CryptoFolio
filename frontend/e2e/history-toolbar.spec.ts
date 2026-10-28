import { expect, test } from '@playwright/test'
import { abrirMasFiltros } from './historyHelpers'

// Barra de filtros por niveles (#414). Solo lectura.

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
  await expect(page.getByRole('button', { name: `Quitar filtro Activo: ${activo}` })).toBeVisible()
})

test('«Más filtros» se despliega, cuenta sus filtros activos y no muestra «Cuenta»', async ({ page }) => {
  await page.goto('/history?manuales=1&desde=2024-01-01&hasta=2024-12-31')
  const mas = page.getByRole('button', { name: /^Más filtros/ })
  await expect(mas).toHaveAccessibleName('Más filtros, 2 activos')
  await abrirMasFiltros(page)
  await expect(mas).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('group', { name: 'Más filtros' }).getByRole('button', { name: 'Manuales' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Filtrar por cuenta/ })).toHaveCount(0)
})

test('un enlace antiguo con «cuenta» sigue filtrando y su chip se quita', async ({ page }) => {
  await page.goto('/history?cuenta=Spot')
  const chip = page.getByRole('button', { name: 'Quitar filtro Cuenta: Spot' })
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(page).not.toHaveURL(/cuenta=/)
})
