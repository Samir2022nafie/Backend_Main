import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '@/core/database/prisma.service';
import { PasswordService } from './password.service';
import { SessionService, SessionMetadata } from './session.service';
import {
  RegisterDto,
  LoginDto,
  VerifyPhoneDto,
  ConfirmPhoneDto,
  OAuthLoginDto,
  LinkExternalDto,
  OAuthProvider,
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
  ) {}

  /**
   * Register a new user with email and/or phone number
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

    // 2. Hash password
    const hashedPassword = await this.passwordService.hash(dto.password);
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();
    const cleanEmail = dto.email && dto.email.trim().length > 0 ? dto.email.toLowerCase().trim() : null;
    const cleanPhone = dto.phoneNumber && dto.phoneNumber.trim().length > 0 ? dto.phoneNumber.trim() : null;

    // 3. Create user & credential row
    const user = await this.prisma.users.create({
      data: {
        username: dto.username,
        email: cleanEmail,
        phone_number: cleanPhone,
        first_name: dto.firstName,
        last_name: dto.lastName,
        name: fullName,
        birth_date: dto.birthDate,
        trust_score: 50,
        external_accounts: {
          create: {
            provider: 'credential',
            provider_user_id: dto.username,
            password: hashedPassword,
          },
        },
      },
    });

    // 4. Issue bearer session
    const session = await this.sessionService.createSession(user.id, metadata);

    return {
      user: this.sanitizeUser(user),
      token: session.token,
    };
  }

  /**
   * Login with identifier (email OR verified phone number) and password
   */
  async login(dto: LoginDto, metadata?: SessionMetadata): Promise<AuthResponse> {
    const identifier = dto.identifier.trim();

    // 1. Resolve user by email OR verified phone number (unverified phone numbers cannot log in)
    const user = await this.prisma.users.findFirst({
      where: {
        deleted_at: null,
        OR: [
          { email: identifier.toLowerCase() },
          { phone_number: identifier, phone_verified_at: { not: null } },
        ],
      },
    });

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
   * Request phone verification OTP
   */
  async verifyPhone(dto: VerifyPhoneDto): Promise<{ success: true; message: string }> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.verification.create({
      data: {
        identifier: `phone:${dto.phoneNumber}`,
        value: otp,
        expires_at: expiresAt,
      },
    });

    this.logger.log(`📱 [PHONE OTP] Sent code ${otp} to ${dto.phoneNumber}`);

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

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        phone_number: dto.phoneNumber,
        phone_verified_at: new Date(),
      },
    });

    await this.prisma.verification.delete({
      where: { id: record.id },
    });

    return { success: true };
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

  private sanitizeUser(user: any): any {
    const { password_hash, ...rest } = user;
    return rest;
  }
}
