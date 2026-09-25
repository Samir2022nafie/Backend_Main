import { EnvConfig } from './env.schema';

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  environment: process.env.ENVIRONMENT || process.env.NODE_ENV || 'dev',
  database: {
    url: process.env.DATABASE_URL,
  },
  encryption: {
    secret: process.env.ENCRYPTION_SECRET || 'nexus-default-secret-dev',
  },
  bot: {
    webhookSecret: process.env.BOT_WEBHOOK_SECRET,
  },
});
