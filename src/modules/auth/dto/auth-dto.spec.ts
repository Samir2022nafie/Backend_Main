import {
  registerSchema,
  loginSchema,
  verifyPhoneSchema,
  confirmPhoneSchema,
} from './index';

describe('Auth DTO Validation Schemas', () => {
  describe('registerSchema', () => {
    const validBase = {
      username: 'johndoe',
      email: 'john@example.com',
      phoneNumber: '+251911223344',
      password: 'StrongPassword123!',
      firstName: 'John',
      lastName: 'Doe',
      birthDate: '2000-01-01',
    };

    it('should validate a valid registration payload with email and phone', () => {
      const result = registerSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('should validate a registration payload with email only', () => {
      const payload = { ...validBase, phoneNumber: undefined };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate a registration payload with phone only', () => {
      const payload = { ...validBase, email: undefined };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject when both email and phone are missing', () => {
      const payload = { ...validBase, email: undefined, phoneNumber: undefined };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'At least one of email or phoneNumber must be provided',
        );
      }
    });

    it('should reject user younger than 13 years old', () => {
      const recentDate = new Date();
      recentDate.setFullYear(recentDate.getFullYear() - 10); // 10 years old
      const payload = { ...validBase, birthDate: recentDate.toISOString() };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 13 years old');
      }
    });

    it('should reject short passwords', () => {
      const payload = { ...validBase, password: 'short' };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid username characters', () => {
      const payload = { ...validBase, username: 'john doe!' };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should validate valid email identifier', () => {
      const result = loginSchema.safeParse({
        identifier: 'john@example.com',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should validate valid phone identifier', () => {
      const result = loginSchema.safeParse({
        identifier: '+251911223344',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing identifier or password', () => {
      expect(loginSchema.safeParse({ identifier: '', password: 'pwd' }).success).toBe(false);
      expect(loginSchema.safeParse({ identifier: 'id', password: '' }).success).toBe(false);
    });
  });

  describe('verifyPhoneSchema & confirmPhoneSchema', () => {
    it('should accept valid international phone numbers', () => {
      expect(verifyPhoneSchema.safeParse({ phoneNumber: '+251911223344' }).success).toBe(true);
      expect(verifyPhoneSchema.safeParse({ phoneNumber: '+14155552671' }).success).toBe(true);
    });

    it('should reject invalid phone format', () => {
      expect(verifyPhoneSchema.safeParse({ phoneNumber: 'not-a-phone' }).success).toBe(false);
    });

    it('should validate confirm phone payload', () => {
      expect(
        confirmPhoneSchema.safeParse({ phoneNumber: '+251911223344', otp: '123456' }).success,
      ).toBe(true);
      expect(
        confirmPhoneSchema.safeParse({ phoneNumber: '+251911223344', otp: '' }).success,
      ).toBe(false);
    });
  });
});
