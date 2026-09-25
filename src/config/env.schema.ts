import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'dev']).default('development'),
  ENVIRONMENT: z.string().optional().default('dev'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENCRYPTION_SECRET: z.string().optional().default('nexus-default-secret-dev'),
  NEXT_PUBLIC_API_URL: z.string().optional().default('http://localhost:3000'),
  BOT_WEBHOOK_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    throw new Error('Invalid environment variables configuration');
  }
  return parsed.data;
}
