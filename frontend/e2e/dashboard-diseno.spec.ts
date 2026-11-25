import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Dashboard personalizable (#521): mover un panel solo con teclado y recargar,
// arrastrar con el ratón, ocultar, contraer y expandir, restaurar, la tarjeta de
// Ajustes y axe. La clave «dashboard_diseno» es global: las pruebas van en
// serie, guardan el valor previo y lo restauran al terminar.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const DEFECTO = JSON.stringify({ orden: [], ocultos: [], contraidos: [] })

test.describe.configure({ mode: 'serial' })

let previo: string | undefined

async function fijarDiseno(page: Page, valor: string) {
  expect((await page.request.put('/api/settings/config', { data: { key: 'dashboard_diseno', value: valor } })).status()).toBe(200)
}

/** Orden de los paneles en el editor. */
const ordenEditor = (page: Page) => page.getByTestId('editor-diseno').first().locator('[data-testid="fila-panel"]').evaluateAll(els => els.map(e => e.getAttribute('data-panel')))
/** Orden de los paneles en la página (abiertos y contraídos). */
const ordenPagina = (page: Page) => page.locator('main [data-panel]').evaluateAll(els => els.map(e => e.getAttribute('data-panel')))

test.beforeAll(async ({ request }) => {
  previo = ((await (await request.get('/api/settings/config')).json()) as Record<string, string>).dashboard_diseno
})

test.afterAll(async ({ request }) => {
  await request.put('/api/settings/config', { data: { key: 'dashboard_diseno', value: previo ?? DEFECTO } })
})

test('la API valida el diseño con esquema', async ({ page }) => {
  for (const value of ['{"orden":["otro"],"ocultos":[],"contraidos":[]}', '[]', 'x']) {
    expect((await page.request.put('/api/settings/config', { data: { key: 'dashboard_diseno', value } })).status()).toBe(400)
  }
})

test('mover un panel solo con teclado y recargar', async ({ page }) => {
  await fijarDiseno(page, DEFECTO)
  await page.goto('/')
  await page.getByRole('button', { name: 'Personalizar' }).click()
  await expect(page.getByRole('heading', { name: 'Personalizar el Dashboard' })).toBeFocused()
  const antes = await ordenEditor(page)
  expect(antes.slice(0, 4)).toEqual(['resumen', 'metas', 'variacion', 'evolucion'])

  // Bajar Variación dos veces con Enter: el foco se queda en el botón.
  const bajar = page.getByRole('button', { name: 'Bajar Variación' })
  await bajar.focus()
  await page.keyboard.press('Enter')
  await expect(bajar).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => ordenEditor(page)).toEqual(['resumen', 'metas', 'evolucion', 'rendimiento', 'variacion', ...antes.slice(5)])
  await expect(page.getByRole('status').filter({ hasText: 'Variación, posición 5 de 10' })).toHaveCount(1)
  // Subir de nuevo con Espacio.
  await page.getByRole('button', { name: 'Subir Variación' }).focus()
  await page.keyboard.press('Space')
  await expect.poll(() => ordenEditor(page)).toEqual(['resumen', 'metas', 'evolucion', 'variacion', 'rendimiento', ...antes.slice(5)])

  await page.getByRole('button', { name: 'Listo' }).click()
  // El guardado va en segundo plano: se espera a que el servidor tenga el orden antes de recargar.
  await expect.poll(async () => {
    const raw = ((await (await page.request.get('/api/settings/config')).json()) as Record<string, string>).dashboard_diseno ?? '{}'
    const orden = (JSON.parse(raw) as { orden?: string[] }).orden ?? []
    return orden.indexOf('evolucion') < orden.indexOf('variacion') && orden.indexOf('variacion') < orden.indexOf('rendimiento')
  }).toBe(true)
  await page.reload()
  await expect(page.locator('main [data-panel="variacion"]')).toBeVisible()
  // Los paneles salen ya en su orden guardado (sin pasar por el de por defecto).
  const pagina = await ordenPagina(page)
  expect(pagina.indexOf('evolucion')).toBeLessThan(pagina.indexOf('variacion'))
  expect(pagina.indexOf('variacion')).toBeLessThan(pagina.indexOf('rendimiento'))
})

test('arrastrar con el ratón por el asa', async ({ page }) => {
  await fijarDiseno(page, DEFECTO)
  await page.goto('/')
  await page.getByRole('button', { name: 'Personalizar' }).click()
  const filas = page.getByTestId('fila-panel')
  const asa = filas.nth(0).locator('span[aria-hidden="true"]').first()
  const a = await asa.boundingBox()
  const destino = await filas.nth(2).boundingBox()
  if (!a || !destino) throw new Error('sin cajas')
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2, destino.y + destino.height * 0.75, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => ordenEditor(page)).toEqual(['metas', 'variacion', 'resumen', 'evolucion', 'rendimiento', 'pnl-diario', 'distribucion', 'fiscal', 'actividad', 'ingresos'])
  const guardado = JSON.parse(((await (await page.request.get('/api/settings/config')).json()) as Record<string, string>).dashboard_diseno) as { orden: string[] }
  expect(guardado.orden.slice(0, 3)).toEqual(['metas', 'variacion', 'resumen'])
})

