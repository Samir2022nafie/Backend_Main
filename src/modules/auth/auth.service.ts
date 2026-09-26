import {
  Injectable,
  Inject,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '@/core/database/prisma.service';
import { PasswordService } from './password.service';
import { SessionService, SessionMetadata } from './session.service';
import { SMS_SERVICE, ISmsService } from '@/core/services/sms/sms.interface';
import { EmailService } from '@/core/services/email/email.service';
import { LocationsService } from '@/modules/locations/locations.service';
import {
  RegisterDto,
  LoginDto,
  VerifyPhoneDto,
  ConfirmPhoneDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  SecurityCodeRequestDto,
  SecurityCodeVerifyDto,
  OAuthLoginDto,
  OAuthProvider,
  LinkExternalDto,
  phoneRegex,
  looksLikePhone,
  normalizePhone,
} from './dto';
import { ErrorCode } from '@/core/common/enums';

export interface AuthResponse {
  user: any;
  token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly locationsService: LocationsService,
    @Inject(SMS_SERVICE) private readonly smsService: ISmsService,
  ) {}

  /**
   * Register a new user with email and/or phone number.
   * Better Auth handles password hashing via the credential account model.
   */
  async register(dto: RegisterDto, metadata?: SessionMetadata): Promise<AuthResponse> {
    // 1. Uniqueness check
    const orConditions: any[] = [{ username: dto.username }];
    if (dto.email && dto.email.trim().length > 0) {
      orConditions.push({ email: dto.email.toLowerCase().trim() });
    }
    if (dto.phoneNumber && dto.phoneNumber.trim().length > 0) {
      orConditions.push({ phone_number: dto.phoneNumber.trim() });
    }

    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (existingUser) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Username, email, or phone number already in use',
      });
    }

    // 2. Hash password via Better Auth's password service
    const hashedPassword = await this.passwordService.hash(dto.password);
    const fullName = `${dto.firstName} ${dto.lastName || ''}`.trim();
    const cleanEmail = dto.email && dto.email.trim().length > 0 ? dto.email.toLowerCase().trim() : null;
    const cleanPhone = dto.phoneNumber && dto.phoneNumber.trim().length > 0 ? dto.phoneNumber.trim() : null;

    // 3. If phone number is provided with OTP, verify OTP before creating user
    let isPhoneVerified = false;
    if (cleanPhone && (dto as any).otp) {
      const record = await this.prisma.verification.findFirst({
        where: {
          identifier: `phone:${cleanPhone}`,
          value: (dto as any).otp,
          expires_at: { gt: new Date() },
        },
      });

      if (!record) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid or expired OTP code',
        });
      }

      await this.prisma.verification.delete({
        where: { id: record.id },
      });
      isPhoneVerified = true;
    }

    // 3.5 Resolve location if provided
    let locationIdToSet: string | null = null;
    if (
      dto.locationId ||
      dto.locationName ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined
    ) {
      locationIdToSet = await this.locationsService.resolveLocation({
        locationId: dto.locationId,
        locationName: dto.locationName,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
    }

    // 4. Create user & credential row
    const user = await this.prisma.users.create({
      data: {
        username: dto.username,
        email: cleanEmail,
        phone_number: cleanPhone,
        phone_verified_at: isPhoneVerified ? new Date() : null,
        phone_number_verified: isPhoneVerified,
        first_name: dto.firstName,
        last_name: dto.lastName || null,
        name: fullName,
        birth_date: dto.birthDate,
        trust_score: 50,
        location_id: locationIdToSet,
        is_location_private: dto.isLocationPrivate ?? false,
        external_accounts: {
          create: {
            provider: 'credential',
            provider_user_id: dto.username,
            password: hashedPassword,
          },
        },
      },
      include: {
        location: true,
      },
    });

    // 5. Issue bearer session
    const session = await this.sessionService.createSession(user.id, metadata);

    // 6. If phone number was provided without OTP, send verification OTP immediately
    if (cleanPhone && !isPhoneVerified) {
      await this.verifyPhone({ phoneNumber: cleanPhone });
    }

    return {
      user: this.sanitizeUser(user),
      token: session.token,
    };
  }

  /**
   * Login with identifier (email, phone number, OR username) and password.
   * Resolves the identifier type and finds the user accordingly.
   */
  async login(dto: LoginDto, metadata?: SessionMetadata): Promise<AuthResponse> {
    const identifier = dto.identifier.trim();

    // 1. Resolve user by email, verified phone, OR username
    const user = await this.resolveUserByIdentifier(identifier);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }

    // 2. Look up credential password
    const credential = await this.prisma.user_external_accounts.findFirst({
      where: {
        user_id: user.id,
        provider: 'credential',
      },
    });

    if (!credential || !credential.password) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }

    // 3. Verify password
    const isValidPassword = await this.passwordService.compare(dto.password, credential.password);
    if (!isValidPassword) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }

    // 4. Issue bearer session
    const session = await this.sessionService.createSession(user.id, metadata);

    return {
      user: this.sanitizeUser(user),
      token: session.token,
    };
  }

  /**
   * Revoke active bearer session
   */
  async logout(token: string): Promise<{ success: true }> {
    await this.sessionService.revokeSession(token);
    return { success: true };
  }

  /**
   * Request phone verification OTP.
   * Uses the provider-agnostic SMS service (AfroMessage or console dev fallback).
   */
  async verifyPhone(dto: VerifyPhoneDto, userId?: string): Promise<{ success: true; message: string }> {
    if (userId) {
      const currentUser = await this.prisma.users.findUnique({ where: { id: userId } });
      if (currentUser?.phone_number === dto.phoneNumber) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'This phone number is already connected to your account. Please enter a different phone number.',
        });
      }
    }

    // Uniqueness check: reject if another active user has this number
    const existingOther = await this.prisma.users.findFirst({
      where: {
        phone_number: dto.phoneNumber,
        deleted_at: null,
        ...(userId ? { id: { not: userId } } : {}),
      },
    });

    if (existingOther) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'This phone number is already associated with another account',
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up any existing unexpired OTP for this phone
    await this.prisma.verification.deleteMany({
      where: { identifier: `phone:${dto.phoneNumber}` },
    });

    await this.prisma.verification.create({
      data: {
        identifier: `phone:${dto.phoneNumber}`,
        value: otp,
        expires_at: expiresAt,
      },
    });

    // Send via SMS service (AfroMessage or console fallback)
    const result = await this.smsService.sendOtp(dto.phoneNumber, otp);
    if (!result.success) {
      this.logger.warn(`📱 SMS delivery failed for ${dto.phoneNumber}: ${result.error}`);
    }

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  /**
   * Confirm phone verification OTP and unlock phone login
   */
  async confirmPhone(userId: string, dto: ConfirmPhoneDto): Promise<{ success: true }> {
    const record = await this.prisma.verification.findFirst({
      where: {
        identifier: `phone:${dto.phoneNumber}`,
        value: dto.otp,
        expires_at: { gt: new Date() },
      },
    });

    if (!record) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid or expired OTP code',
      });
    }

    const existing = await this.prisma.users.findFirst({
      where: {
        phone_number: dto.phoneNumber,
        id: { not: userId },
        deleted_at: null,
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'This phone number is already associated with another account',
      });
    }

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        phone_number: dto.phoneNumber,
        phone_verified_at: new Date(),
        phone_number_verified: true,
      },
    });

    if (record) {
      await this.prisma.verification.delete({
        where: { id: record.id },
      });
    }

    return { success: true };
  }

  /**
   * Initiate "Forgot Password" flow.
   * Generates a password reset token and sends a reset link via email or SMS.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true; message: string }> {
    const identifier = dto.identifier.trim();

    // Resolve user
    const user = await this.resolveUserByIdentifier(identifier);

    // Always return success to prevent user enumeration
    if (!user) {
      return {
        success: true,
        message: 'If an account with that identifier exists, a password reset link has been sent.',
      };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Clean up expired reset tokens for this user
    await this.prisma.verification.deleteMany({
      where: {
        identifier: `password-reset:${user.id}`,
        expires_at: { lt: new Date() },
      },
    });

    await this.prisma.verification.create({
      data: {
        identifier: `password-reset:${user.id}`,
        value: resetToken,
        expires_at: expiresAt,
      },
    });

    // Build reset URL pointing to the Admin Dashboard's reset-password page
    const adminUrl = this.configService.get<string>('ADMIN_DASHBOARD_URL') || 'http://localhost:3001';
    const resetUrl = `${adminUrl}/reset-password?token=${resetToken}`;

    const isEmailInput = identifier.includes('@');
    const isPhoneInput = looksLikePhone(identifier);

    // Deliver the reset link via the exact channel the user specified
    if (isPhoneInput) {
      if (user.phone_number) {
        await this.smsService.sendSms({
          to: user.phone_number,
          message: `Your Nexus password reset link:\n${resetUrl}\n\nThis link expires in 15 minutes.`,
        });
      }
    } else if (isEmailInput) {
      if (user.email) {
        await this.emailService.sendMail({
          to: user.email,
          subject: 'Nexus — Password Reset',
          text: `You requested a password reset for your Nexus account.\n\nClick the link below to reset your password (expires in 15 minutes):\n${resetUrl}\n\nIf you did not request this, please ignore this email.`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8f9fa; border-radius: 12px;">
              <h2 style="color: #1a1a2e; margin-bottom: 16px;">Password Reset</h2>
              <p style="color: #444; line-height: 1.6;">You requested a password reset for your <strong>Nexus</strong> account.</p>
              <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: #6c63ff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
              <p style="color: #888; font-size: 13px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      }
    } else {
      // Username input fallback: prefer email, otherwise phone
      if (user.email) {
        await this.emailService.sendMail({
          to: user.email,
          subject: 'Nexus — Password Reset',
          text: `You requested a password reset for your Nexus account.\n\nClick the link below to reset your password (expires in 15 minutes):\n${resetUrl}\n\nIf you did not request this, please ignore this email.`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8f9fa; border-radius: 12px;">
              <h2 style="color: #1a1a2e; margin-bottom: 16px;">Password Reset</h2>
              <p style="color: #444; line-height: 1.6;">You requested a password reset for your <strong>Nexus</strong> account.</p>
              <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: #6c63ff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
              <p style="color: #888; font-size: 13px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } else if (user.phone_number) {
        await this.smsService.sendSms({
          to: user.phone_number,
          message: `Your Nexus password reset link:\n${resetUrl}\n\nThis link expires in 15 minutes.`,
        });
      }
    }

    return {
      success: true,
      message: 'If an account with that identifier exists, a password reset link has been sent.',
    };
  }

  /**
   * Reset password using the token from the forgot-password flow.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const cleanToken = dto.token.trim();

    // Find the verification record for this token
    const record = await this.prisma.verification.findFirst({
      where: {
        value: cleanToken,
        identifier: { startsWith: 'password-reset:' },
        expires_at: { gt: new Date() },
      },
    });

    if (!record) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid or expired reset token',
      });
    }

    // Extract user ID from the identifier
    const userId = record.identifier.replace('password-reset:', '');

    // Hash the new password
    const hashedPassword = await this.passwordService.hash(dto.newPassword);

    // Update the credential account
    const credential = await this.prisma.user_external_accounts.findFirst({
      where: {
        user_id: userId,
        provider: 'credential',
      },
    });

    if (credential) {
      await this.prisma.user_external_accounts.update({
        where: { id: credential.id },
        data: { password: hashedPassword },
      });
    } else {
      // Create credential account if user was OAuth-only
      const user = await this.prisma.users.findUnique({ where: { id: userId } });
      if (user) {
        await this.prisma.user_external_accounts.create({
          data: {
            user_id: userId,
            provider: 'credential',
            provider_user_id: user.username,
            password: hashedPassword,
          },
        });
      }
    }

    // Clean up all reset tokens for this user once reset is successful
    await this.prisma.verification.deleteMany({
      where: { identifier: `password-reset:${userId}` },
    });

    // Revoke all existing sessions (force re-login after password change)
    await this.sessionService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * Request an identity verification code (SMS or Email) for sensitive actions like change-password or delete-account.
   */
  async requestSecurityCode(userId: string, dto: SecurityCodeRequestDto): Promise<{ success: true; message: string }> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId, deleted_at: null },
    });

    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (dto.method === 'email') {
      if (!user.email) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'No email address is connected to this account. Please select phone verification instead.',
        });
      }

      const inputClean = dto.identifier.toLowerCase().trim();
      const userClean = user.email.toLowerCase().trim();
      if (inputClean !== userClean) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The email entered does not match the email associated with this account.',
        });
      }

      await this.prisma.verification.deleteMany({
        where: { identifier: `security:${dto.action}:${userId}` },
      });

      await this.prisma.verification.create({
        data: {
          identifier: `security:${dto.action}:${userId}`,
          value: otp,
          expires_at: expiresAt,
        },
      });

      await this.emailService.sendMail({
        to: user.email,
        subject: `Nexus — Verification Code for ${dto.action === 'change-password' ? 'Password Change' : 'Account Deletion'}`,
        text: `Your Nexus 6-digit verification code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this, please secure your account immediately.`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f8f9fa; border-radius: 12px;">
            <h2 style="color: #1a1a2e; margin-bottom: 12px;">Security Verification</h2>
            <p style="color: #444;">You requested to <strong>${dto.action === 'change-password' ? 'change your password' : 'delete your account'}</strong>.</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #6366f1; margin: 24px 0; text-align: center;">${otp}</div>
            <p style="color: #888; font-size: 12px;">This code expires in 10 minutes. If you did not request this, please secure your account.</p>
          </div>
        `,
      });

      return { success: true, message: `Verification code sent to ${user.email}` };
    } else {
      // Phone method
      if (!user.phone_number) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'No phone number is connected to this account. Please select email verification instead.',
        });
      }

      const normalizedInput = normalizePhone(dto.identifier);
      if (!normalizedInput || normalizedInput !== user.phone_number) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The phone number entered does not match the phone number connected to this account.',
        });
      }

      await this.prisma.verification.deleteMany({
        where: { identifier: `security:${dto.action}:${userId}` },
      });

      await this.prisma.verification.create({
        data: {
          identifier: `security:${dto.action}:${userId}`,
          value: otp,
          expires_at: expiresAt,
        },
      });

      await this.smsService.sendOtp(user.phone_number, otp);

      return { success: true, message: `Verification code sent to ${user.phone_number}` };
    }
  }

  /**
   * Verify identity code and grant a temporary action ticket.
   */
  async verifySecurityCode(userId: string, dto: SecurityCodeVerifyDto): Promise<{ success: true; ticket: string }> {
    const record = await this.prisma.verification.findFirst({
      where: {
        identifier: `security:${dto.action}:${userId}`,
        value: dto.otp,
        expires_at: { gt: new Date() },
      },
    });

    if (!record) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid or expired verification code',
      });
    }

    await this.prisma.verification.delete({ where: { id: record.id } });

    const ticket = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await this.prisma.verification.create({
      data: {
        identifier: `security-ticket:${dto.action}:${userId}`,
        value: ticket,
        expires_at: expiresAt,
      },
    });

    return { success: true, ticket };
  }

  /**
   * Change password for authenticated user (supports verified ticket or currentPassword).
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: true; message: string }> {
    if (dto.ticket) {
      const ticketRecord = await this.prisma.verification.findFirst({
        where: {
          identifier: `security-ticket:change-password:${userId}`,
          value: dto.ticket,
          expires_at: { gt: new Date() },
        },
      });

      if (!ticketRecord) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Security verification session expired or invalid. Please verify again.',
        });
      }

      await this.prisma.verification.delete({ where: { id: ticketRecord.id } });
    } else if (dto.currentPassword) {
      let credential = await this.prisma.user_external_accounts.findFirst({
        where: {
          user_id: userId,
          provider: 'credential',
        },
      });

      let currentHash = credential?.password;

      if (!currentHash) {
        // Check legacy column fallback
        const user = await this.prisma.users.findUnique({ where: { id: userId } });
        if (user?.password_hash) {
          currentHash = user.password_hash;
        }
      }

      if (!currentHash) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'No password credential found for this account',
        });
      }

      const isValid = await this.passwordService.compare(dto.currentPassword, currentHash);
      if (!isValid) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Current password is incorrect',
        });
      }
    } else {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Either verification ticket or current password is required',
      });
    }

    const newHash = await this.passwordService.hash(dto.newPassword);

    let credential = await this.prisma.user_external_accounts.findFirst({
      where: {
        user_id: userId,
        provider: 'credential',
      },
    });

    if (credential) {
      await this.prisma.user_external_accounts.update({
        where: { id: credential.id },
        data: { password: newHash },
      });
    } else {
      const user = await this.prisma.users.findUnique({ where: { id: userId } });
      await this.prisma.user_external_accounts.create({
        data: {
          user_id: userId,
          provider: 'credential',
          provider_user_id: user?.username || userId,
          password: newHash,
        },
      });
    }

    // Invalidate all active sessions across all devices (mobile, admin, web)
    await this.sessionService.revokeAllUserSessions(userId);

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  /**
   * OAuth login (Google, Apple, Telegram)
   */
  async oauthLogin(
    provider: OAuthProvider,
    dto: OAuthLoginDto,
    metadata?: SessionMetadata,
  ): Promise<AuthResponse> {
    let providerUserId = '';
    let providerEmail: string | undefined = dto.email ? dto.email.toLowerCase() : undefined;
    let providerUsername: string | undefined = undefined;
    let firstName = 'User';
    let lastName = '';

    if (provider === 'telegram') {
      if (!dto.telegram) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Telegram widget payload required',
        });
      }
      providerUserId = dto.telegram.id;
      providerUsername = dto.telegram.username;
      firstName = dto.telegram.first_name;
      lastName = dto.telegram.last_name || '';
    } else {
      // Google / Apple
      if (!dto.idToken && !dto.accessToken) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'idToken or accessToken required for oauth login',
        });
      }
      providerUserId = dto.idToken || 'mock_provider_id';
    }

    // 1. Check if external account already linked
    let external = await this.prisma.user_external_accounts.findFirst({
      where: {
        provider,
        provider_user_id: providerUserId,
      },
      include: {
        user: true,
      },
    });

    if (external) {
      if (external.user.deleted_at !== null) {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Account has been deactivated',
        });
      }
      const session = await this.sessionService.createSession(external.user.id, metadata);
      return {
        user: this.sanitizeUser(external.user),
        token: session.token,
      };
    }

    // 2. If email provided, check if collides with unlinked existing account
    if (providerEmail) {
      const existingEmailUser = await this.prisma.users.findUnique({
        where: { email: providerEmail.toLowerCase() },
      });
      if (existingEmailUser) {
        throw new ConflictException({
          code: ErrorCode.ACCOUNT_EXISTS_NOT_LINKED,
          message: 'Account with this email already exists. Please link it explicitly.',
        });
      }
    }

    // 3. Register new user via OAuth
    const username = providerUsername || `user_${crypto.randomBytes(4).toString('hex')}`;
    const birthDate = dto.birthDate || new Date('2000-01-01');

    const newUser = await this.prisma.users.create({
      data: {
        username,
        email: providerEmail?.toLowerCase() || null,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        birth_date: birthDate,
        trust_score: 50,
        external_accounts: {
          create: {
            provider,
            provider_user_id: providerUserId,
            provider_username: providerUsername,
            provider_email: providerEmail,
          },
        },
      },
    });

    const session = await this.sessionService.createSession(newUser.id, metadata);

    return {
      user: this.sanitizeUser(newUser),
      token: session.token,
    };
  }

  /**
   * Link external provider to currently logged-in user
   */
  async linkExternal(userId: string, dto: LinkExternalDto): Promise<{ linkedProviders: string[] }> {
    const providerUserId = dto.telegram?.id || dto.idToken || crypto.randomUUID();

    // Check if provider is already linked to another user
    const existing = await this.prisma.user_external_accounts.findFirst({
      where: {
        provider: dto.provider,
        provider_user_id: providerUserId,
      },
    });

    if (existing && existing.user_id !== userId) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'This provider account is already linked to another user',
      });
    }

    if (!existing) {
      await this.prisma.user_external_accounts.create({
        data: {
          user_id: userId,
          provider: dto.provider,
          provider_user_id: providerUserId,
          provider_username: dto.telegram?.username,
        },
      });
    }

    const accounts = await this.prisma.user_external_accounts.findMany({
      where: { user_id: userId },
      select: { provider: true },
    });

    return {
      linkedProviders: accounts.map((a) => a.provider),
    };
  }

  /**
   * Bot webhook handler (v1.2 dormant feature)
   */
  async handleBotWebhook(secret: string | undefined, provider: string, body: any): Promise<{ acknowledged: boolean }> {
    const expectedSecret = this.configService.get<string>('bot.webhookSecret');
    if (!expectedSecret || secret !== expectedSecret) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid bot webhook secret',
      });
    }

    this.logger.log(`🤖 Bot webhook received for provider: ${provider}`);
    return { acknowledged: true };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Resolve a user by their identifier (email, phone, or username).
   * - Contains '@' → email lookup
   * - Matches phone regex → verified phone lookup
   * - Otherwise → username lookup
   */
  private async resolveUserByIdentifier(identifier: string): Promise<any | null> {
    const isEmail = identifier.includes('@');
    const isPhone = looksLikePhone(identifier);

    if (isEmail) {
      return this.prisma.users.findFirst({
        where: {
          deleted_at: null,
          email: identifier.toLowerCase(),
        },
      });
    }

    if (isPhone) {
      // Normalise the raw phone input so "0911223344" matches "+251911223344" in the DB
      const normalised = normalizePhone(identifier);
      if (!normalised) return null;

      return this.prisma.users.findFirst({
        where: {
          deleted_at: null,
          phone_number: normalised,
        },
      });
    }

    // Username lookup
    return this.prisma.users.findFirst({
      where: {
        deleted_at: null,
        username: identifier,
      },
    });
  }

  private sanitizeUser(user: any): any {
    const { password_hash, ...rest } = user;
    return rest;
  }
}
