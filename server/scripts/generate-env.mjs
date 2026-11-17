import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('server/.env already exists. It was not changed.');
  process.exit(0);
}

const content = [
  'NODE_ENV=development',
  'PORT=4000',
  'DB_PATH=./data/wfa.db',
  'FRONTEND_ORIGIN=http://localhost:5173',
  `JWT_SECRET=${randomBytes(32).toString('base64url')}`,
  `MFA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
  'ACCESS_TOKEN_MINUTES=10',
  'REFRESH_TOKEN_DAYS=7',
  'COOKIE_SECURE=false',
].join('\n') + '\n';

writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
console.log('Created server/.env with fresh random secrets. Keep this file private and do not commit it.');
