/**
 * SMS Module — Factory-based provider selection.
 * Uses AfroMessage for SMS delivery when AFROMESSAGE_TOKEN is configured,
 * and falls back to ConsoleSmsService for local development.
 */
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_SERVICE } from './sms.interface';
import { AfroMessageSmsService } from './afromessage-sms.service';
import { ConsoleSmsService } from './console-sms.service';

@Global()
@Module({
  providers: [
    {
      provide: SMS_SERVICE,
      useFactory: (configService: ConfigService) => {
        // 1. Ethiopian Local SMS (AfroMessage — Telebirr / CBE Birr, no credit card)
        const afroToken = configService.get<string>('AFROMESSAGE_TOKEN');
        if (afroToken && afroToken.trim().length > 0) {
          return new AfroMessageSmsService(configService);
        }

        // 2. Local Development Fallback (Terminal logger + Dev OTP)
        return new ConsoleSmsService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [SMS_SERVICE],
})
export class SmsModule {}