test('ocultar, contraer y expandir; restaurar con Deshacer', async ({ page }) => {
  await fijarDiseno(page, DEFECTO)
  await page.goto('/')
  await page.getByRole('button', { name: 'Personalizar' }).click()
  const estadoIngresos = page.getByRole('radiogroup', { name: 'Estado de Ingresos pasivos' })
  await estadoIngresos.getByRole('radio', { name: 'Oculto' }).click()
  await expect(estadoIngresos.getByRole('radio', { name: 'Oculto' })).toBeChecked()
  await expect(page.getByTestId('fila-panel').filter({ hasText: 'Ingresos pasivos' })).toHaveAttribute('data-estado', 'oculto')
  // El minimapa lo refleja: deja de contar ese panel.
  await expect(page.getByTestId('minimapa')).toContainText('9 visibles')
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.locator('main [data-panel="ingresos"]')).toHaveCount(0)

  // Contraer desde el propio panel: queda la barra y no se monta el panel.
  const rendimiento = page.locator('main [data-panel="rendimiento"]')
  await rendimiento.hover()
  await page.getByRole('button', { name: 'Minimizar Rendimiento' }).click()
  const barra = page.getByTestId('panel-contraido').filter({ hasText: 'Rendimiento' })
  await expect(barra).toBeVisible()
  await expect(barra.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  await expect(page.getByTestId('panel-contraido').filter({ hasText: 'Rendimiento' })).toBeVisible()
  await page.getByTestId('panel-contraido').filter({ hasText: 'Rendimiento' }).getByRole('button').click()
  await expect(page.getByTestId('panel-contraido')).toHaveCount(0)

  // Restaurar vuelve a mostrar Ingresos; Deshacer lo oculta de nuevo.
  await page.getByRole('button', { name: 'Personalizar' }).click()
  await page.getByRole('button', { name: 'Restaurar diseño por defecto' }).click()
  const estado = page.getByRole('radiogroup', { name: 'Estado de Ingresos pasivos' })
  await expect(estado.getByRole('radio', { name: 'Completo' })).toBeChecked()
  await page.getByRole('button', { name: 'Deshacer', exact: true }).first().click()
  await expect(estado.getByRole('radio', { name: 'Oculto' })).toBeChecked()
})

test('Rentabilidad abre Evolución si está contraída y baja a ella', async ({ page }) => {
  await fijarDiseno(page, JSON.stringify({ orden: [], ocultos: [], contraidos: ['evolucion'] }))
  await page.goto('/')
  await expect(page.getByTestId('panel-contraido').filter({ hasText: 'Evolución' })).toBeVisible()
  await page.getByRole('button', { name: /^Rentabilidad: .*Ir al gráfico de evolución/ }).click()
  await expect(page.getByRole('region', { name: 'Evolución de la cartera' })).toBeFocused()
})

test('Ajustes › General: el mismo editor guarda al momento', async ({ page }) => {
  await fijarDiseno(page, DEFECTO)
  await page.goto('/settings?tab=general')
  const card = page.getByTestId('ajustes-diseno')
  const estado = card.getByRole('radiogroup', { name: 'Estado de Fiscal' })
  await estado.getByRole('radio', { name: 'Solo título' }).click()
  await expect(estado.getByRole('radio', { name: 'Solo título' })).toBeChecked()
  await expect.poll(async () => ((await (await page.request.get('/api/settings/config')).json()) as Record<string, string>).dashboard_diseno).toContain('"contraidos":["fiscal"]')
})

for (const theme of ['dark', 'light'] as const) {
  test(`modo Personalizar, barra contraída y Ajustes sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fijarDiseno(page, JSON.stringify({ orden: [], ocultos: ['ingresos'], contraidos: ['fiscal'] }))
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.getByTestId('panel-contraido')).toBeVisible()
    const barra = await (await axeEstable(page)).include('[data-testid="panel-contraido"]').withTags(WCAG).analyze()
    expect(barra.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    await page.getByRole('button', { name: 'Personalizar' }).click()
    const modo = await (await axeEstable(page)).include('[data-testid="modo-personalizar"]').withTags(WCAG).analyze()
    expect(modo.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])

    await page.goto('/settings?tab=general')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByTestId('ajustes-diseno').waitFor()
    const ajustes = await (await axeEstable(page)).include('[data-testid="ajustes-diseno"]').withTags(WCAG).analyze()
    expect(ajustes.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('a 390 px el modo Personalizar no desborda', async ({ page }) => {
  await fijarDiseno(page, DEFECTO)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Personalizar' }).click()
  await expect(page.getByTestId('editor-diseno')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
