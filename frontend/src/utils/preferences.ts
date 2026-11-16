import { DUST_THRESHOLD_EUR } from './topMovers'

// Preferencias de General (#446). Funciones puras: leen app_config con un valor
// por defecto seguro si falta o no es válido (el backend ya lo valida al guardar).

export const DUST_THRESHOLD_KEY = 'dust_threshold_eur'
export const PRIVACY_ON_START_KEY = 'privacy_on_start'
export const START_PAGE_KEY = 'start_page'
export const CONCENTRACION_KEY = 'concentracion_aviso_pct'
export const CONCENTRACION_DEFECTO = 40
export const WALLETS_OTRAS_KEY = 'wallets_otras_pct'
export const WALLETS_OTRAS_DEFECTO = 2

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

/** Peso de la mayor posición a partir del cual se avisa de concentración (#525); por defecto, 40 %. */
export function concentracionAvisoPct(config: Config): number {
  const raw = config?.[CONCENTRACION_KEY]
  const n = raw && /^\d{2,3}$/.test(raw) ? Number(raw) : Number.NaN
  return n >= 10 && n <= 100 ? n : CONCENTRACION_DEFECTO
}

/** Peso por debajo del cual una wallet va a «Otras» en Portfolio (#526); 0 nunca, por defecto 2 %. */
export function walletsOtrasPct(config: Config): number {
  const raw = config?.[WALLETS_OTRAS_KEY]
  const n = raw && /^\d{1,2}$/.test(raw) ? Number(raw) : Number.NaN
  return n >= 0 && n <= 20 ? n : WALLETS_OTRAS_DEFECTO
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
