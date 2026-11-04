// Enlaces que salen de la app (#471): solo http y https, que abren el
// navegador. Cualquier otro esquema (file:, smb:, javascript:, los de
// aplicaciones locales) podría abrir ficheros o lanzar programas, así que se
// bloquea. Tampoco se admiten credenciales en la URL (user:pass@host).

const ALLOWED = new Set(['http:', 'https:']);

export function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return ALLOWED.has(url.protocol) && url.username === '' && url.password === '' && url.hostname !== '';
}

/** Abre la URL fuera de la app si es segura. Devuelve si la abrió. */
export function openExternalSafely(raw: string, open: (url: string) => Promise<void>, log: (msg: string) => void = console.warn): boolean {
  if (!isSafeExternalUrl(raw)) {
    // Sin la URL: puede llevar direcciones u otros datos.
    let scheme = 'inválida';
    try { scheme = new URL(raw).protocol; } catch { /* se queda en inválida */ }
    log(`[externo] enlace bloqueado (esquema ${scheme})`);
    return false;
  }
  open(raw).catch(() => log('[externo] no se pudo abrir el enlace'));
  return true;
}
