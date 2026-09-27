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
  private ready: Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.ready = this.initTransporter();
  }

  /**
   * Initialise the SMTP transporter.
   * - Uses real SMTP (Gmail App Password, Brevo, SendGrid, etc.) when configured.
   * - Falls back to console logging when SMTP is not configured.
   */
  private async initTransporter(): Promise<void> {
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
      this.logger.log(`📧 No SMTP credentials configured. Outgoing emails will be logged to console.`);
      this.transporter = null;
    }
  }

  /**
   * Send an email. Falls back to console logging if no transporter is available.
   */
  async sendMail(options: SendMailOptions): Promise<{ success: boolean }> {
    await this.ready;

    const fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      process.env.SMTP_FROM ||
      'Nexus <noreply@nexus.app>';

    if (!this.transporter) {
      this.logger.log(`📧 [CONSOLE EMAIL] To: ${options.to} | Subject: ${options.subject}`);
      if (options.text) this.logger.log(`📧 Body: ${options.text}`);
      if (options.html) this.logger.log(`📧 HTML: ${options.html}`);
      return { success: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      this.logger.log(`📧 Email sent to ${options.to} (messageId: ${info.messageId})`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`📧 Failed to send email to ${options.to}: ${err.message}`);
      return { success: false };
    }
  }
}
