import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PrismaService } from '@/core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@/core/common/enums';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    users: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user_external_accounts: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    verification: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const mockPasswordService = {
    hash: jest.fn().mockResolvedValue('hashed_password'),
    compare: jest.fn(),
  };

  const mockSessionService = {
    createSession: jest.fn().mockResolvedValue({
      token: 'session_token_123',
      expiresAt: new Date(Date.now() + 100000),
    }),
    revokeSession: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'bot.webhookSecret') return 'test_bot_secret';
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      username: 'johndoe',
      email: 'john@example.com',
      phoneNumber: '+251911223344',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      birthDate: new Date('2000-01-01'),
    };

    it('should register a new user successfully and issue a session token', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce(null); // No existing user collision
      const createdUser = {
        id: 'user-uuid-1',
        username: registerDto.username,
        email: registerDto.email,
        phone_number: registerDto.phoneNumber,
        first_name: registerDto.firstName,
        last_name: registerDto.lastName,
        name: 'John Doe',
        birth_date: registerDto.birthDate,
        trust_score: 50,
        phone_verified_at: null,
        deleted_at: null,
      };
      mockPrismaService.users.create.mockResolvedValueOnce(createdUser);
      mockPrismaService.user_external_accounts.create.mockResolvedValueOnce({});

      const result = await service.register(registerDto, { ipAddress: '127.0.0.1' });

      expect(result.token).toBe('session_token_123');
      expect(result.user.id).toBe('user-uuid-1');
      expect(mockPasswordService.hash).toHaveBeenCalledWith(registerDto.password);
      expect(mockSessionService.createSession).toHaveBeenCalledWith('user-uuid-1', {
        ipAddress: '127.0.0.1',
      });
    });

    it('should throw ConflictException if username, email, or phone is already taken', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce({ id: 'existing-id' });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const existingUser = {
      id: 'user-uuid-1',
      username: 'johndoe',
      email: 'john@example.com',
      phone_number: '+251911223344',
      first_name: 'John',
      last_name: 'Doe',
      phone_verified_at: new Date('2026-01-01'),
      deleted_at: null,
    };

    it('should login with valid email and password', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce(existingUser);
      mockPrismaService.user_external_accounts.findFirst.mockResolvedValueOnce({
        password: 'hashed_password',
      });
      mockPasswordService.compare.mockResolvedValueOnce(true);

      const result = await service.login({
        identifier: 'john@example.com',
        password: 'SecurePassword123!',
      });

      expect(result.token).toBe('session_token_123');
      expect(result.user.id).toBe('user-uuid-1');
    });

    it('should login with verified phone number and password', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce(existingUser);
      mockPrismaService.user_external_accounts.findFirst.mockResolvedValueOnce({
        password: 'hashed_password',
      });
      mockPasswordService.compare.mockResolvedValueOnce(true);

      const result = await service.login({
        identifier: '+251911223344',
        password: 'SecurePassword123!',
      });

      expect(result.token).toBe('session_token_123');
    });

    it('should reject unverified phone login even if user exists', async () => {
      // User find query searches for email OR (phone AND phone_verified_at != null).
      // If phone is unverified, findFirst returns null.
      mockPrismaService.users.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.login({ identifier: '+251999999999', password: 'pwd' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login if password does not match', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce(existingUser);
      mockPrismaService.user_external_accounts.findFirst.mockResolvedValueOnce({
        password: 'hashed_password',
      });
      mockPasswordService.compare.mockResolvedValueOnce(false);

      await expect(
        service.login({ identifier: 'john@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login if user is soft deleted', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.login({ identifier: 'john@example.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke the active session', async () => {
      await service.logout('session-token-123');
      expect(mockSessionService.revokeSession).toHaveBeenCalledWith('session-token-123');
    });
  });

  describe('verifyPhone & confirmPhone', () => {
    it('should create an OTP record on verifyPhone', async () => {
      mockPrismaService.verification.create.mockResolvedValueOnce({});

      const result = await service.verifyPhone({ phoneNumber: '+251911223344' });

      expect(result.success).toBe(true);
      expect(mockPrismaService.verification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          identifier: 'phone:+251911223344',
          value: expect.any(String),
        }),
      });
    });

    it('should confirm phone, update phone_verified_at, and delete verification record', async () => {
      const validRecord = {
        id: 'verification-uuid',
        identifier: 'phone:+251911223344',
        value: '123456',
        expires_at: new Date(Date.now() + 60000),
      };
      mockPrismaService.verification.findFirst.mockResolvedValueOnce(validRecord);
      mockPrismaService.users.update.mockResolvedValueOnce({});
      mockPrismaService.verification.delete.mockResolvedValueOnce({});

      const result = await service.confirmPhone(
        'user-uuid-1',
        { phoneNumber: '+251911223344', otp: '123456' },
      );

      expect(result.success).toBe(true);
      expect(mockPrismaService.users.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: expect.objectContaining({
          phone_number: '+251911223344',
          phone_verified_at: expect.any(Date),
        }),
      });
      expect(mockPrismaService.verification.delete).toHaveBeenCalledWith({
        where: { id: 'verification-uuid' },
      });
    });

    it('should throw BadRequestException if OTP is incorrect or expired', async () => {
      mockPrismaService.verification.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.confirmPhone('user-uuid-1', { phoneNumber: '+251911223344', otp: '000000' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
