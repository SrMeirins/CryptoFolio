// Zona horaria del sistema para el backend de la app de escritorio (#388): se
// pasa como APP_TIMEZONE salvo que ya venga definida. Solo si es una zona IANA
// conocida; si no, el backend usa la de por defecto (una zona desconocida le
// impediría arrancar).

export function systemTimezoneEnv(env: NodeJS.ProcessEnv, detected: string | undefined): Record<string, string> {
  if (env.APP_TIMEZONE?.trim()) return {};
  if (!detected) return {};
  const known = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  return known.has(detected) ? { APP_TIMEZONE: detected } : {};
}

/** Zona detectada por el motor de Intl del sistema. */
export function detectSystemTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
