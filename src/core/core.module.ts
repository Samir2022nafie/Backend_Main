import { Global, Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module';
import { CaslAbilityFactory } from './security/casl-ability.factory';
import { EncryptionService } from './security/encryption.service';
import { AuthGuard } from './guards/auth.guard';
import { CommunityRoleGuard } from './guards/community-role.guard';
import { CaslPolicyGuard } from './guards/casl-policy.guard';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './interceptors/transform-response.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    CaslAbilityFactory,
    EncryptionService,
    AuthGuard,
    CommunityRoleGuard,
    CaslPolicyGuard,
    AllExceptionsFilter,
    TransformResponseInterceptor,
    LoggingInterceptor,
  ],
  exports: [
    PrismaModule,
    CaslAbilityFactory,
    EncryptionService,
    AuthGuard,
    CommunityRoleGuard,
    CaslPolicyGuard,
    AllExceptionsFilter,
    TransformResponseInterceptor,
    LoggingInterceptor,
  ],
})
export class CoreModule {}
