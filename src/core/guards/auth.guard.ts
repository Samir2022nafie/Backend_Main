import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { METADATA_KEYS } from '../common/constants';
import { ErrorCode } from '../common/enums';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      METADATA_KEYS.IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
      });
    }

    try {
      // Look up session in DB
      const session = await this.prisma.sessions.findUnique({
        where: { token },
        include: {
          user: true,
        },
      });

      if (!session || session.expires_at < new Date()) {
        if (isPublic) {
          return true;
        }
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid or expired session',
        });
      }

      // Check soft-delete
      if (session.user.deleted_at !== null) {
        if (isPublic) {
          return true;
        }
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Account has been deactivated',
        });
      }

      // Attach full user object and session to request
      (request as any).user = session.user;
      (request as any).session = session;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required',
      });
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
