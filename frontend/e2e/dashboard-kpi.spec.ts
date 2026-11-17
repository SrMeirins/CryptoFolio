import { expect, test, type Page } from '@playwright/test'
import { axeEstable } from './axe'

// Tarjetas KPI del Dashboard (#507): las cinco con los tres huecos (cifra,
// chip y mini gráfica) alineados, rejilla de 5, 3 + 2 y 2 + 2 + 1 según el
// ancho, sin huecos al final, y con la privacidad ningún importe visible.
// Solo lectura.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function tarjetas(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const grupo = page.getByTestId('kpi-cards')
  await grupo.waitFor({ timeout: 15_000 })
  const cards = grupo.locator('.stat-card')
  await expect(cards.first()).toBeVisible()
  // La quinta (EUR neto) llega con el flujo de euros: se espera antes de decidir.
  const cinco = await expect(cards).toHaveCount(5, { timeout: 15_000 }).then(() => true, () => false)
  test.skip(!cinco, 'Sin flujo de euros en estos datos: solo cuatro tarjetas')
  // Esperar a que terminen de cargar (sin esqueletos).
  await expect(grupo.locator('.skeleton')).toHaveCount(0, { timeout: 15_000 })
  return { grupo, cards }
}

/** Filas de la rejilla: tarjetas agrupadas por su posición vertical. */
async function filas(cards: ReturnType<Page['locator']>) {
  const cajas = await cards.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: r.left, right: r.right, height: r.height } }))
  const porFila = new Map<number, typeof cajas>()
  for (const c of cajas) porFila.set(c.top, [...(porFila.get(c.top) ?? []), c])
  return [...porFila.values()]
}

for (const [ancho, esperado] of [[1920, [5]], [1280, [3, 2]], [700, [2, 2, 1]]] as const) {
  test(`rejilla a ${ancho} px: ${esperado.join(' + ')}, sin huecos y con la misma altura`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 1000 })
    const { grupo, cards } = await tarjetas(page)
    const f = await filas(cards)
    expect(f.map(x => x.length)).toEqual([...esperado])
    const ancho_ = (await grupo.boundingBox())!.width
    for (const fila of f) {
      // La fila ocupa todo el ancho (las de la última fila se estiran).
      const ocupado = Math.max(...fila.map(c => c.right)) - Math.min(...fila.map(c => c.left))
      expect(ocupado).toBeGreaterThan(ancho_ - 2)
      // Misma altura en la fila.
      expect(Math.max(...fila.map(c => c.height)) - Math.min(...fila.map(c => c.height))).toBeLessThan(1)
    }
    // Huecos alineados: la cifra de todas las tarjetas a la misma altura en cada fila.
    const cifras = await cards.locator('.mono.text-xl, .skeleton').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)))
    const tops = await cards.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)))
    const relativos = cifras.map((t, i) => t - tops[i])
    expect(new Set(relativos).size).toBe(1)
  })
}

test('con la privacidad, ningún importe visible en tarjetas ni chips', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cryptofolio.privacy', '1'))
  await page.setViewportSize({ width: 1920, height: 1000 })
  const { grupo } = await tarjetas(page)
  const texto = await grupo.innerText()
  // Ningún importe con cifras y símbolo de moneda; sí los porcentajes.
  expect(texto).not.toMatch(/\d[\d.,]*\s?[€$]/)
  expect(texto).toContain('••••')
})

for (const theme of ['dark', 'light'] as const) {
  test(`tarjetas KPI sin violaciones de axe (tema ${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 1000 })
    await tarjetas(page)
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await page.mouse.move(0, 0)
    const { violations } = await (await axeEstable(page)).include('[data-testid="kpi-cards"]').withTags(WCAG).analyze()
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
