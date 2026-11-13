import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Planificar con plan de ventas (#546): colchón con su composición, añadir
// sugerencias (botón y tecla A), venta libre, barra fija con el efecto
// conjunto y sus avisos, editar, quitar con Supr y Deshacer, P para abrir el
// plan, copiar como texto y Ajustes (comisión y plan guardado). Todo
// sintético: planificador, precios, plan y simulación se interceptan; las
// escrituras no llegan a la base de datos.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const LOTES = [
  // AAA: pérdida latente (comprado a 300, vale 100). BBB: ganancia latente (comprado a 10, vale 50).
  { asset: 'AAA', walletId: 'w1', walletName: 'Exchange Uno', walletColor: '#888888', walletKind: 'exchange', openedAt: '2025-01-01T00:00:00.000Z', quantity: 10, unitCost: 300 },
  { asset: 'AAA', walletId: 'w2', walletName: 'Llavero Dos', walletColor: '#777777', walletKind: 'hardware', openedAt: '2025-02-01T00:00:00.000Z', quantity: 4, unitCost: 300 },
  { asset: 'BBB', walletId: 'w1', walletName: 'Exchange Uno', walletColor: '#888888', walletKind: 'exchange', openedAt: '2025-03-01T00:00:00.000Z', quantity: 20, unitCost: 10 },
]

interface Simulado { ventas: { asset: string; walletId: string; cantidad: number; precioEur: number }[]; comisionPct: number }

async function preparar(page: Page, opciones: { avisos?: object[]; planGuardado?: object[] } = {}) {
  const escrituras: { metodo: string; url: string; cuerpo: unknown }[] = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/prices/live', r => r.fulfill({ json: { AAA: 100, BBB: 50 } }))
  await page.route('**/api/fiscal/planificador', r => r.fulfill({ json: {
    year: 2026, netoAnio: -800, rendimientosAnio: 0, cuotaActual: 0, colchon: 1_200, pendienteVigente: 600, caducanEsteAnio: 150,
    comprasRecientes: {}, lotes: LOTES,
  } }))
  await page.route('**/api/fiscal/planificador/cuotas', async r => {
    const { ganancias } = r.request().postDataJSON() as { ganancias: number[] }
    // Cuota sintética: 19 % de lo que pasa del colchón de 1.200.
    await r.fulfill({ json: { cuotaBase: 0, cuotas: ganancias.map(g => Math.max(0, (g - 1_200) * 0.19)) } })
  })
  await page.route(/\/api\/fiscal\/plan(\?.*)?$/, async r => {
    const req = r.request()
    if (req.method() === 'GET') {
      return r.fulfill({ json: { ejercicio: 2026, comisionPct: 0.1, ventas: opciones.planGuardado ?? [], archivados: [{ ejercicio: 2025, ventas: 2 }] } })
    }
    escrituras.push({ metodo: req.method(), url: new URL(req.url()).pathname + new URL(req.url()).search, cuerpo: req.method() === 'PUT' ? req.postDataJSON() : null })
    return r.fulfill({ json: { ok: true, quitadas: 2 } })
  })
  // Simulación sintética: cada venta da (precio menos 200) por unidad; cuota del 19 % sobre lo que pasa de 1.200.
  await page.route('**/api/fiscal/plan/simular', async r => {
    const { ventas } = r.request().postDataJSON() as Simulado
    const res = ventas.map((v, indice) => ({ indice, ...v, cantidadVendida: v.cantidad, bruto: v.cantidad * v.precioEur, comision: 0, coste: 0, resultado: v.cantidad * (v.precioEur - 200) }))
    const ganancia = res.reduce((s, v) => s + Math.max(0, v.resultado), 0)
    const perdida = res.reduce((s, v) => s + Math.min(0, v.resultado), 0)
    const neto = ganancia + perdida
    await r.fulfill({ json: { ventas: res, ganancia, perdida, neto, cuotaAntes: 0, cuotaDespues: Math.max(0, (neto - 1_200) * 0.19), colchon: 1_200, avisos: opciones.avisos ?? [] } })
  })
  await page.route('**/api/settings/config', async r => {
    if (r.request().method() === 'PUT') { escrituras.push({ metodo: 'PUT', url: '/api/settings/config', cuerpo: r.request().postDataJSON() }); return r.fulfill({ json: { success: true } }) }
    return r.fulfill({ json: {} })
  })
  return escrituras
}

