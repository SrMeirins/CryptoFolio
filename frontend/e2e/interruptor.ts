import type { Locator } from '@playwright/test'

/**
 * Pulsa un interruptor como lo haría una persona: sobre su etiqueta visible.
 * El input real es `sr-only` (1 px recortado): forzar el clic sobre él depende
 * de qué haya en ese píxel y fallaba de forma intermitente.
 */
export async function pulsarInterruptor(sw: Locator): Promise<void> {
  await sw.locator('xpath=ancestor::label[1]').click()
}
