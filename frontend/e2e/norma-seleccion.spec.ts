import { expect, test, type Page } from '@playwright/test'

// Norma de selección en tres niveles (#492): secciones (SectionNav), vistas
// (ViewTabs) y opciones de panel (SegmentedControl), todas con flechas,
// Inicio y Fin. Solo lectura.

const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))

test('nivel 1, Ajustes: flechas, Inicio y Fin mueven entre secciones y la URL las sigue', async ({ page }) => {
  await soloLectura(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/settings')
  const menu = page.getByRole('tablist', { name: 'Secciones de Ajustes' })
  await menu.getByRole('tab', { name: /Wallets/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('tab', { name: /Activos/ })).toBeFocused()
  await expect(page).toHaveURL(/tab=assets/)
  await page.keyboard.press('End')
  await expect(menu.getByRole('tab', { name: /General/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(menu.getByRole('tab', { name: /Wallets/ })).toHaveAttribute('aria-selected', 'true')
})

test('nivel 2, Fiscal: pestañas con URL y teclado', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  const tabs = page.getByRole('tablist', { name: 'Secciones de Fiscal' })
  await tabs.getByRole('tab', { name: 'Resumen' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Operaciones' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/vista=operaciones/)
  await page.keyboard.press('End')
  await expect(page).toHaveURL(/vista=planificar/)
})

test('nivel 3, Evolución: opción del panel sin URL y sin peticiones nuevas', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/')
  const curva = page.getByRole('radiogroup', { name: 'Curva de evolución' })
  await expect(curva).toBeVisible()
  await page.waitForLoadState('networkidle')
  const peticiones: string[] = []
  page.on('request', r => { if (r.url().includes('/api/')) peticiones.push(r.url()) })
  const url = page.url()
  await curva.getByRole('radio', { name: 'P&L' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(curva.getByRole('radio', { name: 'Valor' })).toBeChecked()
  await page.keyboard.press('Home')
  await expect(curva.getByRole('radio', { name: 'P&L' })).toBeChecked()
  expect(page.url()).toBe(url)
  expect(peticiones).toEqual([])
})
