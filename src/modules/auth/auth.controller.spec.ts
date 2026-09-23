import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn().mockResolvedValue({
      user: { id: 'user-1', username: 'johndoe' },
      token: 'mock-token',
    }),
    login: jest.fn().mockResolvedValue({
      user: { id: 'user-1', username: 'johndoe' },
      token: 'mock-token',
    }),
    logout: jest.fn().mockResolvedValue({ success: true }),
    verifyPhone: jest.fn().mockResolvedValue({ success: true, message: 'OTP sent' }),
    confirmPhone: jest.fn().mockResolvedValue({ success: true }),
    oauthLogin: jest.fn().mockResolvedValue({
      user: { id: 'user-2', username: 'oauthuser' },
      token: 'mock-oauth-token',
    }),
    linkExternal: jest.fn().mockResolvedValue({ linkedProviders: ['google'] }),
    handleBotWebhook: jest.fn().mockResolvedValue({ acknowledged: true }),
  };

  const mockReq = {
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('TestAgent/1.0'),
    headers: {
      authorization: 'Bearer session-token-xyz',
    },
    session: {
      token: 'session-token-xyz',
    },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle registration', async () => {
    const dto = {
      username: 'johndoe',
      email: 'john@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      birthDate: new Date('2000-01-01'),
    };

    const res = await controller.register(dto, mockReq);

    expect(mockAuthService.register).toHaveBeenCalledWith(dto, {
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });
    expect(res.token).toBe('mock-token');
  });

  it('should handle login', async () => {
    const dto = {
      identifier: 'john@example.com',
      password: 'password123',
    };

    const res = await controller.login(dto, mockReq);

    expect(mockAuthService.login).toHaveBeenCalledWith(dto, {
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });
    expect(res.token).toBe('mock-token');
  });

  it('should handle logout', async () => {
    const res = await controller.logout(mockReq);

    expect(mockAuthService.logout).toHaveBeenCalledWith('session-token-xyz');
    expect(res.success).toBe(true);
  });

  it('should handle phone verification request', async () => {
    const dto = { phoneNumber: '+251911223344' };
    const res = await controller.verifyPhone(dto);

    expect(mockAuthService.verifyPhone).toHaveBeenCalledWith(dto);
    expect(res.success).toBe(true);
  });

  it('should handle phone verification confirmation', async () => {
    const user = { id: 'user-1' };
    const dto = { phoneNumber: '+251911223344', otp: '123456' };

    const res = await controller.confirmPhone(user, dto);

    expect(mockAuthService.confirmPhone).toHaveBeenCalledWith('user-1', dto);
    expect(res.success).toBe(true);
  });

  it('should handle oauth login', async () => {
    const dto = { idToken: 'google-id-token' };

    const res = await controller.oauthLogin('google', dto, mockReq);

    expect(mockAuthService.oauthLogin).toHaveBeenCalledWith('google', dto, {
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });
    expect(res.token).toBe('mock-oauth-token');
  });

  it('should handle link external provider', async () => {
    const user = { id: 'user-1' };
    const dto = { provider: 'google' as const, idToken: 'token' };

    const res = await controller.linkExternal(user, dto);

    expect(mockAuthService.linkExternal).toHaveBeenCalledWith('user-1', dto);
    expect(res.linkedProviders).toContain('google');
  });

  it('should handle bot webhook', async () => {
    const res = await controller.botWebhook('telegram', 'secret123', { update_id: 1 });

    expect(mockAuthService.handleBotWebhook).toHaveBeenCalledWith('secret123', 'telegram', {
      update_id: 1,
    });
    expect(res.acknowledged).toBe(true);
  });
});
