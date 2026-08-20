import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(65535)),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL string' }),
  JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET must be at least 32 characters' }),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
});

const envParse = envSchema.safeParse(process.env);

if (!envParse.success) {
  console.error('❌ Configuration validation failed:');
  console.error(JSON.stringify(envParse.error.format(), null, 2));
  process.exit(1);
}

const { NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } =
  envParse.data;

const parseDurationToMs = (value) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid duration format "${value}" (expected e.g. 15m, 1h, 30d)`);
  }
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Number(match[1]) * unitMs;
};

export default {
  port: PORT,
  env: {
    isDev: NODE_ENV === 'development',
    isProd: NODE_ENV === 'production',
  },
  db: {
    url: DATABASE_URL,
  },
  jwt: {
    secret: JWT_SECRET,
    accessExpiresIn: JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
    refreshTokenLifetimeMs: parseDurationToMs(JWT_REFRESH_EXPIRES_IN),
  },
};
