import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Guardián (#388): la zona de la aplicación es configurable, así que la cadena
// 'Europe/Madrid' solo puede aparecer en su constante por defecto. Se buscan
// cadenas exactas (no comentarios que describen el comportamiento) y las
// migraciones SQL históricas no se revisan (describen el pasado).
const SRC = path.join(__dirname, '..', '..');
const ALLOWED = new Set([path.join('modules', 'time', 'appTimezone.ts')]);

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : tsFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('sin zona horaria fija en el backend (#388)', () => {
  it("'Europe/Madrid' solo está en la constante por defecto", () => {
    const offenders = tsFiles(SRC)
      .filter(f => !ALLOWED.has(path.relative(SRC, f)))
      .filter(f => /(['"`])Europe\/Madrid\1/.test(readFileSync(f, 'utf8')))
      .map(f => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
