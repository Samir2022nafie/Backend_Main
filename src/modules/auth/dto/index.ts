import { z } from 'zod';
import { APP_CONSTANTS } from '@/core/common/constants';

// Calculate maximum birth date for age >= 13
function getMaxBirthDate(): Date {
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - APP_CONSTANTS.MIN_USER_AGE);
  return maxDate;
}

// Phone regex (E.164 compatible or standard international format)
export const phoneRegex = /^\+?[1-9]\d{6,14}$/;

// Username regex (alphanumeric and underscore, 3-30 chars)
export const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

// --- REGISTER DTO ---
export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(usernameRegex, 'Username may only contain letters, numbers, and underscores'),
    email: z
      .string()
      .trim()
      .email('Invalid email address')
      .max(255)
      .optional()
      .or(z.literal('')),
    phoneNumber: z
      .string()
      .trim()
      .regex(phoneRegex, 'Invalid phone number format')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password too long'),
    firstName: z
      .string()
      .trim()
      .min(1, 'First name is required')
      .max(50, 'First name cannot exceed 50 characters'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Last name is required')
      .max(50, 'Last name cannot exceed 50 characters'),
    birthDate: z.coerce.date().refine((date) => {
      return date <= getMaxBirthDate();
    }, {
      message: `User must be at least ${APP_CONSTANTS.MIN_USER_AGE} years old`,
    }),
  })
  .refine(
    (data) => {
      const hasEmail = Boolean(data.email && data.email.length > 0);
      const hasPhone = Boolean(data.phoneNumber && data.phoneNumber.length > 0);
      return hasEmail || hasPhone;
    },
    {
      message: 'At least one of email or phoneNumber must be provided',
      path: ['email'],
    },
  );

export type RegisterDto = z.infer<typeof registerSchema>;

// --- LOGIN DTO ---
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or phone number is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

// --- VERIFY PHONE DTO ---
export const verifyPhoneSchema = z.object({
  phoneNumber: z.string().trim().regex(phoneRegex, 'Invalid phone number format'),
});

export type VerifyPhoneDto = z.infer<typeof verifyPhoneSchema>;

// --- CONFIRM PHONE DTO ---
export const confirmPhoneSchema = z.object({
  phoneNumber: z.string().trim().regex(phoneRegex, 'Invalid phone number format'),
  otp: z.string().trim().min(4).max(10, 'Invalid OTP code'),
});

export type ConfirmPhoneDto = z.infer<typeof confirmPhoneSchema>;

// --- OAUTH DTO ---
export const oauthProviderSchema = z.enum(['google', 'apple', 'telegram']);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

export const telegramWidgetSchema = z.object({
  id: z.coerce.string(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.coerce.number(),
  hash: z.string(),
});

export const oauthLoginSchema = z.object({
  email: z.string().email().optional(),
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  telegram: telegramWidgetSchema.optional(),
  birthDate: z.coerce.date().optional(),
});

export type OAuthLoginDto = z.infer<typeof oauthLoginSchema>;

// --- LINK EXTERNAL DTO ---
export const linkExternalSchema = z.object({
  provider: oauthProviderSchema,
  idToken: z.string().optional(),
  telegram: telegramWidgetSchema.optional(),
});

export type LinkExternalDto = z.infer<typeof linkExternalSchema>;
