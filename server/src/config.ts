
import 'dotenv/config';
import path from 'node:path';

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters.`);
  }
  return value;
}

function requiredHexKey(name: string): string {
  const value = process.env[name] ?? '';
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${name} must be exactly 64 hexadecimal characters (32 bytes).`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('Invalid NODE_ENV configuration.');
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'data/wfa.db'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',

  jwtSecret: requiredSecret('JWT_SECRET'),
  mfaEncryptionKey: requiredHexKey('MFA_ENCRYPTION_KEY'),

  accessTokenMinutes: Number(process.env.ACCESS_TOKEN_MINUTES ?? 10),
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 7),

  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
