import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Tabla de Operaciones (#543): una fila por operación con sus lotes, suma que
// cuadra con el neto, ninguna columna vacía, sin efecto fiscal, columnas,
// densidad y tira. Solo lectura: se bloquea cualquier petición que no sea GET.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const eur = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'))

async function abrir(page: Page, anio?: number) {
  await page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  await page.setViewportSize({ width: 1680, height: 1050 })
  await page.goto(`/fiscal?vista=operaciones${anio ? `&anio=${anio}` : ''}`)
  const tabla = page.getByRole('table', { name: /^Operaciones con ganancia o pérdida patrimonial de \d{4}$/ })
  await tabla.waitFor({ timeout: 15_000 }).catch(() => {})
  test.skip(await tabla.count() === 0, 'Sin operaciones en estos datos')
  return tabla
}

/** Operación con más lotes de los datos, según la API: su año, su activo y cuántos lotes. */
async function operacionConVariosLotes(page: Page): Promise<{ anio: number; activo: string; lotes: number } | null> {
  const years = await (await page.request.get('/api/fiscal/years')).json() as number[]
  for (const anio of years) {
    const { fiscalEvents } = await (await page.request.get(`/api/fiscal/${anio}/events`)).json() as { fiscalEvents: Array<{ txId: string; activoTransmitido: string }> }
    const n = new Map<string, { activo: string; lotes: number }>()
    // Una operación es una transacción y un activo (la comisión en BNB es otra).
    for (const e of fiscalEvents) {
      const k = `${e.txId}|${e.activoTransmitido}`
      n.set(k, { activo: e.activoTransmitido, lotes: (n.get(k)?.lotes ?? 0) + 1 })
    }
    const max = [...n.values()].sort((a, b) => b.lotes - a.lotes)[0]
    if (max && max.lotes > 1) return { anio, ...max }
  }
  return null
}

test('abrir el detalle de una venta con varios lotes', async ({ page }) => {
  const op = await operacionConVariosLotes(page)
  test.skip(op === null, 'Ninguna operación consume varios lotes en estos datos')
  const tabla = await abrir(page, op!.anio)
  // Se filtra por el activo para que la operación esté en la primera página.
  await page.getByRole('searchbox', { name: /^Buscar por activo/ }).fill(op!.activo)
  const fila = tabla.locator('tbody > tr').filter({ hasText: `${op!.lotes} lotes` }).first()
  await fila.waitFor({ timeout: 10_000 })
  await fila.getByRole('button', { name: /^Ver los lotes de / }).click()
  const lotes = page.getByRole('table', { name: /^Lotes FIFO consumidos por la operación de / })
  await expect(lotes.locator('tbody tr')).toHaveCount(op!.lotes)
  await expect(lotes.getByRole('rowheader').first()).toHaveText(/^\d{1,2} \S+ \d{4}$/)
})

/** Compra con comisión al coste de lo recibido, según la API: año y activo entregado. */
async function compraConComision(page: Page): Promise<{ anio: number; activo: string } | null> {
  const years = await (await page.request.get('/api/fiscal/years')).json() as number[]
  for (const anio of years) {
    const { fiscalEvents } = await (await page.request.get(`/api/fiscal/${anio}/events`)).json() as { fiscalEvents: Array<{ activoTransmitido: string; comisionCompraEur?: number }> }
    const e = fiscalEvents.find(x => (x.comisionCompraEur ?? 0) >= 0.01)
    if (e) return { anio, activo: e.activoTransmitido }
  }
  return null
}

test('una compra muestra su canal y su comisión al coste en la fila y en el detalle', async ({ page }) => {
  const op = await compraConComision(page)
  test.skip(op === null, 'Ninguna compra con comisión en estos datos')
  const tabla = await abrir(page, op!.anio)
  await page.getByRole('searchbox', { name: /^Buscar por activo/ }).fill(op!.activo)
  const chip = tabla.getByRole('button', { name: /^Comisión de la compra: .+ Se suma al coste del / }).first()
  await chip.waitFor({ timeout: 10_000 })
  await expect(chip).toHaveText(/^Comisión \d/)
  const fila = chip.locator('xpath=ancestor::tr[1]')
  // Una compra con comisión explícita es una orden de mercado: su canal lo dice.
  await expect(fila.getByRole('button', { name: /^Orden de mercado: / })).toHaveText('Orden')
  await fila.getByRole('button', { name: /^Ver los lotes de / }).click()
  await expect(tabla.getByText(/^Orden de mercado: .+ Comisión de la compra: .+ no es gasto de esta fila\.$/).first()).toBeVisible()
})

test('la suma de la tabla coincide con el neto del ejercicio', async ({ page }) => {
  const tabla = await abrir(page)
  const anio = Number((await tabla.locator('caption').innerText()).match(/\d{4}/)![0])
  const { netoPatrimonial } = await (await page.request.get(`/api/fiscal/${anio}/summary`)).json() as { netoPatrimonial: number }
  const total = eur(await tabla.locator('tfoot td.font-bold').innerText())
  expect(total).toBeCloseTo(netoPatrimonial, 1)
})

test('ninguna columna sale vacía en todas las filas', async ({ page }) => {
  const tabla = await abrir(page)
  const vacias = await tabla.evaluate(t => {
    const ths = [...t.querySelectorAll(':scope > thead th')].slice(0, -1)
    const filas = [...t.querySelectorAll(':scope > tbody > tr')].filter(r => r.children.length === ths.length + 1)
    return ths.filter((_, i) => filas.every(r => !(r.children[i].textContent ?? '').trim())).map(th => th.textContent)
  })
  expect(vacias).toEqual([])
})

test('columnas, densidad y sin efecto fiscal se aplican', async ({ page }) => {
  const tabla = await abrir(page)
  await page.getByRole('button', { name: /^Columnas de la tabla/ }).click()
  await page.getByRole('option', { name: 'Clave 1800' }).click()
  await page.keyboard.press('Escape')
  await expect(tabla.getByRole('columnheader', { name: 'Clave 1800' })).toHaveCount(0)
  await page.getByRole('radiogroup', { name: 'Densidad de la tabla' }).getByRole('radio', { name: 'Compacta' }).click()
  await expect(tabla.locator('tbody > tr').first().locator('td').first()).toHaveClass(/py-1\.5/)
  const sw = page.getByRole('switch', { name: /Ver las de resultado cero/ })
  if (await sw.isEnabled()) {
    await sw.check({ force: true })
    await expect(tabla.getByText('No', { exact: true }).first()).toBeVisible()
  }
})

test('la nota explica que solo hay transmisiones y enlaza Historial', async ({ page }) => {
  await abrir(page)
  const nota = page.getByText(/^Solo transmisiones: las compras con euros, los depósitos y los traspasos no se declaran/)
  await expect(nota).toBeVisible()
  await nota.getByRole('link', { name: 'Historial' }).click()
  await expect(page).toHaveURL(/\/history$/)
})

test('la tira filtra: Pérdidas deja solo resultados negativos', async ({ page }) => {
  const tabla = await abrir(page)
  await page.getByRole('button', { name: 'Ver Pérdidas en la tabla' }).click()
  const resultados = await tabla.locator('tbody > tr > td.font-semibold').allInnerTexts()
  for (const r of resultados) expect(eur(r)).toBeLessThanOrEqual(0)
})

for (const theme of ['dark', 'light'] as const) {
  test(`tabla de operaciones sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    const tabla = await abrir(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await tabla.getByRole('button', { name: /^Ver los lotes de / }).first().click()
    await page.waitForTimeout(300)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include('main').analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
