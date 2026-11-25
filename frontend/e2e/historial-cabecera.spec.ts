import { expect, test, type Page } from './base'
import { axeEstable } from './axe'
import { abrirMasFiltros, abrirOpcionesVista } from './historyHelpers'

// Cabecera del Historial (#552): «Exportar» con el número, menú «Más» con sus
// cuatro accesos, opciones de vista con la densidad (también en Ajustes), axe
// en ambos temas y 390 px. La densidad es global: la prueba guarda la previa
// y la restaura al terminar.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.describe.configure({ mode: 'serial' })

let densidadPrevia: string | undefined

test.beforeAll(async ({ request }) => {
  densidadPrevia = ((await (await request.get('/api/settings/config')).json()) as Record<string, string>).historial_densidad
})

test.afterAll(async ({ request }) => {
  await request.put('/api/settings/config', { data: { key: 'historial_densidad', value: densidadPrevia ?? 'comoda' } })
})

async function abrir(page: Page, ruta = '/history') {
  await page.goto(ruta)
  await expect(page.getByRole('table')).toBeVisible()
}

test('«Exportar» dice cuántas operaciones exportará', async ({ page }) => {
  await abrir(page)
  await expect(page.getByRole('button', { name: /^Exportar a CSV [\d.]+ transacciones$/ })).toContainText(/Exportar\s*\([\d.]+\)/)
})

test('el menú «Más» lleva a los atajos, a Importar y a restaurar una copia', async ({ page }) => {
  await abrir(page)
  const mas = page.getByRole('button', { name: 'Más', exact: true })
  await mas.click()
  const menu = page.getByRole('group', { name: 'Más acciones del Historial' })
  await expect(menu.getByRole('button', { name: 'Copiar el enlace de esta vista' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Importar un CSV' })).toHaveAttribute('href', '/import')
  await expect(menu.getByRole('link', { name: 'Restaurar una copia de seguridad' })).toHaveAttribute('href', '/settings?tab=datos')
  await menu.getByRole('button', { name: 'Atajos de teclado' }).click()
  const atajos = page.getByRole('dialog', { name: 'Atajos de teclado' })
  await expect(atajos).toContainText('Historial: vistas guardadas')
  await page.keyboard.press('Escape')
  await expect(atajos).toHaveCount(0)
})

test('densidad compacta desde las opciones de vista, reflejada en Ajustes', async ({ page }) => {
  await abrir(page)
  await abrirOpcionesVista(page)
  const opciones = page.getByRole('dialog', { name: 'Opciones de vista' })
  await opciones.getByRole('radio', { name: 'Compacta' }).click()
  await expect(page.locator('table[data-densidad="compacta"]')).toBeVisible()
  await page.goto('/settings?tab=general')
  await expect(page.getByRole('radiogroup', { name: 'Densidad del Historial' }).getByRole('radio', { name: 'Compacta' })).toBeChecked()
  // Y de vuelta, desde Ajustes.
  await page.getByRole('radiogroup', { name: 'Densidad del Historial' }).getByRole('radio', { name: 'Cómoda' }).click()
  await abrir(page)
  await expect(page.locator('table[data-densidad="comoda"]')).toBeVisible()
})

for (const theme of ['dark', 'light'] as const) {
  test(`cabecera, pestañas, barra y panel sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await abrir(page, '/history?tipo=BUY')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await abrirMasFiltros(page)
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page))
      .include('header').include('[data-testid="pestanas-vistas"]').include('[role="search"]')
      .withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('los multiselect muestran sus valores y el panel quita solo los suyos', async ({ page }) => {
  // Puede no haber resultados con estos filtros: no se espera a la tabla.
  await page.goto('/history?tipo=BUY,SELL&manuales=1&desde=2024-02-01&hasta=2024-03-31')
  await expect(page.getByRole('button', { name: /^Filtrar por tipo/ })).toContainText('Compra, Venta')
  await abrirMasFiltros(page)
  const panel = page.getByRole('group', { name: 'Filtros', exact: true })
  await expect(panel).toContainText('2 filtros activos en el panel')
  await panel.getByRole('button', { name: 'Quitar los del panel' }).click()
  await expect(page).not.toHaveURL(/manuales=|desde=/)
  await expect(page).toHaveURL(/tipo=BUY/)
  await expect(panel).toContainText('Ningún filtro activo en el panel')
})

test('en móvil, los filtros se abren como hoja con «Ver N resultados»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/history')
  await page.getByRole('button', { name: /^Filtros(,|$)/ }).click()
  const hoja = page.getByRole('dialog', { name: 'Filtros' })
  await expect(hoja.getByRole('group', { name: 'Importes', exact: true })).toBeVisible()
  await hoja.getByRole('button', { name: 'Manuales' }).click()
  await expect(page).toHaveURL(/manuales=1/)
  await hoja.getByRole('button', { name: /^Ver [\d.]+ resultados?$/ }).click()
  await expect(hoja).toHaveCount(0)
})

for (const theme of ['dark', 'light'] as const) {
  test(`hoja de filtros en móvil sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/history')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('button', { name: /^Filtros(,|$)/ }).click()
    await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()
    const { violations } = await (await axeEstable(page)).include('[role="dialog"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('a 390 px, con el panel abierto, no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/history?tipo=BUY')
  await abrirMasFiltros(page)
  await expect(page.getByRole('group', { name: 'Filtros', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
