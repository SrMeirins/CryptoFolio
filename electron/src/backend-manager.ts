import { utilityProcess, UtilityProcess, app } from 'electron';
import path from 'path';
import fs from 'fs';

interface BackendOptions {
  databaseUrl: string;
  port?: number;
}

export class BackendManager {
  private process: UtilityProcess | null = null;
  private readonly databaseUrl: string;
  private readonly port: number;

  constructor(opts: BackendOptions) {
    this.databaseUrl = opts.databaseUrl;
    this.port = opts.port ?? 3001;
  }

  /** Ruta al entry point del backend compilado */
  private get entryPath(): string {
    if (process.env.NODE_ENV === 'development') {
      return path.join(__dirname, '../../../backend/dist/index.js');
    }
    // En producción, electron-builder copia el backend a extraResources
    return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
  }

  async start(): Promise<void> {
    const entry = this.entryPath;

    if (!fs.existsSync(entry)) {
      throw new Error(`Backend no encontrado en: ${entry}\nEjecuta 'npm run build:backend' primero.`);
    }

    this.process = utilityProcess.fork(entry, [], {
      env: {
        ...process.env,
        DATABASE_URL: this.databaseUrl,
        BACKEND_PORT: String(this.port),
        NODE_ENV: 'production',
        ELECTRON_MODE: 'true',
        // El backend solo escucha en localhost — nunca en 0.0.0.0
        BACKEND_HOST: '127.0.0.1',
      },
      stdio: 'pipe',
    });

    // Redirigir logs del backend al logger de Electron
    this.process.stdout?.on('data', (d: Buffer) => process.stdout.write(`[backend] ${d}`));
    this.process.stderr?.on('data', (d: Buffer) => process.stderr.write(`[backend:err] ${d}`));

    this.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[backend] Proceso terminó con código ${code}`);
      }
    });

    // Esperar a que el backend esté listo (health check)
    await this.waitUntilReady();
  }

  private async waitUntilReady(maxWaitMs = 15_000): Promise<void> {
    const url = `http://127.0.0.1:${this.port}/health`;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        // Aún no está listo
      }
      await new Promise(r => setTimeout(r, 300));
    }

    throw new Error(`El backend no respondió en ${maxWaitMs / 1000}s. Comprueba los logs.`);
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }
}
