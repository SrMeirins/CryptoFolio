import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Modelo 721 por custodia (#545): la respuesta con su motivo, margen y barra;
// dónde está tu dinero (tres cifras); «Te falta» con la pregunta de tres
// botones; grupos separados en los que computan (con su reparto) y los que no,
// con cómo se sabe la custodia; cambiar la de un exchange con regla
// automática; histórico apilado con el año resaltado y accesibilidad. La respuesta es sintética y las escrituras se interceptan.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const AUTO = { origen: 'automatico', desde: null, filaId: null, regla: 'binance' }
const REGLA = {
  clave: 'binance', exchange: 'Exchange Nativo',
  tramos: [
    { desde: null, enEspana: false, entidad: { nombre: 'Nativo (fuera de España)', nif: null, pais: null, web: null } },
    { desde: '2022-07-07', enEspana: true, entidad: { nombre: 'Nativo Spain SL', nif: null, pais: 'ES', web: null } },
  ],
  fuentes: [{ titulo: 'Condiciones de ejemplo', url: 'https://ejemplo.test/condiciones' }],
  nota: 'La fecha de tu cuenta puede variar.',
}

function respuesta(year: number, umbral = 50_000) {
  const grupos = [
    { clave: 'entidad:Exchange Ejemplo Europe Ltd', entidad: { nombre: 'Exchange Ejemplo Europe Ltd', nif: 'MT00000000', pais: 'MT', web: null }, enEspana: false,
      wallets: [{ id: 'w1', nombre: 'Spot', origen: 'usuario', desde: null, filaId: 'f1', regla: null }, { id: 'w2', nombre: 'Earn', origen: 'usuario', desde: null, filaId: 'f2', regla: null }],
      computa: true, activos: [{ asset: 'BTC', unidades: 1.5, valorEur: 60_000, sinPrecio: false }, { asset: 'ETH', unidades: 2, valorEur: 4_000, sinPrecio: false }], totalEur: 64_000 },
    { clave: 'entidad:Nativo Spain SL', entidad: { nombre: 'Nativo Spain SL', nif: null, pais: 'ES', web: null }, enEspana: true,
      wallets: [{ id: 'w3', nombre: 'Nativo Spot', ...AUTO }], computa: false,
      activos: [{ asset: 'ADA', unidades: 1000, valorEur: 500, sinPrecio: false }], totalEur: 500 },
    { clave: 'wallet:w4', entidad: null, enEspana: null, wallets: [{ id: 'w4', nombre: 'Exchange sin datos', origen: 'desconocido', desde: null, filaId: null, regla: null }],
      computa: true, activos: [{ asset: 'SOL', unidades: 10, valorEur: 1_000, sinPrecio: false }], totalEur: 1_000 },
  ]
  const valor = 65_000
  return {
    year, esAnioEnCurso: false, fecha: `${year}-12-31`, grupos,
    veredicto: { obligado: true, motivo: 'umbral', valorEur: valor, umbral, objetivoIncremento: null, extinguidas: [] },
    historico: [
      { ejercicio: year - 1, valorEur: 30_000, noComputaEur: 0, autocustodiaEur: 2_000, estimado: false, presentado: false, incompleto: false },
      { ejercicio: year, valorEur: valor, noComputaEur: 500, autocustodiaEur: 4_500, estimado: false, presentado: false, incompleto: false },
    ],
    totalValor: 70_000, totalValorCustodia: valor, superaUmbral: true, umbral,
    sinCustodia: [{ id: 'w4', nombre: 'Exchange sin datos' }], reglas: [REGLA], preciosPendientes: [], incompleto: false,
    ultimaPresentacion: null, obligado: true, presentado: null,
  }
}

const hoyAuto = { enEspana: true, entidad: REGLA.tramos[1].entidad, ...AUTO, desde: '2022-07-07' }
const CUSTODIA = {
  reglas: [REGLA],
  wallets: [
    { walletId: 'w3', nombre: 'Nativo Spot', regla: 'binance', hoy: hoyAuto, filas: [] },
    { walletId: 'w5', nombre: 'Nativo Margin', regla: 'binance', hoy: hoyAuto, filas: [] },
  ],
}

/** Primer ejercicio cerrado según la API; el 721 de ese año se sustituye por el sintético. */
async function abrir(page: Page) {
  const years = await (await page.request.get('/api/fiscal/years')).json() as number[]
  const anio = years.find(y => y < new Date().getFullYear())
  test.skip(anio === undefined, 'Sin ejercicios cerrados en estos datos')
  const escrituras: { metodo: string; url: string; cuerpo: unknown }[] = []
  await page.route('**/api/**', async r => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET') {
      escrituras.push({ metodo: req.method(), url: url.pathname, cuerpo: req.postDataJSON() })
      if (url.pathname.startsWith('/api/fiscal/custodia/')) return r.fulfill({ json: { ok: true } })
      return r.abort()
    }
    if (url.pathname === `/api/fiscal/${anio}/modelo721`) return r.fulfill({ json: respuesta(anio!) })
    if (url.pathname === '/api/fiscal/custodia') return r.fulfill({ json: CUSTODIA })
    return r.continue()
  })
  await page.setViewportSize({ width: 1680, height: 1050 })
  // Sin animaciones de entrada: axe mide la pantalla asentada.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/fiscal?vista=modelo721&anio=${anio}`)
  const vista = page.getByRole('region', { name: `Modelo 721 · ${anio}` })
  await vista.waitFor({ timeout: 15_000 })
  return { vista, anio: anio!, escrituras }
}

