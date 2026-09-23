import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { APP_CONSTANTS } from './core/common/constants';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './core/interceptors/transform-response.interceptor';
import { AuthGuard } from './core/guards/auth.guard';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global routing prefix: api/v1
  app.setGlobalPrefix(APP_CONSTANTS.API_PREFIX);

  // CORS setup
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Global filter, interceptors, and guards from DI container
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.useGlobalInterceptors(
    app.get(LoggingInterceptor),
    app.get(TransformResponseInterceptor),
  );
  app.useGlobalGuards(app.get(AuthGuard));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  await app.listen(port);
  logger.log(`Backend running on: http://localhost:${port}/${APP_CONSTANTS.API_PREFIX}`);
}

bootstrap();
