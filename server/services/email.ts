import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private fromAddress: string = "";
  private fromName: string = "LexAI - Marques & Serra Advocacia";

  initialize(): void {
    const user = process.env.ZOHO_MAIL_USER;
    const pass = process.env.ZOHO_MAIL_PASSWORD;

    if (!user || !pass) {
      console.warn("Zoho Mail credentials not configured. Email service disabled.");
      return;
    }

    this.fromAddress = user;

    const config: EmailConfig = {
      host: "smtp.zoho.com",
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
    };

    this.transporter = nodemailer.createTransport(config);
    console.log("Email service initialized with Zoho Mail");
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    if (!this.transporter) {
      return { success: false, error: "Email service not configured" };
    }

    try {
      const mailOptions = {
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(", ") : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(", ") : options.bcc) : undefined,
        replyTo: options.replyTo || this.fromAddress,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", info.messageId);
      
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error("Error sending email:", error);
      return { success: false, error: error.message };
    }
  }

  async sendDeadlineNotification(
    to: string,
    deadlineInfo: {
      caseNumber: string;
      caseTitle: string;
      deadlineDate: Date;
      description: string;
      daysRemaining: number;
    }
  ): Promise<EmailResult> {
    const formattedDate = deadlineInfo.deadlineDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const urgencyColor = deadlineInfo.daysRemaining <= 1 ? "#dc2626" : 
                         deadlineInfo.daysRemaining <= 3 ? "#f59e0b" : "#2563eb";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
    .urgency-badge { display: inline-block; background: ${urgencyColor}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 15px 0; }
    .case-info { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⚖️ LexAI</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Alerta de Prazo Processual</p>
    </div>
    <div class="content">
      <div class="urgency-badge">
        ${deadlineInfo.daysRemaining === 0 ? "⚠️ PRAZO VENCE HOJE!" : 
          deadlineInfo.daysRemaining === 1 ? "⚠️ PRAZO VENCE AMANHÃ!" :
          `📅 ${deadlineInfo.daysRemaining} dias restantes`}
      </div>
      
      <div class="case-info">
        <p style="margin: 0 0 10px 0;"><strong>Processo:</strong> ${deadlineInfo.caseNumber}</p>
        <p style="margin: 0 0 10px 0;"><strong>Título:</strong> ${deadlineInfo.caseTitle}</p>
        <p style="margin: 0 0 10px 0;"><strong>Prazo:</strong> ${deadlineInfo.description}</p>
        <p style="margin: 0;"><strong>Vencimento:</strong> ${formattedDate}</p>
      </div>
      
      <p>Este é um lembrete automático do sistema LexAI sobre o prazo processual acima.</p>
      
      <p>Por favor, tome as providências necessárias para cumprir o prazo dentro do período estabelecido.</p>
    </div>
    <div class="footer">
      <p>Marques & Serra Advocacia</p>
      <p>Este e-mail foi enviado automaticamente pelo LexAI.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
ALERTA DE PRAZO PROCESSUAL - LexAI

${deadlineInfo.daysRemaining === 0 ? "⚠️ PRAZO VENCE HOJE!" : 
  deadlineInfo.daysRemaining === 1 ? "⚠️ PRAZO VENCE AMANHÃ!" :
  `📅 ${deadlineInfo.daysRemaining} dias restantes`}

Processo: ${deadlineInfo.caseNumber}
Título: ${deadlineInfo.caseTitle}
Prazo: ${deadlineInfo.description}
Vencimento: ${formattedDate}

Este é um lembrete automático do sistema LexAI.

---
Marques & Serra Advocacia
    `;

    return this.sendEmail({
      to,
      subject: `[LexAI] Prazo: ${deadlineInfo.caseNumber} - ${deadlineInfo.daysRemaining === 0 ? "VENCE HOJE!" : `${deadlineInfo.daysRemaining} dias`}`,
      html,
      text,
    });
  }

  async sendMovementNotification(
    to: string,
    movementInfo: {
      caseNumber: string;
      caseTitle: string;
      movementType: string;
      movementDate: Date;
      description: string;
      requiresAction: boolean;
    }
  ): Promise<EmailResult> {
    const formattedDate = movementInfo.movementDate.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const actionBadge = movementInfo.requiresAction 
      ? '<span style="display: inline-block; background: #dc2626; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; margin-left: 10px;">Requer Ação</span>'
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
    .movement-type { display: inline-block; background: #dbeafe; color: #1e40af; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 15px 0; }
    .case-info { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .description { background: #fefce8; border-left: 4px solid #eab308; padding: 15px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⚖️ LexAI</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Nova Movimentação Processual</p>
    </div>
    <div class="content">
      <div>
        <span class="movement-type">📋 ${movementInfo.movementType}</span>
        ${actionBadge}
      </div>
      
      <div class="case-info">
        <p style="margin: 0 0 10px 0;"><strong>Processo:</strong> ${movementInfo.caseNumber}</p>
        <p style="margin: 0 0 10px 0;"><strong>Título:</strong> ${movementInfo.caseTitle}</p>
        <p style="margin: 0;"><strong>Data:</strong> ${formattedDate}</p>
      </div>
      
      <div class="description">
        <strong>Descrição da Movimentação:</strong>
        <p style="margin: 10px 0 0 0;">${movementInfo.description}</p>
      </div>
      
      ${movementInfo.requiresAction ? '<p style="color: #dc2626;"><strong>⚠️ Esta movimentação requer sua atenção e ação.</strong></p>' : ''}
    </div>
    <div class="footer">
      <p>Marques & Serra Advocacia</p>
      <p>Este e-mail foi enviado automaticamente pelo LexAI.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
NOVA MOVIMENTAÇÃO PROCESSUAL - LexAI

Tipo: ${movementInfo.movementType}${movementInfo.requiresAction ? " [REQUER AÇÃO]" : ""}

Processo: ${movementInfo.caseNumber}
Título: ${movementInfo.caseTitle}
Data: ${formattedDate}

Descrição:
${movementInfo.description}

${movementInfo.requiresAction ? "⚠️ Esta movimentação requer sua atenção e ação." : ""}

---
Marques & Serra Advocacia
    `;

    return this.sendEmail({
      to,
      subject: `[LexAI] ${movementInfo.movementType}: ${movementInfo.caseNumber}${movementInfo.requiresAction ? " - AÇÃO NECESSÁRIA" : ""}`,
      html,
      text,
    });
  }

  async verifyConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.transporter) {
      return { success: false, error: "Email service not configured" };
    }

    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();
