/**
 * SMS Service Interface — Provider-agnostic abstraction for sending SMS messages.
 * Swap implementations (AfroMessage, AWS SNS, Africa's Talking, etc.) without code changes.
 */

export interface SendSmsPayload {
  to: string;       // E.164 format: +251911223344
  message: string;  // SMS body text
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export const SMS_SERVICE = Symbol('SMS_SERVICE');

export interface ISmsService {
  /**
   * Send an SMS message to the given phone number.
   */
  sendSms(payload: SendSmsPayload): Promise<SendSmsResult>;

  /**
   * Send a 6-digit OTP code via SMS.
   * Convenience wrapper around sendSms with a templated message.
   */
  sendOtp(phoneNumber: string, code: string): Promise<SendSmsResult>;
}
