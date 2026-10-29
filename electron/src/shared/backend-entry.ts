import path from 'path';

// Entry point del backend compilado (#396). En desarrollo se usa el del repo:
// `compiledDir` es electron/compiled (donde corre el proceso main), así que la
// raíz del repo queda dos niveles arriba. En producción, electron-builder
// copia el backend a extraResources.

export function backendEntryPath(isDev: boolean, compiledDir: string, resourcesPath: string): string {
  if (isDev) return path.join(compiledDir, '../../backend/dist/index.js');
  return path.join(resourcesPath, 'backend', 'dist', 'index.js');
}
