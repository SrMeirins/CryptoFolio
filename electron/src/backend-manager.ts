import { utilityProcess, UtilityProcess } from 'electron';
import path from 'path';
import fs from 'fs';
import { pollUntil } from './shared/poll-until';
import { BACKEND_PORT_BASE } from './shared/ports';

interface BackendOptions {
  databaseUrl: string;
  port?: number;
  onCrash?: (detail: string) => void;
  // Clave AES-256 (base64) para cifrar/descifrar API keys de proveedores
  // on-chain — ver secrets-manager.ts. Opcional: sin ella, el backend sigue
  // funcionando normalmente, solo la verificación de saldos on-chain queda
  // deshabilitada (falla de forma controlada al intentar guardar una key).
  walletSyncEncryptionKey?: string;
}

export class BackendManager {
  private process: UtilityProcess | null = null;
  private readonly databaseUrl: string;
  private readonly port: number;
  private readonly onCrash?: (detail: string) => void;
  private readonly walletSyncEncryptionKey?: string;
  private recentStderr: string[] = [];
  private running = false;

  constructor(opts: BackendOptions) {
    this.databaseUrl = opts.databaseUrl;
    // El llamador (main.ts) resuelve un puerto libre real con findFreePort()
    // antes de construir BackendManager — este fallback solo aplica si
    // alguna vez se instancia sin pasar puerto explícito.
    this.port = opts.port ?? BACKEND_PORT_BASE;
    this.onCrash = opts.onCrash;
    this.walletSyncEncryptionKey = opts.walletSyncEncryptionKey;
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
        ...(this.walletSyncEncryptionKey
          ? { WALLET_SYNC_ENCRYPTION_KEY: this.walletSyncEncryptionKey }
          : {}),
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

    // Detectar si el proceso muere antes de estar listo
    let exitedBeforeReady = false;
    let exitCode: number | null = null;

    this.process.on('exit', (code) => {
      if (!this.running) {
        // El proceso murió antes de confirmar que estaba listo
        exitedBeforeReady = true;
        exitCode = code ?? 1;
        return;
      }
      if (code === 0 || code === null) return;
      console.error(`[backend] Proceso terminó con código ${code}`);
      this.running = false;
      this.onCrash?.(this.buildCrashDetail(code));
    });

    // Esperar a que el backend esté listo (health check)
    await this.waitUntilReady(
      () => exitedBeforeReady,
      () => exitCode,
    );
    this.running = true;
  }

  private async waitUntilReady(
    hasExited: () => boolean,
    getExitCode: () => number | null,
    maxWaitMs = 30_000,
  ): Promise<void> {
    const url = `http://127.0.0.1:${this.port}/health`;

    await pollUntil(
      async () => {
        // Si el proceso ya murió, reportar inmediatamente con los logs de error
        // (condición irrecuperable — no tiene sentido seguir sondeando hasta el timeout).
        if (hasExited()) {
          const stderr = this.recentStderr.join('').trim();
          const code = getExitCode();
          throw new Error(
            `El backend terminó inesperadamente (código ${code}).\n\n` +
            (stderr ? `Error:\n${stderr}` : 'Sin detalles adicionales en los logs.')
          );
        }
        try {
          const res = await fetch(url);
          return res.ok;
        } catch {
          return false; // Aún no está listo
        }
      },
      {
        timeoutMs: maxWaitMs,
        intervalMs: 300,
        timeoutMessage: () => {
          const stderr = this.recentStderr.slice(-5).join('').trim();
          return `El backend no respondió en ${maxWaitMs / 1000}s.\n\n` +
            (stderr ? `Últimos logs:\n${stderr}` : 'Sin salida en stderr.');
        },
      },
    );
  }

  private buildCrashDetail(code: number): string {
    const stderr = this.recentStderr.join('');

    if (stderr.includes('EADDRINUSE')) {
      return (
        `El puerto ${this.port} ya está en uso por otro proceso.\n\n` +
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