const barra = (page: Page) => page.getByRole('region', { name: 'Tu plan de ventas' })
const perdidas = (page: Page) => page.getByRole('heading', { name: 'Pérdidas latentes que puedes realizar' }).locator('xpath=following::ul[1]')

test('la cascada del colchón dice cada paso en texto, y la vista no tiene violaciones de axe', async ({ page }) => {
  await preparar(page)
  await page.goto('/fiscal?vista=planificar')
  const tabla = page.getByRole('table', { name: 'Cómo se llega al colchón' })
  await expect(tabla.getByRole('row', { name: /^Pérdida del año/ })).toContainText(/800,00\s€/)
  await expect(tabla.getByRole('row', { name: /^Pendientes de años anteriores/ })).toContainText(/450,00\s€/)
  await expect(tabla.getByRole('row', { name: /^Caducan el 31 de diciembre/ })).toContainText(/150,00\s€/)
  await expect(tabla.getByRole('row', { name: /^Ya usado/ })).toContainText(/-200,00\s€/)
  await expect(tabla.getByRole('row', { name: /^Colchón/ })).toContainText(/1\.200,00\s€/)
  // Sin panel suelto: la prueba de una cifra está dentro del colchón.
  await expect(page.getByRole('heading', { name: '¿Cuánto pagaría?' })).toHaveCount(0)
  await expect(barra(page)).toContainText('Vacío: añade sugerencias')
  const r = await (await axeEstable(page)).include('main').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('«Prueba una cifra»: dentro del colchón no paga; por encima, cuánto pagaría de más', async ({ page }) => {
  await preparar(page)
  await page.goto('/fiscal?vista=planificar')
  const campo = page.getByRole('textbox', { name: /Prueba una cifra/ })
  await campo.fill('1.000')
  await expect(page.getByText('Cabe en el colchón: no pagarías nada más')).toBeVisible()
  await campo.fill('2.200')
  await expect(page.getByText(/Pasa del colchón en 1\.000,00\s€: pagarías 190,00\s€ más/)).toBeVisible()
  await campo.fill('-500')
  await expect(page.getByText(/Con una pérdida de 500,00\s€/)).toBeVisible()
})

test('añadir una sugerencia la guarda y la barra muestra el efecto conjunto', async ({ page }) => {
  const escrituras = await preparar(page)
  await page.goto('/fiscal?vista=planificar')
  const fila = perdidas(page).getByRole('listitem').first()
  await fila.getByRole('button', { name: /^Añadir al plan la venta de/ }).click()
  await expect(fila.getByRole('button', { name: /ya está en el plan$/ })).toBeDisabled()
  await expect(barra(page)).toContainText('Tu plan: 1 venta')
  await expect(barra(page)).toContainText(/Cuota\s*de 0,00\s€ a 0,00\s€/)
  await expect.poll(() => escrituras.filter(e => e.url === '/api/fiscal/plan').length).toBe(1)
  expect(escrituras[0].cuerpo).toMatchObject({ ventas: [{ asset: 'AAA', walletId: 'w1', precioEur: null }] })
})

test('teclado: A añade la sugerencia enfocada, P abre el plan y Supr quita con Deshacer', async ({ page }) => {
  await preparar(page)
  await page.goto('/fiscal?vista=planificar')
  await perdidas(page).getByRole('listitem').first().focus()
  await page.keyboard.press('a')
  await expect(barra(page)).toContainText('Tu plan: 1 venta')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('p')
  const tabla = barra(page).getByRole('table')
  await expect(tabla.getByRole('row')).toHaveCount(2)
  await tabla.getByRole('row', { name: /^AAA de Exchange Uno/ }).focus()
  await page.keyboard.press('Delete')
  await expect(barra(page)).toContainText('Vacío')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(barra(page)).toContainText('Tu plan: 1 venta')
})

test('venta libre con precio propio, editar la cantidad y ver el resultado de cada venta', async ({ page }) => {
  await preparar(page)
  await page.goto('/fiscal?vista=planificar')
  await barra(page).getByRole('button', { name: 'Añadir otra venta' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Añadir otra venta al plan' })
  await dialogo.getByRole('button', { name: 'Activo' }).click()
  await page.getByRole('option', { name: /^BBB/ }).click()
  await dialogo.getByRole('button', { name: 'Máx' }).click()
  await expect(dialogo.getByLabel('Cantidad')).toHaveValue('20')
  await dialogo.getByLabel('Precio por unidad (opcional)').fill('250')
  await dialogo.getByRole('button', { name: 'Añadir al plan' }).click()
  // La venta libre abre el plan: 20 BBB a 250 dan +1.000 con la simulación sintética.
  const fila = barra(page).getByRole('row', { name: /^BBB de Exchange Uno/ })
  await expect(fila).toContainText('precio propio')
  await expect(fila).toContainText(/\+1\.000,00\s€/)
  const cantidad = fila.getByRole('textbox', { name: 'Cantidad de BBB de Exchange Uno' })
  await cantidad.fill('0.5')
  await cantidad.press('Enter')
  await expect(fila).toContainText(/\+25,00\s€/)
})

test('los avisos del plan se dicen en texto', async ({ page }) => {
  await preparar(page, {
    planGuardado: [{ asset: 'AAA', walletId: 'w1', walletNombre: 'Exchange Uno', cantidad: 12, precioEur: null }],
    avisos: [
      { tipo: 'colchon', exceso: 700, cuotaExtra: 133 },
      { tipo: 'recompra', asset: 'AAA', compras: ['2026-10-01'] },
      { tipo: 'saldo', asset: 'AAA', walletId: 'w1', pedido: 12, disponible: 10 },
    ],
  })
  await page.goto('/fiscal?vista=planificar')
  await expect(barra(page)).toContainText('3 avisos')
  await barra(page).getByRole('button', { name: 'Ver plan' }).click()
  const avisos = barra(page).getByRole('list', { name: 'Avisos del plan' })
  await expect(avisos).toContainText(/El plan pasa del colchón en 700,00\s€: añade 133,00\s€ de cuota\./)
  await expect(avisos).toContainText('Vendes AAA con pérdida y lo compraste hace menos de 2 meses (1 oct 2026)')
  await expect(avisos).toContainText('Pides 12 AAA de Exchange Uno, pero hay 10')
  const r = await (await axeEstable(page)).include('section[aria-label="Tu plan de ventas"]').withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
})

test('copiar el plan da una lista legible', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await preparar(page, { planGuardado: [{ asset: 'BBB', walletId: 'w1', walletNombre: 'Exchange Uno', cantidad: 2, precioEur: 250 }] })
  await page.goto('/fiscal?vista=planificar')
  await expect(barra(page)).toContainText(/Ganancia\s*100,00\s€/)
  await barra(page).getByRole('button', { name: 'Copiar' }).click()
  const texto = await page.evaluate(() => navigator.clipboard.readText())
  expect(texto.split('\n')[0]).toMatch(/^Plan de fin de año 2026 \(/)
  expect(texto).toMatch(/- Vender 2 BBB de Exchange Uno a 250,00\s€ \(precio propio\): \+100,00\s€/)
  expect(texto).toContain('Comisión estimada 0,1 %')
})

test('Ajustes: la comisión del plan se guarda en Fiscal y el plan se vacía desde Datos', async ({ page }) => {
  const escrituras = await preparar(page, { planGuardado: [{ asset: 'BBB', walletId: 'w1', walletNombre: 'Exchange Uno', cantidad: 2, precioEur: null }] })
  await page.goto('/settings?tab=fiscal')
  const comision = page.getByRole('textbox', { name: 'Comisión estimada del plan en porcentaje' })
  await comision.fill('0,25')
  await comision.press('Enter')
  await expect.poll(() => escrituras.at(-1)?.cuerpo).toEqual({ key: 'plan_comision_pct', value: '0.25' })
  await page.goto('/settings?tab=datos')
  const tarjeta = page.getByRole('region', { name: 'Plan de ventas de fin de año' })
  await expect(tarjeta).toContainText('Plan de 2026: 1 venta')
  await expect(tarjeta).toContainText('Plan archivado de 2025: 2 ventas')
  await tarjeta.getByRole('button', { name: 'Vaciar' }).click()
  await expect.poll(() => escrituras.some(e => e.metodo === 'DELETE' && e.url === '/api/fiscal/plan')).toBe(true)
})
