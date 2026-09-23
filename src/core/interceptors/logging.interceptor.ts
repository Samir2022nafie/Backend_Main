import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl, ip, headers, query, body } = req;
    const userAgent = req.get('user-agent') || '';
    const cookies = req.cookies || req.headers?.cookie || null;
    const now = Date.now();

    const env =
      this.configService.get<string>('environment') ||
      process.env.ENVIRONMENT ||
      process.env.NODE_ENV ||
      'dev';
    const isDev = env.toLowerCase() === 'dev' || env.toLowerCase() === 'development';

    if (isDev) {
      this.logger.log(
        `📥 [DEV INCOMING] ${method} ${originalUrl}\n` +
          `  • IP: ${ip}\n` +
          `  • User-Agent: ${userAgent}\n` +
          `  • Query: ${JSON.stringify(query)}\n` +
          `  • Headers: ${JSON.stringify(this.sanitizeHeaders(headers), null, 2)}\n` +
          `  • Cookies: ${JSON.stringify(cookies)}\n` +
          `  • Body: ${JSON.stringify(this.sanitizeBody(body), null, 2)}`,
      );
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const res = context.switchToHttp().getResponse();
          const statusCode = res.statusCode;
          const delay = Date.now() - now;

          if (isDev) {
            this.logger.log(
              `📤 [DEV RESPONSE] ${method} ${originalUrl} [${statusCode}] (${delay}ms)\n` +
                `  • Response Body: ${JSON.stringify(data, null, 2)}`,
            );
          } else {
            this.logger.log(
              `${method} ${originalUrl} ${statusCode} - ${delay}ms - ${ip} ${userAgent}`,
            );
          }
        },
        error: (err) => {
          const delay = Date.now() - now;
          if (isDev) {
            this.logger.error(
              `💥 [DEV ERROR] ${method} ${originalUrl} (${delay}ms)\n` +
                `  • Message: ${err.message}\n` +
                `  • Status: ${err.status || err.statusCode || 500}\n` +
                `  • Stack: ${err.stack || 'None'}`,
            );
          } else {
            this.logger.error(
              `${method} ${originalUrl} ERR ${err.message} - ${delay}ms - ${ip}`,
            );
          }
        },
      }),
    );
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    if (sanitized.authorization) {
      const parts = String(sanitized.authorization).split(' ');
      sanitized.authorization =
        parts.length > 1
          ? `${parts[0]} ${parts[1].substring(0, 6)}...***`
          : '***';
    }
    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const sanitized = Array.isArray(body) ? [...body] : { ...body };

    for (const key of Object.keys(sanitized)) {
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret')
      ) {
        sanitized[key] = '***';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeBody(sanitized[key]);
      }
    }
    return sanitized;
  }
}
