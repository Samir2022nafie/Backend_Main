import {
  Controller,
  Post,
  Body,
  Req,
  Param,
  Headers,
  UsePipes,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, AuthResponse } from './auth.service';
import { Public } from '@/core/decorators/public.decorator';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import {
  registerSchema,
  RegisterDto,
  loginSchema,
  LoginDto,
  verifyPhoneSchema,
  VerifyPhoneDto,
  confirmPhoneSchema,
  ConfirmPhoneDto,
  oauthLoginSchema,
  OAuthLoginDto,
  linkExternalSchema,
  LinkExternalDto,
  oauthProviderSchema,
  OAuthProvider,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const metadata = this.extractMetadata(req);
    return this.authService.register(dto, metadata);
  }

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const metadata = this.extractMetadata(req);
    return this.authService.login(dto, metadata);
  }

  @Post('logout')
  async logout(@Req() req: Request): Promise<{ success: true }> {
    const token = this.extractToken(req);
    return this.authService.logout(token);
  }

  @Post('verify-phone')
  async verifyPhone(
    @Body(new ZodValidationPipe(verifyPhoneSchema)) dto: VerifyPhoneDto,
  ): Promise<{ success: true; message: string }> {
    return this.authService.verifyPhone(dto);
  }

  @Post('verify-phone/confirm')
  async confirmPhone(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(confirmPhoneSchema)) dto: ConfirmPhoneDto,
  ): Promise<{ success: true }> {
    return this.authService.confirmPhone(user.id, dto);
  }

  @Public()
  @Post('oauth/:provider')
  async oauthLogin(
    @Param('provider', new ZodValidationPipe(oauthProviderSchema)) provider: OAuthProvider,
    @Body(new ZodValidationPipe(oauthLoginSchema)) dto: OAuthLoginDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const metadata = this.extractMetadata(req);
    return this.authService.oauthLogin(provider, dto, metadata);
  }

  @Post('link-external')
  async linkExternal(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(linkExternalSchema)) dto: LinkExternalDto,
  ): Promise<{ linkedProviders: string[] }> {
    return this.authService.linkExternal(user.id, dto);
  }

  @Public()
  @Post('bot/:provider')
  async botWebhook(
    @Param('provider') provider: string,
    @Headers('x-bot-webhook-secret') secret: string | undefined,
    @Body() body: any,
  ): Promise<{ acknowledged: boolean }> {
    return this.authService.handleBotWebhook(secret, provider, body);
  }

  private extractMetadata(req: Request) {
    return {
      ipAddress: req.ip || req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
    };
  }

  private extractToken(req: Request): string {
    const sessionToken = (req as any).session?.token;
    if (sessionToken) return sessionToken;

    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return '';
  }
}