test('la respuesta, su margen y dónde está tu dinero, en texto', async ({ page }) => {
  const { vista } = await abrir(page)
  await expect(vista.getByRole('status').filter({ hasText: 'Tienes que presentarlo' })).toBeVisible()
  await expect(vista).toContainText('supera el umbral de 50.000')
  await expect(vista.getByRole('img', { name: /^65\.000,00 € frente al umbral de 50\.000,00 €$/ })).toBeVisible()
  await expect(vista).toContainText(/Superas el umbral en 15\.000,00\s€/)
  const donde = vista.getByRole('region', { name: 'Dónde está tu dinero' })
  await expect(donde).toContainText(/Fuera de España \(computa\)\s*65\.000,00\s€/)
  await expect(donde).toContainText(/En exchanges en España \(no computa\)\s*500,00\s€/)
  await expect(donde).toContainText(/En autocustodia \(no computa\)\s*4\.500,00\s€/)
  const reparto = vista.getByRole('figure', { name: 'Qué aporta cada entidad al valor que computa' })
  await expect(reparto.getByRole('listitem')).toHaveCount(2)
  await expect(reparto.getByRole('listitem').first()).toContainText('(98 %)')
})

test('los grupos van separados en los que computan y los que no, con cómo se sabe la custodia', async ({ page }) => {
  const { vista } = await abrir(page)
  const computan = vista.getByRole('list', { name: 'Computan para el 721' }).getByRole('listitem')
  await expect(computan).toHaveCount(2)
  await expect(computan.nth(0)).toContainText('Fuera de España: computa, Malta, NIF MT00000000. Lo indicaste tú')
  await expect(computan.nth(1)).toContainText('No se sabe: computa por prudencia')
  await expect(computan.nth(1).getByRole('button', { name: 'Cambiar la custodia de Exchange sin datos' })).toHaveText('Indicar')
  const noComputan = vista.getByRole('list', { name: 'No computan' }).getByRole('listitem')
  await expect(noComputan).toHaveCount(1)
  await expect(noComputan.first()).toContainText('En España: no computa. Automático, según las condiciones de Exchange Nativo')
  await vista.getByRole('button', { name: 'Ver las monedas de Exchange Ejemplo Europe Ltd' }).click()
  await expect(vista.getByRole('table', { name: 'Monedas de Exchange Ejemplo Europe Ltd' }).getByRole('row')).toHaveCount(3)
})

