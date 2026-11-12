import type { QueryClient } from '@tanstack/react-query'

/** Lo que depende de las entidades y de la marca del 721 (#545): se vuelve a pedir. */
export function invalidar721(qc: QueryClient) {
  for (const queryKey of [['fiscal-721'], ['fiscal-calendario'], ['fiscal-declaraciones'], ['fiscal-summary'], ['fiscal-custodia']]) {
    void qc.invalidateQueries({ queryKey })
  }
}
