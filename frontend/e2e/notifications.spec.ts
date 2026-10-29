import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Avisos (#447): campana accesible con Descartar y silenciado por categoría en
// Ajustes. Solo lectura: los avisos, el descarte y la config se interceptan
// con datos sintéticos; la base de datos real no se toca.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

type Aviso = { id: string; type: 'error' | 'warning' | 'info'; category: string; message: string; count?: number }
const AVISOS: Aviso[] = [
  { id: 'no-price', type: 'warning', category: 'Precios', message: '1 activo sin precio: SINT.', count: 1 },
  { id: 'fiscal-calendar', type: 'info', category: 'Fiscal', message: 'Quedan 30 días para la Renta.' },
]
const CAT: Record<string, string> = { Precios: 'precios', Fiscal: 'fiscal' }

async function fakeNotifications(page: Page) {
  const dismissed = new Set<string>()
  let muted: string[] = []
  await page.route('**/api/settings/notifications**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/dismiss')) {
      const ids = (route.request().postDataJSON() as { ids?: string[] }).ids ?? AVISOS.map(a => a.id)
      ids.forEach(id => dismissed.add(id))
      await route.fulfill({ json: { dismissed: ids.length } })
      return
    }
    const state = AVISOS.map(a => ({ ...a, categoryKey: CAT[a.category], muted: muted.includes(CAT[a.category]), dismissed: dismissed.has(a.id) }))
    await route.fulfill({ json: url.searchParams.get('incluir') === 'todas' ? state : state.filter(a => !a.muted && !a.dismissed).map(({ categoryKey: _c, muted: _m, dismissed: _d, ...a }) => a) })
  })
  await page.route('**/api/settings/config', async route => {
    if (route.request().method() === 'PUT') {
      const { key, value } = route.request().postDataJSON() as { key: string; value: string }
      if (key === 'notifications_muted') muted = JSON.parse(value) as string[]
      await route.fulfill({ json: { success: true } })
      return
    }
    // Si la página navega a mitad de la petición, la respuesta ya no existe: se ignora.
    try {
      const real = await route.fetch()
      await route.fulfill({ response: real, json: { ...(await real.json()), notifications_muted: JSON.stringify(muted) } })
    } catch { /* navegación en curso */ }
  })
}

test('la campana se abre con teclado, descarta un aviso y Escape la cierra', async ({ page }) => {
  await fakeNotifications(page)
  await page.goto('/')
  const bell = page.getByRole('button', { name: 'Avisos del sistema: 2' })
  await bell.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Avisos del sistema' })
  await expect(panel.getByRole('listitem')).toHaveCount(2)
  await panel.getByRole('button', { name: 'Descartar el aviso de Precios' }).click()
  await expect(panel.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Avisos del sistema: 1' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('cada aviso lleva a donde se resuelve', async ({ page }) => {
  await fakeNotifications(page)
  await page.goto('/')
  await page.getByRole('button', { name: /^Avisos del sistema/ }).click()
  await page.getByRole('button', { name: 'Ir a Activos' }).click()
  await expect(page).toHaveURL(/\/settings\?tab=assets$/)
})

test('silenciar una categoría en Ajustes la quita de la campana, con Deshacer', async ({ page }) => {
  await fakeNotifications(page)
  await page.goto('/settings?tab=general')
  const card = page.getByRole('region', { name: 'Notificaciones' })
  const fiscal = card.getByRole('switch', { name: /^Fiscal/ })
  await expect(fiscal).toBeChecked()
  await fiscal.click({ force: true })
  await expect(fiscal).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Avisos del sistema: 1' })).toBeVisible()
  await page.getByRole('status').filter({ hasText: 'Guardado' }).getByRole('button', { name: 'Deshacer' }).click()
  await expect(fiscal).toBeChecked()
  await expect(page.getByRole('button', { name: 'Avisos del sistema: 2' })).toBeVisible()
})

test('Acerca de: versión real y enlaces que se abren aparte', async ({ page }) => {
  await page.goto('/settings?tab=general')
  const about = page.getByRole('region', { name: 'Acerca de CryptoFolio' })
  await expect(about.getByText(/^\d+\.\d+\.\d+/)).toBeVisible()
  for (const name of ['Repositorio', 'Licencia', 'Seguridad']) {
    const link = about.getByRole('link', { name: new RegExp(`^${name}`) })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
  }
})

for (const theme of ['dark', 'light'] as const) {
  test(`campana abierta y Notificaciones sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fakeNotifications(page)
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/settings?tab=general')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByRole('button', { name: /^Avisos del sistema/ }).click()
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
