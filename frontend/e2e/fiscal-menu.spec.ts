import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Fiscal con menú lateral y cabecera de vista (#535). Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
const menu = (page: Page) => page.getByRole('tablist', { name: 'Secciones de Fiscal' })
const VISTAS = [
  { nombre: 'Resumen', url: /\/fiscal$|\/fiscal\?(?!.*vista=)/, titulo: /Resumen del ejercicio/ },
  { nombre: 'Operaciones', url: /vista=operaciones/, titulo: /Operaciones de/ },
  { nombre: 'Modelo 721', url: /vista=modelo721/, titulo: /Modelo 721 de/ },
  { nombre: 'Planificar', url: /vista=planificar/, titulo: /Planificar el ejercicio en curso/ },
]

test.use({ viewport: { width: 1440, height: 900 } })

test('el menú lleva a las cuatro vistas, cada una con su cabecera y cifras', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  for (const v of VISTAS) {
    await menu(page).getByRole('tab', { name: new RegExp(`^${v.nombre}`) }).click()
    await expect(page).toHaveURL(v.url)
    const cabecera = page.getByRole('heading', { level: 2, name: v.titulo })
    await expect(cabecera).toBeVisible()
    await expect(page.getByRole('list', { name: /^Cifras:/ })).toBeVisible()
  }
})

test('las teclas 1 a 4 cambian de vista fuera del menú', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  await page.getByRole('heading', { level: 1, name: 'Fiscal' }).click()
  for (const [tecla, v] of [['2', VISTAS[1]], ['3', VISTAS[2]], ['4', VISTAS[3]], ['1', VISTAS[0]]] as const) {
    await page.keyboard.press(tecla)
    await expect(page).toHaveURL(v.url)
  }
})

test('plegar el menú lo reduce a iconos y se recuerda', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  await page.getByRole('button', { name: 'Plegar secciones de fiscal' }).click()
  await expect(page.getByRole('button', { name: 'Expandir secciones de fiscal' })).toHaveAttribute('aria-expanded', 'false')
  // El ancho se anima al plegar: se espera a que termine la transición.
  await expect.poll(async () => (await menu(page).boundingBox())!.width).toBeLessThan(80)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Expandir secciones de fiscal' })).toBeVisible()
  await page.getByRole('button', { name: 'Expandir secciones de fiscal' }).click()
})

test('las URL antiguas siguen funcionando', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal?vista=modelo721')
  await expect(menu(page).getByRole('tab', { name: /^Modelo 721/ })).toHaveAttribute('aria-selected', 'true')
})

for (const theme of ['dark', 'light'] as const) {
  test(`las cuatro vistas sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await soloLectura(page)
    await page.emulateMedia({ colorScheme: theme })
    for (const v of ['resumen', 'operaciones', 'modelo721', 'planificar']) {
      await page.goto(v === 'resumen' ? '/fiscal' : `/fiscal?vista=${v}`)
      await expect(page.getByRole('list', { name: /^Cifras:/ })).toBeVisible()
      await page.waitForLoadState('networkidle')
      const r = await new AxeBuilder({ page }).withTags(WCAG).include('main').analyze()
      expect(r.violations.map(x => `${v}: ${x.id}: ${x.nodes.map(n => n.target.join(" ")).slice(0, 4).join(" | ")}`)).toEqual([])
    }
  })
}
