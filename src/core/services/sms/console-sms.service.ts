/**
 * Console SMS Service — Development-only fallback.
 * Logs OTP codes to the console instead of sending real SMS.
 * Used when live SMS credentials are not configured.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ISmsService, SendSmsPayload, SendSmsResult } from './sms.interface';

@Injectable()
export class ConsoleSmsService implements ISmsService {
  private readonly logger = new Logger(ConsoleSmsService.name);

  async sendSms(payload: SendSmsPayload): Promise<SendSmsResult> {
    this.logger.log(
      `\n┌─────────────────────────────────────────────────────────┐\n` +
      `│ 📱 [DEV SMS] TO: ${payload.to.padEnd(38)} │\n` +
      `│ MESSAGE: ${payload.message.slice(0, 46).padEnd(46)} │\n` +
      `└─────────────────────────────────────────────────────────┘`,
    );
    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }

  async sendOtp(phoneNumber: string, code: string): Promise<SendSmsResult> {
    this.logger.log(
      `\n╔═════════════════════════════════════════════════════════╗\n` +
      `║ 📱 DEV OTP VERIFICATION CODE                           ║\n` +
      `║ PHONE: ${phoneNumber.padEnd(48)} ║\n` +
      `║ CODE:  ${code.padEnd(48)} ║\n` +
      `╚═════════════════════════════════════════════════════════╝\n`,
    );
    return this.sendSms({
      to: phoneNumber,
      message: `Your Nexus verification code is: ${code}`,
    });
  }
}