test('«Te falta»: la pregunta de tres botones guarda «fuera de España» y «No lo sé» no guarda nada', async ({ page }) => {
  const { vista, escrituras } = await abrir(page)
  const falta = vista.getByRole('region', { name: 'Te falta' })
  // Año cerrado y obligado sin marcar: también pide marcarlo como presentado.
  await expect(falta.getByRole('button', { name: 'Marcar como presentado' })).toBeVisible()
  const pregunta = falta.getByRole('group', { name: '¿Dónde está la custodia de Exchange sin datos?' })
  await pregunta.getByRole('button', { name: 'No lo sé' }).click()
  await expect(vista).toContainText('Exchange sin datos: no sabes dónde está la custodia, así que computa por prudencia.')
  expect(escrituras).toEqual([])
  await vista.getByRole('button', { name: 'Responder' }).click()
  await pregunta.getByRole('button', { name: 'Fuera de España' }).click()
  await expect.poll(() => escrituras.length).toBe(1)
  expect(escrituras[0]).toEqual({ metodo: 'PUT', url: '/api/fiscal/custodia/w4', cuerpo: { desde: null, enEspana: false, entidad: null } })
})

test('cambiar la custodia de un exchange con regla: muestra la regla y sus fuentes y se aplica a todas sus subcuentas', async ({ page }) => {
  const { vista, escrituras } = await abrir(page)
  await vista.getByRole('button', { name: 'Cambiar la custodia de Nativo Spain SL' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Custodia de Exchange Nativo' })
  await expect(dialogo).toContainText('Regla automática de Exchange Nativo')
  await expect(dialogo).toContainText('Desde el 7 jul 2022: en España (Nativo Spain SL)')
  await expect(dialogo.getByRole('link', { name: /Condiciones de ejemplo/ })).toHaveAttribute('target', '_blank')
  await expect(dialogo).toContainText('Se aplica a sus 2 wallets: Nativo Spot, Nativo Margin.')
  await dialogo.getByRole('radio', { name: 'Fuera de España' }).check()
  await dialogo.getByLabel('Desde (vacío: desde siempre)').fill('2022-07-07')
  await dialogo.getByText('Datos para el formulario del 721 (opcional)').click()
  await dialogo.getByRole('button', { name: 'País de la sociedad' }).click()
  await page.getByRole('option', { name: 'Malta' }).click()
  await dialogo.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialogo).toBeHidden()
  expect(escrituras.map(e => e.url).sort()).toEqual(['/api/fiscal/custodia/w3', '/api/fiscal/custodia/w5'])
  expect(escrituras[0].cuerpo).toEqual({ desde: '2022-07-07', enEspana: false, entidad: { nombre: 'Exchange Nativo', nif: null, pais: 'MT', web: null } })
})

test('el histórico tiene su tabla accesible y la vista no tiene violaciones de axe', async ({ page }) => {
  const { vista, anio } = await abrir(page)
  const tabla = vista.getByRole('table', { name: 'Cartera por custodia para el Modelo 721 por ejercicio' })
  await expect(tabla.getByRole('row', { name: new RegExp(`^${anio} `) })).toContainText('Lo supera')
  await expect(vista).toContainText(`Resaltado, ${anio}.`)
  await expect(vista).toContainText('arriba, la autocustodia. Estas dos no computan')
  await expect(tabla.getByRole('row', { name: new RegExp(`^${anio} `) })).toContainText('4.500,00')
  const r = await new AxeBuilder({ page }).include(`[aria-labelledby="m721-title"]`).withTags(WCAG).analyze()
  expect(r.violations).toEqual([])
  // Qué cuenta y qué no está en la ayuda.
  await vista.getByRole('button', { name: '¿Cómo funciona?' }).click()
  await expect(page.getByRole('dialog')).toContainText('no va en el 721, sino en el 720')
  await page.keyboard.press('Escape')
  await vista.getByRole('button', { name: 'Cambiar la custodia de Nativo Spain SL' }).click()
  const d = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(WCAG).analyze()
  expect(d.violations).toEqual([])
})

test('sin desbordes horizontales en móvil', async ({ page }) => {
  const { vista } = await abrir(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await expect(vista.getByRole('status').filter({ hasText: 'Tienes que presentarlo' })).toBeVisible()
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde).toBeLessThanOrEqual(0)
})
