import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Panel Fiscal del Dashboard (#515): cada cifra y barra lleva a Fiscal con su
// filtro, los meses abren Operaciones de ese mes, el selector de ejercicio y
// la coincidencia de las cifras con Fiscal. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function panel(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const heroe = page.getByTestId('heroe-fiscal')
  await heroe.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await heroe.count() === 0, 'Sin ejercicios fiscales con estos datos')
  await heroe.scrollIntoViewIfNeeded()
  return heroe
}
const anio = async (page: Page) => Number((await page.getByRole('group', { name: 'Ejercicio fiscal' }).textContent())?.match(/\d{4}/)?.[0])

test('clic en un mes abre Operaciones de ese mes', async ({ page }) => {
  await panel(page)
  const y = await anio(page)
  const meses = page.getByRole('list', { name: `Resultado por mes de ${y}` }).getByRole('link')
  test.skip(await meses.count() === 0, 'Sin meses con operaciones')
  await meses.first().click()
  await expect(page).toHaveURL(new RegExp(`/fiscal\\?anio=${y}&vista=operaciones&desde=${y}-\\d{2}-01&hasta=${y}-\\d{2}-\\d{2}$`))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('ganancias y pérdidas abren Operaciones filtradas por resultado', async ({ page }) => {
  await panel(page)
  const y = await anio(page)
  await page.getByRole('link', { name: /^Ganancias: .+Ver las operaciones con ganancia en Fiscal$/ }).click()
  await expect(page).toHaveURL(new RegExp(`/fiscal\\?anio=${y}&vista=operaciones&resultado=ganancia$`))
  await page.goBack()
  await page.getByRole('link', { name: /^Pérdidas: .+Ver las operaciones con pérdida en Fiscal$/ }).click()
  await expect(page).toHaveURL(new RegExp(`/fiscal\\?anio=${y}&vista=operaciones&resultado=perdida$`))
})

test('el héroe lleva a Fiscal (resultado) y a Planificar o al Resumen (IRPF)', async ({ page }) => {
  await panel(page)
  const y = await anio(page)
  await page.getByRole('link', { name: new RegExp(`^Ganancia o pérdida de ${y}: .+Ver el ejercicio en Fiscal$`) }).click()
  await expect(page).toHaveURL(new RegExp(`/fiscal\\?anio=${y}$`))
  await page.goBack()
  const irpf = page.getByRole('link', { name: new RegExp(`^IRPF estimado de ${y}: `) })
  const enCurso = y === new Date().getFullYear()
  await irpf.click()
  await expect(page).toHaveURL(enCurso ? /\/fiscal\?vista=planificar$/ : new RegExp(`/fiscal\\?anio=${y}$`))
})

test('el selector de ejercicio cambia de año', async ({ page }) => {
  await panel(page)
  const y = await anio(page)
  const anterior = page.getByRole('button', { name: /^Ejercicio anterior/ })
  test.skip(await anterior.isDisabled(), 'Un solo ejercicio con datos')
  await anterior.click()
  await expect.poll(() => anio(page)).toBe(y - 1)
  await expect(page.getByRole('link', { name: new RegExp(`^Ganancia o pérdida de ${y - 1}: `) })).toBeVisible()
})

test('la ganancia o pérdida coincide con la de Fiscal para el mismo ejercicio', async ({ page }) => {
  await panel(page)
  const y = await anio(page)
  const etiqueta = (await page.getByRole('link', { name: new RegExp(`^Ganancia o pérdida de ${y}: `) }).getAttribute('aria-label'))!
  const cifra = etiqueta.match(/: (.+?)\. Ver/)![1].replace(/[+−-]/g, '').trim()
  await page.goto(`/fiscal?anio=${y}`)
  await expect(page.locator('main')).toContainText(cifra)
})

for (const theme of ['dark', 'light'] as const) {
  test(`panel Fiscal sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    const heroe = await panel(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const sel = await heroe.evaluate(el => { const p = el.closest('[class*="overflow-hidden"]')!; p.setAttribute('data-panel-fiscal', ''); return '[data-panel-fiscal]' })
    const { violations } = await (await axeEstable(page)).include(sel).withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
