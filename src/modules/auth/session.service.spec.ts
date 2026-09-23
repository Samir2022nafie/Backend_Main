import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { PrismaService } from '@/core/database/prisma.service';

describe('SessionService', () => {
  let service: SessionService;

  const mockPrismaService = {
    sessions: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a 64-char crypto session token and store in DB', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    mockPrismaService.sessions.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.createSession(userId, {
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.token).toBeDefined();
    expect(result.token.length).toBe(64); // 32 bytes hex
    expect(result.expiresAt).toBeDefined();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(mockPrismaService.sessions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: result.token,
        user_id: userId,
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0',
      }),
    });
  });

  it('should revoke a session by token', async () => {
    mockPrismaService.sessions.deleteMany.mockResolvedValueOnce({ count: 1 });

    await service.revokeSession('dummy-token');

    expect(mockPrismaService.sessions.deleteMany).toHaveBeenCalledWith({
      where: { token: 'dummy-token' },
    });
  });

  it('should revoke all sessions for a user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    mockPrismaService.sessions.deleteMany.mockResolvedValueOnce({ count: 3 });

    await service.revokeAllUserSessions(userId);

    expect(mockPrismaService.sessions.deleteMany).toHaveBeenCalledWith({
      where: { user_id: userId },
    });
  });
});
