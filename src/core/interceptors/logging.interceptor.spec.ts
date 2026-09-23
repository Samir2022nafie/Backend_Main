import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { ConfigService } from '@nestjs/config';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockContext = (isDev = true, body = {}, headers = {}) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/auth/login',
          ip: '127.0.0.1',
          get: (header: string) => (header === 'user-agent' ? 'JestTest' : undefined),
          headers: {
            authorization: 'Bearer 1234567890abcdef',
            ...headers,
          },
          query: { redirect: 'home' },
          body,
          cookies: { session_id: 'test_cookie' },
        }),
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log detailed request and response in dev mode with sanitized sensitive fields', (done) => {
    mockConfigService.get.mockReturnValue('dev');
    const loggerLogSpy = jest.spyOn((interceptor as any).logger, 'log');

    const context = createMockContext(true, {
      identifier: 'john@example.com',
      password: 'SuperSecretPassword',
    });

    const callHandler: CallHandler = {
      handle: () => of({ success: true, data: { user: 'test' } }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({ success: true, data: { user: 'test' } });
        expect(loggerLogSpy).toHaveBeenCalledTimes(2);

        // Check incoming request log
        const incomingLog = loggerLogSpy.mock.calls[0][0];
        expect(incomingLog).toContain('📥 [DEV INCOMING]');
        expect(incomingLog).toContain('john@example.com');
        expect(incomingLog).toContain('***'); // password sanitized
        expect(incomingLog).not.toContain('SuperSecretPassword');

        // Check response log
        const responseLog = loggerLogSpy.mock.calls[1][0];
        expect(responseLog).toContain('📤 [DEV RESPONSE]');
        expect(responseLog).toContain('[200]');
        expect(responseLog).toContain('"user": "test"');

        done();
      },
    });
  });

  it('should log error details in dev mode when error occurs', (done) => {
    mockConfigService.get.mockReturnValue('dev');
    const loggerErrorSpy = jest.spyOn((interceptor as any).logger, 'error');

    const context = createMockContext(true);
    const callHandler: CallHandler = {
      handle: () => throwError(() => new Error('Simulated internal failure')),
    };

    interceptor.intercept(context, callHandler).subscribe({
      error: (err) => {
        expect(err.message).toBe('Simulated internal failure');
        expect(loggerErrorSpy).toHaveBeenCalled();
        const errorLog = loggerErrorSpy.mock.calls[0][0];
        expect(errorLog).toContain('💥 [DEV ERROR]');
        expect(errorLog).toContain('Simulated internal failure');
        done();
      },
    });
  });

  it('should log concise message when environment is production', (done) => {
    mockConfigService.get.mockReturnValue('production');
    const loggerLogSpy = jest.spyOn((interceptor as any).logger, 'log');

    const context = createMockContext(false);
    const callHandler: CallHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler).subscribe({
      next: () => {
        expect(loggerLogSpy).toHaveBeenCalledTimes(1);
        const conciseLog = loggerLogSpy.mock.calls[0][0];
        expect(conciseLog).toContain('POST /api/v1/auth/login 200');
        expect(conciseLog).not.toContain('📥 [DEV INCOMING]');
        done();
      },
    });
  });
});
