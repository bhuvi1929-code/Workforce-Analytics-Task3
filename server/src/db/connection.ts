
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Db = DatabaseSync;

interface Migration {
  version: number;
  name: string;
  file: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    name: 'auth_rbac',
    file: './migrations/002_auth_rbac.sql',
  },
  {
    version: 3,
    name: 'rbac_permissions',
    file: './migrations/003_rbac_permissions.sql',
  },

  {
    version: 4,
    name: 'user_department',
    file: './migrations/004_user_department.sql',
  },
  {
    version: 5,
    name: 'employee_self_dashboard',
    file: './migrations/005_employee_self_dashboard.sql',
  },
  {
    version: 6,
    name: 'mfa_replay_protection',
    file: './migrations/006_mfa_replay_protection.sql',
  },

];

function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  for (const migration of MIGRATIONS) {
    const applied = db
      .prepare('SELECT version FROM schema_migrations WHERE version = ?')
      .get(migration.version) as { version: number } | undefined;

    if (applied) {
      continue;
    }

    const sql = readFileSync(
      new URL(migration.file, import.meta.url),
      'utf8'
    );

    db.exec('BEGIN IMMEDIATE');

    try {
      db.exec(sql);

      db.prepare(`
        INSERT INTO schema_migrations (version)
        VALUES (?)
      `).run(migration.version);

      db.exec('COMMIT');

      console.log(
        `Database migration ${migration.version}_${migration.name} applied successfully.`
      );
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Opens and migrates a SQLite database. Use ':memory:' for tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);

  try {
    db.exec('PRAGMA foreign_keys = ON;');

    if (file !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL;');
    }

    db.exec(
      readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
    );

    runMigrations(db);

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
