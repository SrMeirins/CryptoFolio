import { describe, expect, it, vi } from 'vitest';
import { isSafeExternalUrl, openExternalSafely } from './external-url';

// Enlaces externos (#471): solo http y https, sin credenciales.
describe('isSafeExternalUrl', () => {
  it('admite http y https', () => {
    expect(isSafeExternalUrl('https://etherscan.io/address/0xSINTETICA')).toBe(true);
    expect(isSafeExternalUrl('http://explorador.local:8080/tx/abc')).toBe(true);
  });

  it('bloquea otros esquemas, URLs inválidas y credenciales', () => {
    for (const url of [
      'file:///etc/passwd', 'javascript:alert(1)', 'smb://servidor/recurso', 'ms-settings:privacy',
      'data:text/html,<b>x</b>', 'vbscript:msgbox', 'no es una url', '', 'https://user:pass@ejemplo.com/',
    ]) expect(isSafeExternalUrl(url), url).toBe(false);
  });
});

describe('openExternalSafely', () => {
  it('abre las seguras y registra las bloqueadas sin la URL completa', () => {
    const open = vi.fn(() => Promise.resolve());
    const log = vi.fn();
    expect(openExternalSafely('https://ejemplo.com/a', open, log)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://ejemplo.com/a');
    expect(openExternalSafely('file:///home/usuario/secreto.txt', open, log)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[externo] enlace bloqueado (esquema file:)');
    expect(log.mock.calls.flat().join(' ')).not.toContain('secreto');
  });
});
