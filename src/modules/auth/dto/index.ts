import { z } from 'zod';
import { APP_CONSTANTS } from '@/core/common/constants';
import { normalizePhone, looksLikePhone } from '@/core/utils/phone.util';

// Calculate maximum birth date for age >= 13
function getMaxBirthDate(): Date {
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - APP_CONSTANTS.MIN_USER_AGE);
  return maxDate;
}

/**
 * Relaxed phone regex — accepts Ethiopian local formats, international E.164, etc.
 * Examples: 0911223344, 911223344, +251911223344, 251911223344, 2510911223344
 */
export const phoneRegex = /^(\+?\d{7,15}|0\d{9})$/;

// Username regex (alphanumeric and underscore, 3-30 chars)
export const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

/** Re-export for use in auth.service */
export { normalizePhone, looksLikePhone };

/**
 * Zod schema that accepts a raw phone string, validates it,
 * and transforms it to normalised E.164 format.
 */
const phoneField = z
  .string()
  .trim()
  .refine((val) => {
    const normalised = normalizePhone(val);
    return Boolean(normalised);
  }, { message: 'Invalid phone number format or length. Please check the number of digits.' })
  .transform((val) => {
    const normalised = normalizePhone(val);
    if (!normalised) throw new Error('Unable to normalise phone number');
    return normalised;
  });

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
    phoneNumber: phoneField.optional().or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password too long'),
    otp: z.string().trim().length(6, 'OTP must be 6 digits').optional(),
    firstName: z
      .string()
      .trim()
      .min(1, 'First name is required')
      .max(50, 'First name cannot exceed 50 characters'),
    lastName: z
      .string()
      .trim()
      .max(50, 'Last name cannot exceed 50 characters')
      .optional()
      .or(z.literal('')),
    birthDate: z.coerce.date().refine((date) => {
      return date <= getMaxBirthDate();
    }, {
      message: `User must be at least ${APP_CONSTANTS.MIN_USER_AGE} years old`,
    }),
    locationId: z.string().uuid().optional().nullable(),
    locationName: z.string().trim().max(255).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    isLocationPrivate: z.boolean().optional(),
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
// Now accepts email, phone number, OR username as the identifier
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email, phone number, or username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

// --- VERIFY PHONE DTO ---
export const verifyPhoneSchema = z.object({
  phoneNumber: phoneField,
});

export type VerifyPhoneDto = z.infer<typeof verifyPhoneSchema>;

// --- CONFIRM PHONE DTO ---
export const confirmPhoneSchema = z.object({
  phoneNumber: phoneField,
  otp: z.string().trim().min(4).max(10, 'Invalid OTP code'),
});

export type ConfirmPhoneDto = z.infer<typeof confirmPhoneSchema>;

// --- FORGOT PASSWORD DTO ---
// Accepts email or phone number to initiate password reset
export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or phone number is required'),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

// --- RESET PASSWORD DTO ---
// Token from the reset link + new password
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

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

// --- CHANGE PASSWORD DTO ---
export const changePasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'Password too long'),
    currentPassword: z.string().optional(),
    ticket: z.string().optional(),
  })
  .refine((data) => data.currentPassword || data.ticket, {
    message: 'Either current password or verification ticket is required',
  });

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

// --- SECURITY CODE REQUEST DTO ---
export const securityCodeRequestSchema = z.object({
  action: z.enum(['change-password', 'delete-account']),
  method: z.enum(['email', 'phone']),
  identifier: z.string().trim().min(1, 'Please enter your account email or phone number'),
});

export type SecurityCodeRequestDto = z.infer<typeof securityCodeRequestSchema>;

// --- SECURITY CODE VERIFY DTO ---
export const securityCodeVerifySchema = z.object({
  action: z.enum(['change-password', 'delete-account']),
  otp: z.string().trim().length(6, 'Verification code must be 6 digits'),
});

export type SecurityCodeVerifyDto = z.infer<typeof securityCodeVerifySchema>;

