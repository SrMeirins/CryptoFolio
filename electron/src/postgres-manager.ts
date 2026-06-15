import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';

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

  private isWindowsAdmin(): boolean {
    if (process.platform !== 'win32') return false;
    try {
      // HKLM\SECURITY solo es legible como Administrador con UAC elevado
      execSync('reg query HKLM\\SECURITY', { stdio: 'pipe', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.isWindowsAdmin()) {
      throw new Error(
        'CryptoFolio no puede iniciarse con permisos de Administrador.\n\n' +
        'PostgreSQL rechaza ejecutarse con privilegios elevados por seguridad.\n\n' +
        'Solución: cierra la aplicación y ábrela sin "Ejecutar como administrador".\n' +
        'La instalación por usuario (sin admin) funciona correctamente.'
      );
    }

    this.config = this.loadOrCreateConfig();

    // Import dinámico porque embedded-postgres es un ES module puro
    const { default: EmbeddedPostgres } = await import('embedded-postgres');

    this.pg = new EmbeddedPostgres({
      databaseDir: this.dataDir,
      user: this.user,
      password: this.config.password,
      port: this.config.port,
      persistent: true,
    });

    // PG_VERSION existe solo en clusters correctamente inicializados.
    // Si el directorio existe pero falta PG_VERSION, el arranque anterior
    // falló a medias (p.ej. error de asar) — limpiamos y re-inicializamos.
    const pgVersion = path.join(this.dataDir, 'PG_VERSION');
    const clusterExists = fs.existsSync(pgVersion);

    if (fs.existsSync(this.dataDir) && !clusterExists) {
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    }

    if (!clusterExists) {
      await this.pg.initialise();
      await this.pg.start();
      await this.pg.createDatabase(this.database);
    } else {
      await this.pg.start();
    }
  }

  async stop(): Promise<void> {
    try {
      await this.pg?.stop();
    } catch {
      // Ignorar errores al cerrar
    }
  }
}
