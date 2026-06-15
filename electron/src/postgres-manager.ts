import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { Client } from 'pg';

const CONFIG_FILE = 'electron-db.json';

interface DbConfig {
  password: string;
  port: number;
}

export class PostgresManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pg: any = null;
  private config!: DbConfig;
  private dataDir: string;
  private configPath: string;

  readonly user = 'cryptotracker';
  readonly database = 'cryptotracker';

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'pgdata');
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);
  }

  get connectionString(): string {
    return `postgresql://${this.user}:${this.config.password}@127.0.0.1:${this.config.port}/${this.database}`;
  }

  private loadOrCreateConfig(): DbConfig {
    if (fs.existsSync(this.configPath)) {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as DbConfig;
    }
    const config: DbConfig = {
      password: crypto.randomBytes(24).toString('hex'),
      port: 54321,
    };
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    return config;
  }

  // Comprueba si un proceso con ese PID sigue vivo.
  private isProcessRunning(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
          stdio: 'pipe', encoding: 'utf8', timeout: 2000,
        });
        return out.includes(String(pid));
      }
      // Unix: kill(pid, 0) no mata el proceso, solo comprueba que existe
      process.kill(pid, 0);
      return true;
    } catch (e) {
      // EPERM = existe pero no tenemos permisos para señalarlo → sigue vivo
      return (e as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  // En Windows, mata cualquier proceso que esté escuchando en nuestro puerto.
  // Necesario cuando la app se cierra de forma abrupta (crash, kill) y postgres
  // queda como proceso huérfano manteniendo el bloque de memoria compartida abierto.
  private async killStalePostgresOnPort(): Promise<void> {
    if (process.platform !== 'win32') return;
    try {
      const out = execSync(
        `netstat -ano | findstr ":${this.config.port} "`,
        { stdio: 'pipe', encoding: 'utf8', timeout: 3000 }
      );
      const pids = new Set<string>();
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      if (pids.size === 0) return;
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe', timeout: 2000 });
          console.warn(`[postgres] Proceso PID ${pid} (puerto ${this.config.port}) terminado`);
        } catch { /* ya no existe */ }
      }
      // Dar tiempo al SO para liberar los recursos (handles, shared memory)
      await new Promise(r => setTimeout(r, 1500));
    } catch { /* netstat no encontró nada — situación normal */ }
  }

  // Limpia postmaster.pid si el proceso anotado ya no existe.
  // Evita el error "pre-existing shared memory block" tras un cierre abrupto.
  private cleanStalePostmasterPid(): boolean {
    const pidFile = path.join(this.dataDir, 'postmaster.pid');
    if (!fs.existsSync(pidFile)) return false;

    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim().split('\n')[0], 10);
      if (!isNaN(pid) && this.isProcessRunning(pid)) {
        console.warn(`[postgres] Proceso PID ${pid} sigue activo — no limpiamos el PID file`);
        return false;
      }
      console.warn(`[postgres] Eliminando postmaster.pid obsoleto (PID ${pid} ya no existe)`);
      fs.unlinkSync(pidFile);
      return true;
    } catch {
      return false;
    }
  }

  // Consulta la codificación del clúster arrancado via template1
  private async getClusterEncoding(): Promise<string> {
    const client = new Client({
      host: '127.0.0.1',
      port: this.config.port,
      user: this.user,
      password: this.config.password,
      database: 'template1',
    });
    try {
      await client.connect();
      const res = await client.query('SHOW server_encoding');
      return (res.rows[0]?.server_encoding ?? '').toUpperCase();
    } catch {
      return 'UTF8';
    } finally {
      try { await client.end(); } catch { /* ignorar */ }
    }
  }

  async start(): Promise<void> {
    this.config = this.loadOrCreateConfig();

    const { default: EmbeddedPostgres } = await import('embedded-postgres');

    // Capturar stderr de PostgreSQL para diagnóstico cuando lanza null/undefined
    const pgStderr: string[] = [];

    this.pg = new EmbeddedPostgres({
      databaseDir: this.dataDir,
      user:        this.user,
      password:    this.config.password,
      port:        this.config.port,
      persistent:  true,
      // UTF-8 forzado — sin esto Windows usa WIN1252 según el locale regional
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onError: (msg) => {
        const str = String(msg ?? '');
        if (str) pgStderr.push(str);
        process.stderr.write(`[postgres] ${str}\n`);
      },
    });

    // Clúster a medias (directorio existe pero sin PG_VERSION) → limpiar
    const pgVersion = path.join(this.dataDir, 'PG_VERSION');
    const clusterExists = fs.existsSync(pgVersion);

    if (fs.existsSync(this.dataDir) && !clusterExists) {
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    }

    if (!clusterExists) {
      await this.pg.initialise();
      await this.startWithRecovery(pgStderr);
      await this.pg.createDatabase(this.database);
      return;
    }

    // Limpiar PID obsoleto y procesos huérfanos antes de intentar arrancar
    this.cleanStalePostmasterPid();
    await this.killStalePostgresOnPort();

    await this.startWithRecovery(pgStderr);

    // Verificar codificación — re-inicializar si no es UTF-8
    const encoding = await this.getClusterEncoding();
    if (encoding !== 'UTF8') {
      console.warn(`[postgres] Codificación ${encoding} detectada. Re-inicializando con UTF-8...`);
      await this.pg.stop();
      fs.rmSync(this.dataDir, { recursive: true, force: true });
      await this.pg.initialise();
      await this.startWithRecovery(pgStderr);
      await this.pg.createDatabase(this.database);
    }
  }

  // Intenta pg.start(); si falla con "shared memory" limpia y reintenta una vez.
  private async startWithRecovery(pgStderr: string[]): Promise<void> {
    try {
      await this.pg.start();
    } catch (raw) {
      const stderr = pgStderr.join('\n');

      // Shared memory huérfana → limpiar PID y reintentar
      if (stderr.includes('shared memory') || stderr.includes('postmaster.pid')) {
        console.warn('[postgres] Memoria compartida huérfana detectada. Limpiando y reintentando...');
        this.cleanStalePostmasterPid();
        await this.killStalePostgresOnPort();
        pgStderr.length = 0;

        try {
          await this.pg.start();
          return;
        } catch (raw2) {
          const stderr2 = pgStderr.join('\n');
          throw this.buildStartError(raw2, stderr2);
        }
      }

      throw this.buildStartError(raw, stderr);
    }
  }

  private buildStartError(raw: unknown, stderr: string): Error {
    if (stderr.includes('administrative') || stderr.includes('unprivileged')) {
      return new Error(
        'PostgreSQL no puede arrancar con permisos de Administrador elevados (UAC).\n\n' +
        'Cierra la aplicación y ábrela sin "Ejecutar como administrador".'
      );
    }
    if (stderr.includes('shared memory')) {
      return new Error(
        'PostgreSQL no pudo arrancar: hay un bloqueo de memoria compartida de una sesión anterior.\n\n' +
        'Cierra CryptoFolio, espera unos segundos y vuelve a abrirlo. ' +
        'Si el problema persiste, reinicia el ordenador.'
      );
    }
    const base = raw instanceof Error ? raw.message : String(raw ?? '');
    return new Error(base || (stderr ? `Error al iniciar PostgreSQL:\n${stderr}` : 'Error desconocido al iniciar PostgreSQL'));
  }

  async stop(): Promise<void> {
    try {
      await this.pg?.stop();
    } catch {
      // Ignorar errores al cerrar
    }
  }
}
