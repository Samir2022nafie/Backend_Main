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
  private brevoApiKey: string | null = null;
  private resendApiKey: string | null = null;
  private ready: Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.ready = this.initTransporter();
  }

  /**
   * Initialise the email transport mechanism.
   * Priority:
   * 1. Brevo HTTP REST API (port 443 / HTTPS - works without a domain via verified email sender)
   * 2. Resend HTTP REST API (port 443 / HTTPS - works when custom domain is verified)
   * 3. Real SMTP via Nodemailer (local dev)
   * 4. Console logging fallback
   */
  private async initTransporter(): Promise<void> {
    const brevoKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      process.env.BREVO_API_KEY;

    if (brevoKey) {
      this.brevoApiKey = brevoKey.trim();
      this.logger.log('📧 Email service configured with Brevo HTTP API (port 443 / HTTPS, no domain needed)');
      return;
    }

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
   * Helper to parse "Nexus <user@domain.com>" into { name, email }
   */
  private parseSender(rawSender: string): { name: string; email: string } {
    const match = rawSender.match(/(?:(.+?)\s*<)?([^<>@\s]+@[^<>@\s]+)>?/);
    return {
      name: match?.[1]?.trim() || 'Nexus',
      email: match?.[2]?.trim() || rawSender.trim(),
    };
  }

  /**
   * Send an email.
   * Priority:
   * 1. Brevo HTTP API (allows sending to ANY recipient without a domain!)
   * 2. Resend HTTP API
   * 3. SMTP
   * 4. Console log
   */
  async sendMail(options: SendMailOptions): Promise<{ success: boolean }> {
    await this.ready;

    const fromAddress =
      this.configService.get<string>('BREVO_FROM') ||
      process.env.BREVO_FROM ||
      this.configService.get<string>('RESEND_FROM') ||
      process.env.RESEND_FROM ||
      this.configService.get<string>('SMTP_FROM') ||
      process.env.SMTP_FROM ||
      'Nexus <samir2nafie@gmail.com>';

    // 1. Brevo HTTP REST API (No domain required, uses verified email sender, port 443)
    if (this.brevoApiKey) {
      const sender = this.parseSender(fromAddress);

      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': this.brevoApiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: { name: sender.name, email: sender.email },
            to: [{ email: options.to }],
            subject: options.subject,
            htmlContent: options.html || `<p>${options.text || ''}</p>`,
            textContent: options.text,
          }),
        });

        const data = (await response.json()) as any;

        if (!response.ok) {
          throw new Error(data?.message || `Brevo API returned status ${response.status}`);
        }

        this.logger.log(`📧 Email sent to ${options.to} via Brevo API (messageId: ${data?.messageId})`);
        return { success: true };
      } catch (err: any) {
        this.logger.error(`📧 Failed to send email via Brevo to ${options.to}: ${err.message}`);
        return { success: false };
      }
    }

    // 2. Resend HTTP REST API delivery (Firewall-proof, port 443)
    if (this.resendApiKey) {
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

    // 3. SMTP delivery
    if (this.transporter) {
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

    // 4. Console logger fallback
    this.logger.log(`📧 [CONSOLE EMAIL] To: ${options.to} | Subject: ${options.subject}`);
    if (options.text) this.logger.log(`📧 Body: ${options.text}`);
    if (options.html) this.logger.log(`📧 HTML: ${options.html}`);
    return { success: true };
  }
}
