import nodemailer from 'nodemailer';
import type { Company } from '@shared/schema';

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const config = this.getConfig();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
      console.warn('⚠️ [EMAIL] SMTP não configurado. Emails não serão enviados.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure, // true for 465, false for other ports
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword,
        },
      });

      console.log('✅ [EMAIL] Transporter SMTP configurado com sucesso');
    } catch (error) {
      console.error('❌ [EMAIL] Erro ao configurar SMTP:', error);
    }
  }

  private getConfig(): EmailConfig {
    return {
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpUser: process.env.SMTP_USER || '',
      smtpPassword: process.env.SMTP_PASSWORD || '',
      smtpSecure: process.env.SMTP_SECURE === 'true',
      fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@example.com',
      fromName: process.env.SMTP_FROM_NAME || 'Sistema Multi-Empresa',
    };
  }

  async sendCustomEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      console.warn('⚠️ [EMAIL] Transporter não configurado. Email não enviado.');
      return false;
    }

    const config = this.getConfig();

    try {
      await this.transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to,
        subject,
        html,
      });

      console.log(`✅ [EMAIL] Email customizado enviado para ${to}`);
      return true;
    } catch (error) {
      console.error('❌ [EMAIL] Erro ao enviar email customizado:', error);
      return false;
    }
  }
}

// Singleton instance
let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
