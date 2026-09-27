import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test', 'dev']).default('development'),
    ENVIRONMENT: z.string().optional().default('dev'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    ENCRYPTION_SECRET: z.string().optional().default('nexus-default-secret-dev'),
    NEXT_PUBLIC_API_URL: z.string().optional().default('http://localhost:3000'),
    BOT_WEBHOOK_SECRET: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.string().optional(),
    ADMIN_DASHBOARD_URL: z.string().optional(),
    AFROMESSAGE_TOKEN: z.string().optional(),
    AFROMESSAGE_SENDER: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
  })
  .passthrough();

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    throw new Error('Invalid environment variables configuration');
  }
  return parsed.data;
}
