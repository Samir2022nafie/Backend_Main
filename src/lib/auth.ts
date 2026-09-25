/**
 * Better Auth Instance — Central auth engine configuration.
 *
 * This is the core Better Auth setup that handles:
 * - Password hashing & comparison (via emailAndPassword)
 * - Session token lifecycle (create, validate, revoke)
 * - Phone OTP generation & validation (via phoneNumber plugin)
 * - Username-based login (via username plugin)
 * - Password reset token generation & validation
 *
 * Uses a custom Prisma adapter (better-auth-adapter.ts) to bridge
 * our snake_case schema with Better Auth's camelCase expectations.
 */
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { phoneNumber } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { createNexusPrismaAdapter } from './better-auth-adapter';

// Standalone Prisma client for Better Auth (separate from NestJS DI)
const prisma = new PrismaClient();

export const auth: any = betterAuth({
  database: createNexusPrismaAdapter(prisma) as any,
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3000}`,
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url, token }) => {
      // In dev: log to console. In production: wire up an email provider.
      const resetUrl = `${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3001'}/reset-password?token=${token}`;
      console.log(`🔑 [PASSWORD RESET] User: ${user.email} | Link: ${resetUrl}`);
      // TODO: Wire up email provider (SendGrid, Resend, AWS SES, etc.)
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        // This callback is invoked by Better Auth's phone plugin.
        // In our architecture, we override this in AuthService to use our ISmsService.
        console.log(`📱 [BETTER AUTH OTP] Code ${code} → ${phone}`);
      },
      phoneNumberValidator: (phoneNumber: string) => {
        // E.164 compatible or standard international format
        return /^\+?[1-9]\d{6,14}$/.test(phoneNumber);
      },
    }),
  ],
  user: {
    modelName: 'user',
    additionalFields: {
      username: {
        type: 'string',
        required: true,
        unique: true,
        input: true,
      },
      firstName: {
        type: 'string',
        required: true,
        input: true,
        fieldName: 'first_name',
      },
      lastName: {
        type: 'string',
        required: true,
        input: true,
        fieldName: 'last_name',
      },
      birthDate: {
        type: 'date',
        required: true,
        input: true,
        fieldName: 'birth_date',
      },
    },
  },
  session: {
    modelName: 'session',
    expiresIn: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update session age every 24 hours
  },
  account: {
    modelName: 'account',
    accountLinking: {
      enabled: true,
    },
  },
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8081',
    'exp://localhost:8081',
  ],
});

export type BetterAuthInstance = typeof auth;
