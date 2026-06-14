import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

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

  async start(): Promise<void> {
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
