import { utilityProcess, UtilityProcess, app } from 'electron';
import path from 'path';
import fs from 'fs';

interface BackendOptions {
  databaseUrl: string;
  port?: number;
  onCrash?: (detail: string) => void;
}

export class BackendManager {
  private process: UtilityProcess | null = null;
  private readonly databaseUrl: string;
  private readonly port: number;
  private readonly onCrash?: (detail: string) => void;
  private recentStderr: string[] = [];
  private running = false;

  constructor(opts: BackendOptions) {
    this.databaseUrl = opts.databaseUrl;
    this.port = opts.port ?? 3001;
    this.onCrash = opts.onCrash;
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

    // Redirigir logs del backend al logger de Electron y acumular stderr para errores
    this.process.stdout?.on('data', (d: Buffer) => process.stdout.write(`[backend] ${d}`));
    this.process.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      process.stderr.write(`[backend:err] ${text}`);
      this.recentStderr.push(text);
      if (this.recentStderr.length > 30) this.recentStderr.shift();
    });

    this.process.on('exit', (code) => {
      if (code === 0 || code === null) return;
      console.error(`[backend] Proceso terminó con código ${code}`);
      if (this.running) {
        this.running = false;
        this.onCrash?.(this.buildCrashDetail(code));
      }
    });

    // Esperar a que el backend esté listo (health check)
    await this.waitUntilReady();
    this.running = true;
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

  private buildCrashDetail(code: number): string {
    const stderr = this.recentStderr.join('');

    if (stderr.includes('EADDRINUSE')) {
      return (
        'El puerto 3001 ya está en uso por otro proceso.\n\n' +
        'Causa más probable: el backend de Docker Compose sigue corriendo.\n\n' +
        'Solución: ejecuta "docker compose down" y vuelve a abrir CryptoFolio.'
      );
    }

    if (stderr.includes('password authentication failed') || stderr.includes('ECONNREFUSED')) {
      return 'No se pudo conectar a la base de datos.\n\nIntenta cerrar y volver a abrir la aplicación.';
    }

    const excerpt = stderr.slice(-600).trim();
    return `El backend ha fallado inesperadamente (código ${code}).\n\n${excerpt || 'Sin detalles adicionales.'}`;
  }

  stop(): void {
    this.running = false;
    this.process?.kill();
    this.process = null;
  }
}
