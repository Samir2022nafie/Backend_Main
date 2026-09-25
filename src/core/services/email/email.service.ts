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
   * - If SMTP_HOST is configured → use real SMTP (Gmail App Password, Brevo, SendGrid, etc.)
   * - Otherwise → create an Ethereal test account for local dev (emails viewable in browser)
   */
  private async initTransporter(): Promise<void> {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort || 587,
        secure: (smtpPort || 587) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      this.logger.log(`📧 Email service configured with SMTP host: ${smtpHost}`);
    } else {
      // Create Ethereal test account for dev
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });

        this.logger.log(
          `📧 [DEV] Email service using Ethereal test account: ${testAccount.user}`,
        );
        this.logger.log(
          `📧 [DEV] View sent emails at: https://ethereal.email/login (user: ${testAccount.user}, pass: ${testAccount.pass})`,
        );
      } catch (err) {
        this.logger.warn(`📧 [DEV] Could not create Ethereal test account. Emails will be logged to console only.`);
        this.transporter = null;
      }
    }
  }

  /**
   * Send an email. Falls back to console logging if no transporter is available.
   */
  async sendMail(options: SendMailOptions): Promise<{ success: boolean; previewUrl?: string }> {
    await this.ready;

    const fromAddress = this.configService.get<string>('SMTP_FROM') || 'Nexus <noreply@nexus.app>';

    if (!this.transporter) {
      this.logger.log(`📧 [CONSOLE FALLBACK] To: ${options.to} | Subject: ${options.subject}`);
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

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        this.logger.log(`📧 [DEV] Preview email: ${previewUrl}`);
      } else {
        this.logger.log(`📧 Email sent to ${options.to} (messageId: ${info.messageId})`);
      }

      return {
        success: true,
        previewUrl: previewUrl || undefined,
      };
    } catch (err: any) {
      this.logger.error(`📧 Failed to send email to ${options.to}: ${err.message}`);
      return { success: false };
    }
  }
}
