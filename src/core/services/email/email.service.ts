import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private resendApiKey: string | null = null;
  private ready: Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.ready = this.initTransporter();
  }

  /**
   * Initialise the email transport mechanism.
   * Priority:
   * 1. Resend HTTP REST API (port 443 / HTTPS - works on Render free tier without port blocking)
   * 2. Real SMTP via Nodemailer (used for local development or unblocked SMTP environments)
   * 3. Console logging fallback (when no credentials are provided)
   */
  private async initTransporter(): Promise<void> {
    const resendKey =
      this.configService.get<string>('RESEND_API_KEY') ||
      process.env.RESEND_API_KEY;

    if (resendKey) {
      this.resendApiKey = resendKey.trim();
      this.logger.log('📧 Email service configured with Resend HTTP API (port 443 / HTTPS)');
      return;
    }

    const smtpHost = this.configService.get<string>('SMTP_HOST') || process.env.SMTP_HOST;
    const smtpPort = this.configService.get<number>('SMTP_PORT') || Number(process.env.SMTP_PORT) || 587;
    const smtpUser = this.configService.get<string>('SMTP_USER') || process.env.SMTP_USER;
    const smtpPass = this.configService.get<string>('SMTP_PASS') || process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
      try {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        this.logger.log(`📧 Email service configured with SMTP host: ${smtpHost} (${smtpUser})`);
      } catch (err: any) {
        this.logger.warn(`📧 Could not initialize SMTP transporter: ${err.message}. Falling back to console.`);
        this.transporter = null;
      }
    } else {
      this.logger.log(`📧 No email credentials configured. Outgoing emails will be logged to console.`);
      this.transporter = null;
    }
  }

  /**
   * Send an email.
   * Uses Resend HTTP API if RESEND_API_KEY is configured,
   * otherwise falls back to SMTP or console logging.
   */
  async sendMail(options: SendMailOptions): Promise<{ success: boolean }> {
    await this.ready;

    // 1. Resend HTTP REST API delivery (Firewall-proof, port 443)
    if (this.resendApiKey) {
      const fromAddress =
        this.configService.get<string>('RESEND_FROM') ||
        process.env.RESEND_FROM ||
        this.configService.get<string>('SMTP_FROM') ||
        process.env.SMTP_FROM ||
        'Nexus <onboarding@resend.dev>';

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [options.to],
            subject: options.subject,
            text: options.text,
            html: options.html,
          }),
        });

        const data = (await response.json()) as any;

        if (!response.ok) {
          throw new Error(data?.message || `Resend API returned status ${response.status}`);
        }

        this.logger.log(`📧 Email sent to ${options.to} via Resend API (id: ${data?.id})`);
        return { success: true };
      } catch (err: any) {
        this.logger.error(`📧 Failed to send email via Resend to ${options.to}: ${err.message}`);
        return { success: false };
      }
    }

    // 2. SMTP delivery
    if (this.transporter) {
      const fromAddress =
        this.configService.get<string>('SMTP_FROM') ||
        process.env.SMTP_FROM ||
        'Nexus <noreply@nexus.app>';

      try {
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });

        this.logger.log(`📧 Email sent to ${options.to} via SMTP (messageId: ${info.messageId})`);
        return { success: true };
      } catch (err: any) {
        this.logger.error(`📧 Failed to send email via SMTP to ${options.to}: ${err.message}`);
        return { success: false };
      }
    }

    // 3. Console logger fallback
    this.logger.log(`📧 [CONSOLE EMAIL] To: ${options.to} | Subject: ${options.subject}`);
    if (options.text) this.logger.log(`📧 Body: ${options.text}`);
    if (options.html) this.logger.log(`📧 HTML: ${options.html}`);
    return { success: true };
  }
}
