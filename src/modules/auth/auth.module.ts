import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SmsModule } from '@/core/services/sms/sms.module';
import { EmailModule } from '@/core/services/email/email.module';

@Module({
  imports: [SmsModule, EmailModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService],
  exports: [AuthService, PasswordService, SessionService],
})
export class AuthModule {}
