import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Ejercicios como tarjetas con estado en Resumen (#536). Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const soloLectura = (page: Page) => page.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
const tarjetas = (page: Page) => page.getByRole('tablist', { name: 'Ejercicios fiscales' })

test.use({ viewport: { width: 1440, height: 900 } })

test('en Resumen las tarjetas son el selector: estado, flechas y ?anio=', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  const lista = tarjetas(page)
  await expect(lista).toBeVisible()
  const elegida = lista.getByRole('tab', { selected: true })
  await expect(elegida).toContainText(/En curso|Por declarar|Declarado/)
  await expect(elegida).toContainText(/operaci(ón|ones)/)
  // En Resumen la cabecera no repite el selector de años.
  await expect(page.getByRole('tablist', { name: 'Ejercicio fiscal' })).toHaveCount(0)

  const total = await lista.getByRole('tab').count()
  test.skip(total < 2, 'Hace falta más de un ejercicio en estos datos')
  await elegida.focus()
  // Fin lleva a la última tarjeta, con el foco y el año en la URL.
  await page.keyboard.press('End')
  const ultima = lista.getByRole('tab').last()
  await expect(ultima).toHaveAttribute('aria-selected', 'true')
  await expect(ultima).toBeFocused()
  const anio = (await ultima.textContent())?.match(/\d{4}/)?.[0]
  await expect(page).toHaveURL(new RegExp(`anio=${anio}`))
  // La flecha izquierda vuelve a la anterior.
  await page.keyboard.press('ArrowLeft')
  await expect(lista.getByRole('tab').nth(total - 2)).toHaveAttribute('aria-selected', 'true')
})

test('carrusel ajustado: solo tarjetas completas y botones que avanzan', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal')
  const lista = tarjetas(page)
  await expect(lista).toBeVisible()
  // Ninguna tarjeta queda a medias en el borde de la fila.
  const cortadas = async () => lista.evaluate(el => {
    const L = el.getBoundingClientRect()
    const izq = L.left + 4, der = L.right - 4
    return [...el.querySelectorAll('[role="tab"]')].map(t => t.getBoundingClientRect())
      .filter(t => (t.left < izq - 0.5 && t.right > izq + 0.5) || (t.left < der - 0.5 && t.right > der + 0.5)).length
  })
  expect(await cortadas()).toBe(0)
  const siguiente = page.getByRole('button', { name: /Ejercicios más antiguos|Ejercicios siguientes/ })
  test.skip(await siguiente.count() === 0, 'Todos los ejercicios caben en la fila')
  const rotulo = page.getByText(/^Ejercicios 1 a \d+ de \d+$/)
  await expect(rotulo).toBeVisible()
  await siguiente.click()
  await expect(page.getByText(/^Ejercicios [2-9]\d* a \d+ de \d+$/)).toBeVisible()
  // El desplazamiento es animado: al terminar, ninguna tarjeta queda cortada.
  await expect.poll(cortadas).toBe(0)
})

test('en las demás vistas sigue el selector de la cabecera', async ({ page }) => {
  await soloLectura(page)
  await page.goto('/fiscal?vista=operaciones')
  await expect(page.getByRole('tablist', { name: 'Ejercicio fiscal' })).toBeVisible()
  await expect(tarjetas(page)).toHaveCount(0)
})

for (const theme of ['dark', 'light'] as const) {
  test(`tarjetas de ejercicio sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await soloLectura(page)
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/fiscal')
    await expect(tarjetas(page)).toBeVisible()
    const r = await (await axeEstable(page)).withTags(WCAG).include('[aria-label="Ejercicios fiscales"]').analyze()
    expect(r.violations.map(x => `${x.id}: ${x.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
