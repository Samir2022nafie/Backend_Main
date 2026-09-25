/**
 * AfroMessage SMS Service — Ethiopian SMS Gateway Provider.
 * Works natively in Ethiopia with Ethio Telecom and Safaricom.
 * Requires NO credit card — can be funded with Telebirr / CBE Birr.
 *
 * Config requirements:
 *   AFROMESSAGE_TOKEN  — Bearer token from https://afromessage.com
 *   AFROMESSAGE_SENDER — Optional approved sender name (defaults to AfroMessage)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsService, SendSmsPayload, SendSmsResult } from './sms.interface';

@Injectable()
export class AfroMessageSmsService implements ISmsService {
  private readonly logger = new Logger(AfroMessageSmsService.name);
  private readonly token: string;
  private readonly senderName?: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('AFROMESSAGE_TOKEN') || '';
    this.senderName = this.configService.get<string>('AFROMESSAGE_SENDER') || undefined;

    if (!this.token) {
      this.logger.warn(
        '⚠️  AfroMessage token not configured. Set AFROMESSAGE_TOKEN in .env to send SMS in Ethiopia.',
      );
    }
  }

  async sendSms(payload: SendSmsPayload): Promise<SendSmsResult> {
    if (!this.token) {
      return {
        success: false,
        error: 'AfroMessage token is not configured',
      };
    }

    try {
      // Normalize Ethiopian phone number format if needed
      // AfroMessage accepts both +2519... and 09...
      const recipient = payload.to.trim();

      const url = new URL('https://api.afromessage.com/api/send');
      url.searchParams.append('to', recipient);
      url.searchParams.append('message', payload.message);
      if (this.senderName) {
        url.searchParams.append('sender', this.senderName);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || (data && data.acknowledge !== 'success')) {
        const errorMsg =
          (Array.isArray(data?.response?.errors) && data.response.errors.join(' | ')) ||
          data?.message ||
          data?.error ||
          `HTTP ${response.status}`;
        this.logger.error(`❌ [AfroMessage SMS] Delivery failed to ${recipient}: ${errorMsg}`);
        return {
          success: false,
          error: errorMsg,
        };
      }

      this.logger.log(`📱 [AfroMessage SMS] Sent to ${recipient} (status: ${data?.acknowledge || 'success'})`);
      return {
        success: true,
        messageId: data?.response?.message_id || `afro-${Date.now()}`,
      };
    } catch (err: any) {
      this.logger.error(`AfroMessage network error: ${err.message}`, err.stack);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async sendOtp(phoneNumber: string, code: string): Promise<SendSmsResult> {
    return this.sendSms({
      to: phoneNumber,
      message: `Your Nexus verification code is: ${code}. Do not share this code with anyone.`,
    });
  }
}
