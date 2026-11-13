import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

// axe sobre la pantalla asentada. Las tarjetas y paneles entran con un fundido
// escalonado; en CI, con el runner cargado, axe llegaba a medir el contraste a
// mitad del fundido (colores intermedios) y daba falsos fallos. Antes de
// analizar se espera a que terminen las animaciones y transiciones finitas; las
// infinitas (esqueletos, barras de carga) no se esperan porque no acaban.

const ESPERA_MAXIMA_MS = 5_000

/** Espera a que no quede ninguna animación finita en marcha (o hasta 5 s; después axe analiza igual). */
export async function esperarSinAnimaciones(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every(a => {
    if (a.playState !== 'running') return true
    const iteraciones = a.effect?.getComputedTiming().iterations
    return iteraciones === Infinity
  }), undefined, { timeout: ESPERA_MAXIMA_MS }).catch(() => {
    // Si alguna animación no termina a tiempo, se analiza tal cual: un fallo
    // de contraste real seguirá saliendo.
  })
}

/** AxeBuilder de la página, creado cuando ya no hay animaciones en marcha. */
export async function axeEstable(page: Page): Promise<AxeBuilder> {
  await esperarSinAnimaciones(page)
  return new AxeBuilder({ page })
}
