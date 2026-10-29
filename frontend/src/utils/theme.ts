// Preferencia de tema (#197). La fuente de verdad es la clave `theme` de
// app_config; localStorage guarda el tema efectivo para que
// public/theme-init.js lo aplique antes del primer pintado, sin destello.

export type ThemePreference = 'dark' | 'light' | 'system'
export type EffectiveTheme = 'dark' | 'light'

export const THEME_CONFIG_KEY = 'theme'
export const THEME_STORAGE_KEY = 'cflio_theme_effective'
export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system']

/** Nombre visible de cada preferencia de tema. */
export const THEME_LABELS: Record<ThemePreference, string> = { dark: 'Oscuro', light: 'Claro', system: 'Sistema' }

/** Valor guardado → preferencia válida; cualquier otro valor cae en oscuro. */
export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === 'light' || raw === 'system' ? raw : 'dark'
}

/** Tema que se ve según la preferencia y el tema del sistema operativo. */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): EffectiveTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light'
  return pref
}

/** El toggle de la barra superior fija siempre el contrario del tema que se ve. */
export function toggleTarget(effective: EffectiveTheme): ThemePreference {
  return effective === 'dark' ? 'light' : 'dark'
}

export function writeStoredTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: EffectiveTheme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Almacenamiento bloqueado: el tema se aplica igual al cargar la config.
  }
}
