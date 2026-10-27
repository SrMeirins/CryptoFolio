import path from 'path';
import { describe, expect, it } from 'vitest';
import { backendEntryPath } from './backend-entry';

// Ruta del backend (#396): en desarrollo apunta a backend/dist del propio repo
// (antes salía del repositorio y «npm run dev» no encontraba el backend).
describe('backendEntryPath (#396)', () => {
  const repo = path.resolve(__dirname, '../../..');
  const compiled = path.join(repo, 'electron', 'compiled');

  it('en desarrollo, backend/dist/index.js dentro del repo', () => {
    const entry = backendEntryPath(true, compiled, '/no-usado');
    expect(entry).toBe(path.join(repo, 'backend', 'dist', 'index.js'));
    expect(path.relative(repo, entry).startsWith('..')).toBe(false);
  });

  it('en producción, el backend empaquetado en resources', () => {
    expect(backendEntryPath(false, compiled, '/opt/app/resources')).toBe(path.join('/opt/app/resources', 'backend', 'dist', 'index.js'));
  });
});
