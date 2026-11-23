import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Metas de inversión (#520): validación de la clave en la API, crear, editar y
// borrar desde la franja del Dashboard, la privacidad (solo el %), la gestión
// en Ajustes › General y axe. La clave «metas» es global: las pruebas van en
// serie, guardan el valor previo y lo restauran al terminar.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const NOMBRE = 'Meta de prueba e2e'

test.describe.configure({ mode: 'serial' })

let previo: string | undefined

async function fijarMetas(page: Page, valor: string) {
  const res = await page.request.put('/api/settings/config', { data: { key: 'metas', value: valor } })
  expect(res.status()).toBe(200)
}

test.beforeAll(async ({ request }) => {
  previo = ((await (await request.get('/api/settings/config')).json()) as Record<string, string>).metas
})

test.afterAll(async ({ request }) => {
  await request.put('/api/settings/config', { data: { key: 'metas', value: previo ?? '[]' } })
})

test('la API valida la lista de metas con esquema', async ({ page }) => {
  for (const value of ['{}', 'no es json', JSON.stringify([{ id: 'meta-0001', nombre: 'x', tipo: 'valor', objetivo: -1, moneda: 'EUR' }])]) {
    expect((await page.request.put('/api/settings/config', { data: { key: 'metas', value } })).status()).toBe(400)
  }
})

test('crear, editar y borrar una meta desde la franja del Dashboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fijarMetas(page, '[]')
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir una meta' }).click()
  const form = page.getByRole('form', { name: 'Nueva meta' })
  await form.getByLabel('Nombre').fill(NOMBRE)
  // Objetivo mínimo: cualquier cartera con precios lo cumple.
  await form.getByLabel(/^Objetivo/).fill('0,01')
  // Vista previa en vivo antes de guardar.
  await expect(form.getByTestId('vista-previa-meta')).toContainText('Ya está cumplida', { timeout: 20_000 })
  // Las flechas cambian de tipo (radios nativos).
  await form.getByRole('radio', { name: 'Valor total de la cartera' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(form.getByRole('radio', { name: 'Aportado este año' })).toBeChecked()
  await page.keyboard.press('ArrowLeft')
  await expect(form.getByRole('radio', { name: 'Valor total de la cartera' })).toBeChecked()
  await form.getByRole('button', { name: 'Guardar meta' }).click()

  const franja = page.getByTestId('franja-metas')
  const tarjeta = franja.getByTestId('tarjeta-meta').filter({ hasText: NOMBRE })
  await expect(tarjeta).toBeVisible()
  await expect(tarjeta.getByRole('progressbar', { name: `Progreso de ${NOMBRE}` })).toBeVisible()
  await expect(tarjeta).toContainText('Cumplida', { timeout: 20_000 })

  // Se guarda en la configuración.
  const guardado = JSON.parse(((await (await page.request.get('/api/settings/config')).json()) as Record<string, string>).metas) as Array<{ nombre: string; tipo: string }>
  expect(guardado).toEqual([expect.objectContaining({ nombre: NOMBRE, tipo: 'valor' })])

  // Editar: cambia el nombre.
  await tarjeta.getByRole('button', { name: `Editar la meta ${NOMBRE}` }).click()
  const edicion = page.getByRole('form', { name: `Editar la meta ${NOMBRE}` })
  await edicion.getByLabel('Nombre').fill(`${NOMBRE} 2`)
  await edicion.getByRole('button', { name: 'Guardar meta' }).click()
  const editada = franja.getByTestId('tarjeta-meta').filter({ hasText: `${NOMBRE} 2` })
  await expect(editada).toBeVisible()

  // Borrar con confirmación: vuelve el enlace discreto.
  await editada.getByRole('button', { name: `Borrar la meta ${NOMBRE} 2` }).click()
  await editada.getByRole('button', { name: 'Confirmar borrado' }).click()
  await expect(page.getByRole('button', { name: 'Añadir una meta' })).toBeVisible()
})

test('el formulario valida el nombre y el objetivo', async ({ page }) => {
  await fijarMetas(page, '[]')
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir una meta' }).click()
  const form = page.getByRole('form', { name: 'Nueva meta' })
  await form.getByRole('button', { name: 'Guardar meta' }).click()
  await expect(form.getByText('Escribe un nombre para la meta.')).toBeVisible()
  await expect(form.getByText(/Escribe un objetivo mayor que 0/)).toBeVisible()
  await expect(form.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true')
})

test('con la privacidad, solo el porcentaje; el nombre con HTML se pinta como texto', async ({ page }) => {
  const nombre = '<b>Meta</b> e2e'
  await fijarMetas(page, JSON.stringify([{ id: 'meta-e2e-0001', nombre, tipo: 'valor', objetivo: 999999999, moneda: 'EUR' }]))
  await page.addInitScript(() => localStorage.setItem('cryptofolio.privacy', '1'))
  await page.goto('/')
  const tarjeta = page.getByTestId('tarjeta-meta').first()
  await expect(tarjeta).toContainText(nombre)
  await expect(tarjeta.locator('b')).toHaveCount(0)
  await expect(tarjeta).toContainText('%', { timeout: 20_000 })
  const texto = await tarjeta.innerText()
  expect(texto).not.toMatch(/\d[\d.,]*\s?[€$]/)
  expect(texto).not.toContain('Faltan')
})

test('Ajustes › General: crear una meta de cantidad y verla en el Dashboard', async ({ page }) => {
  await fijarMetas(page, '[]')
  const lots = await (await page.request.get('/api/fifo/lots')).json() as Array<{ asset: string }>
  test.skip(lots.length === 0, 'Sin activos en cartera')
  await page.goto('/settings?tab=general')
  const card = page.getByTestId('ajustes-metas')
  await card.getByRole('button', { name: 'Añadir meta' }).click()
  const form = card.getByRole('form', { name: 'Nueva meta' })
  // El radio es nativo y visualmente oculto: se pulsa su tesela, como un usuario.
  await form.locator('label').filter({ hasText: 'Cantidad de un activo' }).click()
  await expect(form.getByRole('radio', { name: 'Cantidad de un activo' })).toBeChecked()
  await form.getByLabel('Nombre').fill(NOMBRE)
  await form.getByLabel(/^Objetivo/).fill('1.000.000')
  await form.getByRole('button', { name: 'Guardar meta' }).click()
  await expect(card.getByTestId('fila-meta').filter({ hasText: NOMBRE })).toContainText('Cantidad de')

  await page.goto('/')
  await expect(page.getByTestId('tarjeta-meta').filter({ hasText: NOMBRE })).toContainText('Faltan', { timeout: 20_000 })
})

for (const theme of ['dark', 'light'] as const) {
  test(`franja y tarjeta de Ajustes sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await fijarMetas(page, JSON.stringify([
      { id: 'meta-e2e-0001', nombre: 'Cumplida', tipo: 'valor', objetivo: 0.01, moneda: 'EUR' },
      { id: 'meta-e2e-0002', nombre: 'Lejana', tipo: 'aportado', objetivo: 999999999, moneda: 'EUR' },
    ]))
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.getByTestId('tarjeta-meta').first()).toContainText('%', { timeout: 20_000 })
    await page.getByTestId('franja-metas').getByRole('button', { name: 'Añadir meta' }).click()
    await page.getByRole('form', { name: 'Nueva meta' }).getByLabel(/^Objetivo/).fill('1000')
    const dash = await (await axeEstable(page)).include('[data-testid="franja-metas"]').withTags(WCAG).analyze()
    expect(dash.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])

    await page.goto('/settings?tab=general')
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.getByTestId('ajustes-metas').getByRole('button', { name: 'Añadir meta' }).click()
    const ajustes = await (await axeEstable(page)).include('[data-testid="ajustes-metas"]').withTags(WCAG).analyze()
    expect(ajustes.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}

test('a 390 px la franja no desborda', async ({ page }) => {
  await fijarMetas(page, JSON.stringify([{ id: 'meta-e2e-0001', nombre: 'Un nombre de meta largo para el ancho', tipo: 'valor', objetivo: 999999999, moneda: 'EUR' }]))
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('tarjeta-meta')).toBeVisible()
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(desborda).toBe(false)
})
