
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./server/data/wfa.db');

try {
  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all();

  console.log('\nDATABASE TABLES:\n');
  console.table(tables);

  const migration = db.prepare(`
    SELECT * FROM schema_migrations
  `).all();

  console.log('\nAPPLIED MIGRATIONS:\n');
  console.table(migration);

} catch (error) {
  console.error('Database verification failed:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
