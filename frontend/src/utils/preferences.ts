import { DUST_THRESHOLD_EUR } from './topMovers'

// Preferencias de General (#446). Funciones puras: leen app_config con un valor
// por defecto seguro si falta o no es válido (el backend ya lo valida al guardar).

export const DUST_THRESHOLD_KEY = 'dust_threshold_eur'
export const PRIVACY_ON_START_KEY = 'privacy_on_start'
export const START_PAGE_KEY = 'start_page'

export const START_PAGES = [
  { value: '/', label: 'Dashboard' },
  { value: '/portfolio', label: 'Portfolio' },
  { value: '/fiscal', label: 'Fiscal' },
  { value: '/history', label: 'Historial' },
] as const
export type StartPage = typeof START_PAGES[number]['value']

type Config = Readonly<Record<string, string>> | undefined

/** Umbral de polvo en euros; por defecto, 1 €. */
export function dustThresholdEur(config: Config): number {
  const raw = config?.[DUST_THRESHOLD_KEY]
  if (!raw || !/^\d{1,4}(\.\d{1,2})?$/.test(raw)) return DUST_THRESHOLD_EUR
  const n = Number(raw)
  return n <= 1000 ? n : DUST_THRESHOLD_EUR
}

/** ¿Arrancar con los importes ocultos? */
export function privacyOnStart(config: Config): boolean {
  return config?.[PRIVACY_ON_START_KEY] === 'true'
}

/** Página de inicio; solo las de la lista, nunca una dirección externa. */
export function startPage(config: Config): StartPage {
  const raw = config?.[START_PAGE_KEY]
  return START_PAGES.find(p => p.value === raw)?.value ?? '/'
}
