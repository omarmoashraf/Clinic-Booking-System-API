import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  PORT: z
    .string()
    .default('3000')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(65535)),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL string' }),
});

const envParse = envSchema.safeParse(process.env);

if (!envParse.success) {
  console.error('❌ Configuration validation failed:');
  console.error(JSON.stringify(envParse.error.format(), null, 2));
  process.exit(1);
}

const { PORT, DATABASE_URL } = envParse.data;

export default {
  port: PORT,
  db: {
    url: DATABASE_URL,
  },
};
