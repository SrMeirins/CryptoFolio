import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Pantallas estrechas (#499): sin scroll horizontal en ninguna ruta (WCAG
// 1.4.10) y menú en cajón accesible. Solo lectura: se bloquea cualquier
// petición que no sea GET para no tocar la base de datos real.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const RUTAS = ['/', '/portfolio', '/fiscal', '/fiscal?vista=operaciones', '/fiscal?vista=planificar', '/import', '/history',
  '/settings', '/settings?tab=fiscal', '/settings?tab=datos', '/settings?tab=general']

async function soloLectura(page: Page) {
  await page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
}

/** Ancho que sobra en la página y en el área de contenido (0 si nada se sale). */
const desborde = (page: Page) => page.evaluate(() => {
  const d = document.documentElement
  const m = document.querySelector('main')
  return Math.max(d.scrollWidth - d.clientWidth, m ? m.scrollWidth - m.clientWidth : 0)
})

for (const width of [390, 768]) {
  test.describe(`a ${width} px`, () => {
    test.use({ viewport: { width, height: 844 } })
    for (const ruta of RUTAS) {
      test(`${ruta} sin scroll horizontal`, async ({ page }) => {
        await soloLectura(page)
        await page.goto(ruta)
        await page.waitForLoadState('networkidle')
        expect(await desborde(page)).toBe(0)
      })
    }
  })
}

// En una instalación nueva Ajustes muestra el aviso de primer uso: también debe caber.
test.describe('Ajustes con el aviso de primer uso a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('sin scroll horizontal', async ({ page }) => {
    await soloLectura(page)
    await page.addInitScript(() => { try { localStorage.removeItem('cflio_setup_seen') } catch { /* sin almacenamiento */ } })
    await page.route('**/api/wallets', async route => {
      const real = await route.fetch()
      const wallets = (await real.json()) as Array<{ is_system: boolean }>
      await route.fulfill({ response: real, json: wallets.filter(w => w.is_system) })
    })
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Configura tus wallets antes de importar' })).toBeVisible()
    expect(await desborde(page)).toBe(0)
  })
})

test.describe('menú en cajón a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('se abre con el botón, navega, y Escape lo cierra devolviendo el foco', async ({ page }) => {
    await soloLectura(page)
    await page.goto('/')
    await expect(page.getByRole('complementary')).toHaveCount(0) // sin menú lateral fijo
    const boton = page.getByRole('button', { name: 'Abrir el menú' })
    await boton.click()
    const menu = page.getByRole('dialog', { name: 'Menú principal' })
    await expect(menu).toBeVisible()
    await menu.getByRole('link', { name: 'Historial' }).click()
    await expect(page).toHaveURL(/\/history/)
    await expect(menu).toBeHidden()

    await boton.click()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(boton).toBeFocused()
  })

  test('moneda y tema en «Vista»', async ({ page }) => {
    await soloLectura(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Vista: moneda y tema' }).click()
    const vista = page.getByRole('dialog', { name: 'Vista' })
    await expect(vista.getByRole('radiogroup', { name: 'Moneda de visualización' })).toBeVisible()
  })

  for (const theme of ['dark', 'light'] as const) {
    test(`Dashboard y menú abierto sin violaciones de axe (tema ${theme})`, async ({ page }) => {
      await soloLectura(page)
      await page.emulateMedia({ colorScheme: theme })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      expect((await (await axeEstable(page)).withTags(WCAG).analyze()).violations).toEqual([])
      await page.getByRole('button', { name: 'Abrir el menú' }).click()
      expect((await (await axeEstable(page)).withTags(WCAG).include('#menu-principal').analyze()).violations).toEqual([])
    })
  }
})

test.describe('a 900 px el menú lateral se pliega a iconos', () => {
  test.use({ viewport: { width: 900, height: 844 } })
  test('menú visible y plegado, sin botón de plegar', async ({ page }) => {
    await soloLectura(page)
    await page.goto('/')
    const menu = page.getByRole('complementary')
    await expect(menu).toBeVisible()
    expect((await menu.boundingBox())?.width).toBeLessThan(80)
    await expect(page.getByRole('button', { name: /Colapsar menú|Expandir menú/ })).toHaveCount(0)
  })
})
