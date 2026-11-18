import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { axeEstable } from './axe'

// Calendario del P&L diario (#512): teselas con importe y %, % del mes por
// Dietz igual al de la API, teclado (Re Pág, Av Pág, T y flechas que cruzan de
// mes), detalle con día anterior y siguiente, vista Año, CSV del periodo y
// axe. Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function calendario(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const grid = page.getByRole('grid', { name: /^P&L diario de / })
  await grid.waitFor({ timeout: 20_000 }).catch(() => {})
  test.skip(await grid.count() === 0, 'Calendario aún sin históricos')
  await grid.scrollIntoViewIfNeeded()
  return grid
}

const mesVisible = (page: Page) => page.getByRole('grid', { name: /^P&L diario de / }).getAttribute('aria-label')
/** «+1,23 %» o «−0,5 %» a número. */
const pct = (t: string) => Number((t.replace(/−/g, '-').replace(/\s/g, '').match(/[+-]?\d+(?:[.,]\d+)?(?=%)/)?.[0] ?? 'NaN').replace(',', '.'))

test('Re Pág y Av Pág cambian de mes con el foco en el calendario, y T vuelve a hoy', async ({ page }) => {
  const grid = await calendario(page)
  const inicial = await mesVisible(page)
  await grid.locator('button[tabindex="0"]').focus()
  await page.keyboard.press('PageUp')
  await expect.poll(() => mesVisible(page)).not.toBe(inicial)
  await page.keyboard.press('t')
  await expect.poll(() => mesVisible(page)).toBe(inicial)
  // El selector de rango del panel no se ha movido: sigue en su valor por defecto.
  await expect(page).not.toHaveURL(/pnl-diario=/)
})

test('las flechas cruzan de mes y el foco sigue en el día', async ({ page }) => {
  const grid = await calendario(page)
  const inicial = await mesVisible(page)
  const primero = grid.getByRole('button', { name: /^[^,]+, 1 de / })
  await primero.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => mesVisible(page)).not.toBe(inicial)
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^[^,]+, (28|29|30|31) de /)
})

test('detalle del día: día anterior y siguiente, puesto y activos con enlace a Portfolio', async ({ page }) => {
  const grid = await calendario(page)
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  const dia = grid.locator('button.tesela').first()
  test.skip(await dia.count() === 0, 'Sin días cerrados en el mes anterior')
  await dia.click()
  const detalle = page.getByRole('region', { name: /^Detalle del / })
  await expect(detalle).toBeVisible()
  const nombre = await detalle.getAttribute('aria-label')
  await detalle.getByRole('button', { name: 'Día siguiente' }).click()
  await expect(page.getByRole('region', { name: /^Detalle del / })).not.toHaveAttribute('aria-label', nombre!)
  await page.getByRole('region', { name: /^Detalle del / }).getByRole('button', { name: 'Día anterior' }).click()
  await expect(page.getByRole('region', { name: /^Detalle del / })).toHaveAttribute('aria-label', nombre!)
  await expect(page.getByRole('region', { name: /^Detalle del / }).getByRole('link', { name: /Ver .+ en Portfolio$/ }).first()).toBeVisible()
})

test('el % del mes es el Dietz modificado de la API', async ({ page }) => {
  await calendario(page)
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  const total = page.getByTestId('total-mes')
  await total.waitFor({ timeout: 10_000 }).catch(() => {})
  test.skip(await total.count() === 0, 'Sin días cerrados en el mes anterior')
  const texto = (await total.textContent()) ?? ''
  const moneda = texto.includes('$') ? 'USD' : 'EUR'
  const etiqueta = (await mesVisible(page))!.replace('P&L diario de ', '')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const [nombreMes, , anio] = etiqueta.toLowerCase().split(' ')
  const m = meses.indexOf(nombreMes) + 1
  const ultimo = new Date(Date.UTC(Number(anio), m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  const res = await page.request.get(`/api/v1/pnl/daily?currency=${moneda}&from=${anio}-${mm}-01&to=${anio}-${mm}-${ultimo}`)
  const { dietzPct } = await res.json() as { dietzPct: number }
  expect(Math.abs(pct(texto) - dietzPct)).toBeLessThan(0.006)
})

test('vista Año: total del año y meses con importe y %', async ({ page }) => {
  await calendario(page)
  await page.getByRole('radio', { name: 'Año', exact: true }).click()
  await expect(page.getByTestId('total-anio')).toBeVisible()
  await expect(page.getByRole('button', { name: /^[^ ]+ de \d{4}: .+%/ }).first()).toBeVisible()
})

test('CSV de los días del periodo', async ({ page }) => {
  await calendario(page)
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar los días del periodo a CSV' }).click()])
  expect(csv.suggestedFilename()).toMatch(/^pnl-diario_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/)
  const texto = readFileSync((await csv.path())!, 'utf8')
  expect(texto.charCodeAt(0)).toBe(0xfeff)
  const [cab, fila] = texto.slice(1).split('\r\n')
  expect(cab.split(';')[0]).toBe('Fecha')
  expect(fila).toMatch(/^\d{4}-\d{2}-\d{2};/)
})

test('a 390 px el calendario cabe sin desplazamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const grid = await calendario(page)
  const { scroll, client } = await grid.evaluate(el => ({ scroll: el.parentElement!.scrollWidth, client: el.parentElement!.clientWidth }))
  expect(scroll).toBeLessThanOrEqual(client)
  // Ni la página ni el contenido principal (un elemento oculto ancho, como una tabla sr-only, ensancha <main>).
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector('main')?.scrollWidth ?? 0))).toBeLessThanOrEqual(390)
  // Ningún importe abreviado se recorta dentro de su tesela.
  const cortados = await grid.locator('button.tesela > span:last-child').evaluateAll(els => els.filter(e => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1).length)
  expect(cortados).toBe(0)
})

for (const theme of ['dark', 'light'] as const) {
  test(`calendario con detalle y vista Año sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    const grid = await calendario(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    const dia = grid.locator('button.tesela').first()
    if (await dia.count()) await dia.click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    const analizar = async () => (await (await axeEstable(page)).include('section[aria-labelledby="pnl-calendario-titulo"]').withTags(WCAG).analyze()).violations
      .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)
    expect(await analizar()).toEqual([])
    await page.getByRole('radio', { name: 'Año', exact: true }).click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    expect(await analizar()).toEqual([])
  })
}
