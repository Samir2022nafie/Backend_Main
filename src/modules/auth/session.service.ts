import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '@/core/database/prisma.service';

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  // 30 days session TTL
  private readonly sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string, metadata?: SessionMetadata): Promise<CreatedSession> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);

    await this.prisma.sessions.create({
      data: {
        token,
        user_id: userId,
        expires_at: expiresAt,
        ip_address: metadata?.ipAddress,
        user_agent: metadata?.userAgent,
      },
    });

    return {
      token,
      expiresAt,
    };
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.sessions.deleteMany({
      where: { token },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.sessions.deleteMany({
      where: { user_id: userId },
    });
  }
}
