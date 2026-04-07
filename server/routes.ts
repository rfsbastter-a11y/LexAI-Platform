import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { storage } from "./storage";
import { db, pool as dbPool } from "./db";
import { eq, and, isNull, isNotNull, inArray, gte } from "drizzle-orm";
import { caseMovements, cases } from "@shared/schema";
import { requireAuth } from "./auth";
import { escavadorService } from "./services/escavador";
import { aiService } from "./services/ai";
import { emailService } from "./services/email";
import { zohoMailService } from "./services/zohoMail";
import { legalSearchService } from "./services/legalSearch";
import { generateStudioPiece } from "./services/studioGenerate";
import { 
  insertClientSchema, insertContractSchema, insertCaseSchema, insertDeadlineSchema,
  insertDocumentTemplateSchema, insertGeneratedPieceSchema,
  insertAgendaEventSchema, insertWhatsappConfigSchema, insertWhatsappScheduleSchema,
  insertProspectionPlanSchema, insertProspectionLeadSchema, insertProspectionMessageSchema, insertProspectionNetworkSchema,
  insertMeetingSchema, insertMeetingParticipantSchema, insertMeetingUtteranceSchema, insertMeetingChatMessageSchema
} from "@shared/schema";
import { generateMeetingInsights, generateExecutiveSummary, meetingChat } from "./services/meetingAI";
import { z } from "zod";
import rateLimit from "express-rate-limit";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function getTenantId(req: Request): number {
  return req.tokenUser?.tenantId || req.session?.user?.tenantId || 1;
}

function getUserId(req: Request): number {
  return req.tokenUser?.id || req.session?.user?.id || 0;
}

const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Limite de pesquisas atingido. Tente novamente em 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

const PARTNER_SIGNATURES: Record<string, { name: string; oab: string }> = {
  ronald: { name: "Dr. Ronald Serra", oab: "OAB/DF 23.947" },
  pedro: { name: "Dr. Pedro Cesar N. F. Marques de Sousa", oab: "OAB/DF 57.058" },
};

export function getSignatureForPartner(signer: string = "pedro"): string {
  const partner = PARTNER_SIGNATURES[signer] || PARTNER_SIGNATURES.ronald;
  return `<div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #1a365d; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #333;">
  <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
    <tr>
      <td style="padding-right: 15px; border-right: 2px solid #c9a96e;">
        <div style="font-size: 16px; font-weight: bold; color: #1a365d;">Marques &amp; Serra</div>
        <div style="font-size: 11px; color: #c9a96e; text-transform: uppercase; letter-spacing: 1px;">Sociedade de Advogados</div>
      </td>
      <td style="padding-left: 15px;">
        <div style="font-weight: 600; color: #1a365d;">${partner.name}</div>
        <div style="font-size: 12px; color: #666;">${partner.oab}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">
          <span>&#128222; +55 (61) 99811-2434</span><br>
          <span>&#9993; contato@marqueseserra.adv.br</span><br>
          <span>&#128205; SAUS Quadra 1 BL. M Sala 1301 - Edif&iacute;cio Libertas - Bras&iacute;lia-DF</span>
        </div>
      </td>
    </tr>
  </table>
  <div style="margin-top: 8px; font-size: 10px; color: #999; font-style: italic;">
    Esta mensagem pode conter informa&ccedil;&otilde;es confidenciais e privilegiadas. Se voc&ecirc; n&atilde;o &eacute; o destinat&aacute;rio pretendido, por favor, notifique o remetente imediatamente e delete esta mensagem.
  </div>
</div>`;
}

let emailSignatureHtml = getSignatureForPartner("pedro");

let emailTemplateNextId = 6;
let emailTemplates: { id: number; name: string; subject: string; bodyHtml: string }[] = [
  {
    id: 1,
    name: "Cobrança",
    subject: "Cobrança - Fatura {{numero_fatura}}",
    bodyHtml: `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Prezado(a) <strong>{{nome_cliente}}</strong>,</p>
  <p>Vimos, respeitosamente, informar que a fatura de nº <strong>{{numero_fatura}}</strong>, no valor de <strong>R$ {{valor}}</strong>, com vencimento em <strong>{{data_vencimento}}</strong>, encontra-se em aberto em nossos registros.</p>
  <p>Solicitamos a gentileza de providenciar a regularização do pagamento no prazo de <strong>5 (cinco) dias úteis</strong> a contar do recebimento desta comunicação, evitando assim a adoção de medidas cabíveis para a cobrança do débito.</p>
  <p>Caso o pagamento já tenha sido efetuado, pedimos que desconsidere esta mensagem e nos envie o comprovante para fins de baixa em nosso sistema.</p>
  <p>Permanecemos à disposição para eventuais esclarecimentos.</p>
  <p>Atenciosamente,</p>
  <p><strong>Marques &amp; Serra Sociedade de Advogados</strong></p>
</div>`,
  },
  {
    id: 2,
    name: "Notificação Extrajudicial",
    subject: "Notificação Extrajudicial - {{assunto}}",
    bodyHtml: `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
  <p style="text-align: center; font-weight: bold; font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 10px;">Notificação Extrajudicial</p>
  <p><strong>NOTIFICANTE:</strong> {{nome_notificante}}</p>
  <p><strong>NOTIFICADO(A):</strong> {{nome_notificado}}</p>
  <p><strong>ASSUNTO:</strong> {{assunto}}</p>
  <p>Prezado(a) Sr(a). <strong>{{nome_notificado}}</strong>,</p>
  <p>Pelo presente instrumento, e na qualidade de advogados constituídos pelo(a) <strong>NOTIFICANTE</strong> acima qualificado(a), vimos, com fundamento no artigo 726 do Código de Processo Civil, NOTIFICAR Vossa Senhoria acerca dos seguintes fatos:</p>
  <p>{{descricao_fatos}}</p>
  <p>Diante do exposto, NOTIFICAMOS Vossa Senhoria para que, no prazo de <strong>{{prazo_dias}} dias</strong>, adote as providências necessárias ao cumprimento da obrigação acima descrita, sob pena de adoção das medidas judiciais cabíveis, sem necessidade de novo aviso.</p>
  <p>A presente notificação serve como marco interruptivo da prescrição, nos termos do artigo 202, inciso VI, do Código Civil.</p>
  <p>Atenciosamente,</p>
  <p><strong>Marques &amp; Serra Sociedade de Advogados</strong><br>OAB/DF 23.947</p>
</div>`,
  },
  {
    id: 3,
    name: "Confirmação de Audiência",
    subject: "Confirmação de Audiência - Processo {{numero_processo}}",
    bodyHtml: `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Prezado(a) <strong>{{nome_cliente}}</strong>,</p>
  <p>Informamos que foi designada audiência nos autos do processo nº <strong>{{numero_processo}}</strong>, conforme detalhes abaixo:</p>
  <table style="border-collapse: collapse; margin: 15px 0; width: 100%;">
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold; width: 180px;">Tipo de Audiência</td>
      <td style="padding: 8px 12px; border: 1px solid #ddd;">{{tipo_audiencia}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Data e Horário</td>
      <td style="padding: 8px 12px; border: 1px solid #ddd;">{{data_audiencia}} às {{horario_audiencia}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Local / Vara</td>
      <td style="padding: 8px 12px; border: 1px solid #ddd;">{{local_audiencia}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Modalidade</td>
      <td style="padding: 8px 12px; border: 1px solid #ddd;">{{modalidade}}</td>
    </tr>
  </table>
  <p><strong>Orientações importantes:</strong></p>
  <ul>
    <li>Compareça com pelo menos 15 minutos de antecedência.</li>
    <li>Leve documento de identidade original com foto e CPF.</li>
    <li>Caso a audiência seja virtual, o link de acesso será enviado previamente.</li>
  </ul>
  <p>Solicitamos a confirmação do recebimento desta mensagem e de sua presença na data designada.</p>
  <p>Atenciosamente,</p>
  <p><strong>Marques &amp; Serra Sociedade de Advogados</strong></p>
</div>`,
  },
  {
    id: 4,
    name: "Envio de Documentos",
    subject: "Documentos - {{assunto}}",
    bodyHtml: `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Prezado(a) <strong>{{nome_destinatario}}</strong>,</p>
  <p>Encaminhamos em anexo os documentos referentes a <strong>{{assunto}}</strong>, conforme solicitado/necessário para andamento processual.</p>
  <p><strong>Documentos anexos:</strong></p>
  <ul>
    <li>{{documento_1}}</li>
    <li>{{documento_2}}</li>
    <li>{{documento_3}}</li>
  </ul>
  <p>Solicitamos a gentileza de confirmar o recebimento dos documentos acima listados. Em caso de divergência ou necessidade de documentação complementar, favor entrar em contato com nosso escritório.</p>
  <p>Os documentos anexos possuem caráter confidencial e são destinados exclusivamente ao destinatário indicado.</p>
  <p>Atenciosamente,</p>
  <p><strong>Marques &amp; Serra Sociedade de Advogados</strong></p>
</div>`,
  },
  {
    id: 5,
    name: "Resposta a Intimação",
    subject: "RE: Intimação - Processo {{numero_processo}}",
    bodyHtml: `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Prezado(a) <strong>{{nome_cliente}}</strong>,</p>
  <p>Informamos que recebemos a intimação referente ao processo nº <strong>{{numero_processo}}</strong>, expedida pelo(a) <strong>{{orgao_expedidor}}</strong>, com o seguinte teor:</p>
  <div style="background: #f8f9fa; border-left: 3px solid #1a365d; padding: 12px 16px; margin: 15px 0; font-style: italic;">
    {{resumo_intimacao}}
  </div>
  <p><strong>Prazo:</strong> {{prazo}} dias, com vencimento em <strong>{{data_vencimento_prazo}}</strong>.</p>
  <p><strong>Providências a serem adotadas:</strong></p>
  <p>{{providencias}}</p>
  <p>Caso necessário, entraremos em contato para solicitar documentos ou informações adicionais para a elaboração da manifestação cabível dentro do prazo legal.</p>
  <p>Permanecemos à disposição para esclarecimentos.</p>
  <p>Atenciosamente,</p>
  <p><strong>Marques &amp; Serra Sociedade de Advogados</strong></p>
</div>`,
  },
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use('/api', (req, res, next) => {
    if (req.path === '/admin/sync-receive') return next();
    return requireAuth(req, res, next);
  });
  
  // ==================== DASHBOARD ====================
  app.get("/api/dashboard/stats", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const stats = await storage.getDashboardStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/full", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const now = new Date();

      const allCases = await storage.getCasesByTenant(tenantId);
      const allContracts = await storage.getContractsByTenant(tenantId);
      const allInvoices = await storage.getInvoicesByTenant(tenantId);
      const allDeadlines = await storage.getDeadlinesByTenant(tenantId);
      const allClients = await storage.getClientsByTenant(tenantId);
      const aiLogs = await storage.getAiGenerationLogs(tenantId);
      const generatedPieces = await storage.getGeneratedPiecesByTenant(tenantId);

      const activeCases = allCases.filter(c => c.status === "ativo" || c.status === "em_andamento");
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newCasesThisMonth = allCases.filter(c => new Date(c.createdAt) >= startOfMonth).length;

      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const pendingDeadlines = allDeadlines.filter(d => d.status === "pendente" && new Date(d.dueDate) >= now);
      const deadlines7Days = pendingDeadlines.filter(d => new Date(d.dueDate) <= sevenDaysFromNow);
      const urgentDeadlines = pendingDeadlines.filter(d => {
        const diff = new Date(d.dueDate).getTime() - now.getTime();
        return diff <= 3 * 24 * 60 * 60 * 1000;
      });

      const intimacaoDeadlines = await db.select({
        movementId: caseMovements.id,
        caseId: caseMovements.caseId,
        aiDeadlineDate: caseMovements.aiDeadlineDate,
        aiDeadlineStatus: caseMovements.aiDeadlineStatus,
        aiDeadlineSummary: caseMovements.aiDeadlineSummary,
        caseNumber: cases.caseNumber,
        caseTitle: cases.title,
      }).from(caseMovements)
        .innerJoin(cases, eq(caseMovements.caseId, cases.id))
        .where(and(
          eq(cases.tenantId, tenantId),
          isNotNull(caseMovements.aiDeadlineDate),
          isNull(caseMovements.acknowledgedAt)
        ));

      const audiencias = await storage.getAgendaEventsByRange(tenantId,
        now.toISOString().split("T")[0],
        new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      );
      const audienciasCount = audiencias.filter(e => e.type === "Audiência").length;

      const totalBilled = allInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
      const paidInvoices = allInvoices.filter(inv => inv.status === "pago");
      const totalPaid = paidInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount || inv.amount || 0), 0);

      const overdueInvoices = allInvoices.filter(inv => {
        return (inv.status === "emitida" || inv.status === "pendente" || inv.status === "em aberto") &&
          new Date(inv.dueDate) < now;
      }).map(inv => {
        const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
        const client = allClients.find(c => c.id === inv.clientId);
        return {
          id: inv.id,
          clientId: inv.clientId,
          clientName: client?.name || "Cliente desconhecido",
          invoiceNumber: inv.invoiceNumber,
          amount: Number(inv.amount),
          dueDate: inv.dueDate,
          daysOverdue,
        };
      }).sort((a, b) => b.daysOverdue - a.daysOverdue);

      const pendingInvoicesAmount = allInvoices
        .filter(inv => inv.status !== "pago" && inv.status !== "cancelada")
        .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiringContracts = allContracts.filter(c => {
        if (!c.endDate) return false;
        const end = new Date(c.endDate);
        return end >= now && end <= thirtyDaysFromNow && c.status === "ativo";
      }).map(c => {
        const client = allClients.find(cl => cl.id === c.clientId);
        const daysToExpire = Math.ceil((new Date(c.endDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          clientId: c.clientId,
          clientName: client?.name || "Cliente desconhecido",
          type: c.type,
          endDate: c.endDate,
          daysToExpire,
          monthlyValue: Number(c.monthlyValue || 0),
        };
      }).sort((a, b) => a.daysToExpire - b.daysToExpire);

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const staleCases = activeCases.filter(c => {
        const lastSync = c.datajudLastSync ? new Date(c.datajudLastSync) : null;
        const created = new Date(c.createdAt);
        const reference = lastSync || created;
        return reference < thirtyDaysAgo;
      }).map(c => {
        const lastSync = c.datajudLastSync ? new Date(c.datajudLastSync) : null;
        const created = new Date(c.createdAt);
        const reference = lastSync || created;
        const daysSinceMovement = Math.floor((now.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24));
        const client = allClients.find(cl => cl.id === c.clientId);
        return {
          id: c.id,
          title: c.title,
          caseNumber: c.caseNumber,
          court: c.court,
          clientName: client?.name || "Cliente desconhecido",
          daysSinceMovement,
          staleness: daysSinceMovement > 90 ? "critical" : daysSinceMovement > 60 ? "warning" : "info",
        };
      }).sort((a, b) => b.daysSinceMovement - a.daysSinceMovement);

      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weeklyAiLogs = aiLogs.filter(l => new Date(l.createdAt) >= oneWeekAgo);
      const weeklyPieces = generatedPieces.filter(p => new Date(p.createdAt) >= oneWeekAgo);
      const weeklyClientsCreated = allClients.filter(c => new Date(c.createdAt) >= oneWeekAgo).length;
      const weeklyCasesCreated = allCases.filter(c => new Date(c.createdAt) >= oneWeekAgo).length;

      const avgTimePerPiece = 45;
      const avgTimePerAiInteraction = 10;
      const estimatedMinutesSaved = (weeklyPieces.length * avgTimePerPiece) + (weeklyAiLogs.length * avgTimePerAiInteraction);
      const hoursSaved = Math.round(estimatedMinutesSaved / 60 * 10) / 10;

      const interventions: { id: string; type: string; label: string; desc: string; action: string; actionHref?: string; severity: string }[] = [];

      overdueInvoices.slice(0, 3).forEach(inv => {
        interventions.push({
          id: `inv-${inv.id}`,
          type: "FIN",
          label: "Inadimplência",
          desc: `Fatura ${inv.invoiceNumber} de ${inv.clientName} pendente há ${inv.daysOverdue} dias (R$ ${inv.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`,
          action: "Cobrar",
          actionHref: `/billing`,
          severity: inv.daysOverdue > 30 ? "critical" : "warning",
        });
      });

      urgentDeadlines.slice(0, 3).forEach(d => {
        const relatedCase = allCases.find(c => c.id === d.caseId);
        interventions.push({
          id: `dl-${d.id}`,
          type: "JUR",
          label: "Prazo Fatal",
          desc: `${d.title}${relatedCase ? ` (${relatedCase.caseNumber})` : ""} vence ${new Date(d.dueDate).toLocaleDateString("pt-BR")}.`,
          action: "Ver Prazo",
          actionHref: `/cases`,
          severity: "critical",
        });
      });

      expiringContracts.filter(c => c.daysToExpire <= 7).slice(0, 2).forEach(c => {
        interventions.push({
          id: `ct-${c.id}`,
          type: "CTR",
          label: "Contrato Vencendo",
          desc: `Contrato ${c.type} de ${c.clientName} vence em ${c.daysToExpire} dias.`,
          action: "Renovar",
          actionHref: `/contracts`,
          severity: "warning",
        });
      });

      intimacaoDeadlines
        .filter(d => d.aiDeadlineStatus === "vencido" || d.aiDeadlineStatus === "critico" || d.aiDeadlineStatus === "urgente")
        .slice(0, 3)
        .forEach(d => {
          interventions.push({
            id: `intim-${d.movementId}`,
            type: "JUR",
            label: "Prazo Intimação",
            desc: `${d.caseNumber} - ${d.aiDeadlineSummary || "Prazo de intimação"} - Vence: ${d.aiDeadlineDate} (${d.aiDeadlineStatus})`,
            action: "Ver",
            actionHref: `/cases`,
            severity: d.aiDeadlineStatus === "vencido" || d.aiDeadlineStatus === "critico" ? "critical" : "warning",
          });
        });

      const { whatsappService } = await import("./services/whatsapp");
      const whatsappStatus = whatsappService.getStatus();

      res.json({
        stats: {
          urgentDeadlines: urgentDeadlines.length + intimacaoDeadlines.filter(d => d.aiDeadlineStatus === "vencido" || d.aiDeadlineStatus === "critico" || d.aiDeadlineStatus === "urgente").length,
          deadlines7Days: deadlines7Days.length,
          activeCases: activeCases.length,
          newCasesThisMonth,
          totalBilled,
          totalPaid,
          pendingAmount: pendingInvoicesAmount,
          audienciasWeek: audienciasCount,
        },
        interventions,
        overdueInvoices: overdueInvoices.slice(0, 10),
        expiringContracts: expiringContracts.slice(0, 10),
        staleCases: staleCases.slice(0, 10),
        aiEfficiency: {
          hoursSaved,
          piecesGenerated: weeklyPieces.length,
          aiInteractions: weeklyAiLogs.length,
          weeklyClientsCreated,
          weeklyCasesCreated,
        },
        whatsappStatus: whatsappStatus.status,
        upcomingDeadlines: deadlines7Days.map(d => {
          const relatedCase = allCases.find(c => c.id === d.caseId);
          return {
            id: d.id,
            title: d.title,
            type: d.type,
            dueDate: d.dueDate,
            priority: d.priority,
            caseNumber: relatedCase?.caseNumber,
            caseTitle: relatedCase?.title,
          };
        }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 8),
        todayIntimacoes: await (async () => {
          const { caseMovements: cm, cases: cs } = await import("@shared/schema");
          const { db: dbInst } = await import("./db");
          const { and: andFn, eq: eqFn, gte: gteFn, lt: ltFn, desc: descFn } = await import("drizzle-orm");
          const todayS = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const todayE = new Date(todayS.getTime() + 24 * 60 * 60 * 1000);
          const rows = await dbInst.select({
            id: cm.id,
            caseId: cm.caseId,
            type: cm.type,
            description: cm.description,
            aiDeadlineSummary: cm.aiDeadlineSummary,
            aiDeadlineDate: cm.aiDeadlineDate,
            aiDeadlineStatus: cm.aiDeadlineStatus,
            caseNumber: cs.caseNumber,
            caseTitle: cs.title,
            createdAt: cm.createdAt,
          }).from(cm)
            .innerJoin(cs, eqFn(cm.caseId, cs.id))
            .where(andFn(
              eqFn(cs.tenantId, tenantId),
              gteFn(cm.createdAt, todayS),
              ltFn(cm.createdAt, todayE)
            ))
            .orderBy(descFn(cm.createdAt))
            .limit(20);
          return rows;
        })(),
      });
    } catch (error) {
      console.error("Error fetching full dashboard:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // ==================== USERS ====================
  app.get("/api/users/socios", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const socios = allUsers
        .filter(u => u.role === "socio" && u.isActive !== false)
        .map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null }));
      res.json(socios);
    } catch (error) {
      console.error("Error fetching socios:", error);
      res.status(500).json({ error: "Failed to fetch socios" });
    }
  });

  // ==================== CLIENTS ====================
  app.get("/api/clients", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const clients = await storage.getClientsByTenant(tenantId);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/clients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req); // TODO: Get from authenticated session
      const id = parseInt(req.params.id);
      const client = await storage.getClient(id, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  app.post("/api/clients", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const data = insertClientSchema.parse({ ...req.body, tenantId });
      const client = await storage.createClient(data);
      
      await storage.createAuditLog({
        tenantId,
        action: "create",
        entityType: "client",
        entityId: client.id,
        details: { name: client.name },
      });
      
      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  // Client-specific data
  app.get("/api/clients/:id/contracts", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const client = await storage.getClient(id, tenantId);
      if (!client) return res.status(404).json({ error: "Client not found" });
      const contracts = await storage.getContractsByClient(id);
      res.json(contracts);
    } catch (error) {
      console.error("Error fetching client contracts:", error);
      res.status(500).json({ error: "Failed to fetch client contracts" });
    }
  });

  app.get("/api/clients/:id/cases", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const client = await storage.getClient(id, tenantId);
      if (!client) return res.status(404).json({ error: "Client not found" });
      const cases = await storage.getCasesByClient(id);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching client cases:", error);
      res.status(500).json({ error: "Failed to fetch client cases" });
    }
  });

  app.get("/api/clients/:id/invoices", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const client = await storage.getClient(id, tenantId);
      if (!client) return res.status(404).json({ error: "Client not found" });
      const invoices = await storage.getInvoicesByClient(id);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching client invoices:", error);
      res.status(500).json({ error: "Failed to fetch client invoices" });
    }
  });

  app.get("/api/clients/:id/deadlines", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const client = await storage.getClient(id, tenantId);
      if (!client) return res.status(404).json({ error: "Client not found" });
      const deadlines = await storage.getDeadlinesByClient(id);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching client deadlines:", error);
      res.status(500).json({ error: "Failed to fetch client deadlines" });
    }
  });

  app.put("/api/clients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const existing = await storage.getClient(id, tenantId);
      if (!existing) {
        return res.status(404).json({ error: "Client not found" });
      }
      const allowedFields = ["name", "document", "type", "email", "phone", "address", "status", "notes", "communicationTone", "secretaryNotes"];
      const sanitized: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) sanitized[key] = req.body[key];
      }
      const client = await storage.updateClient(id, sanitized);
      res.json(client);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.delete("/api/clients/batch", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientIds } = req.body;
      
      if (!Array.isArray(clientIds) || clientIds.length === 0) {
        return res.status(400).json({ error: "Nenhum cliente selecionado" });
      }
      
      let deleted = 0;
      let errors = 0;
      
      for (const id of clientIds) {
        try {
          const client = await storage.getClient(id, tenantId);
          if (!client || client.tenantId !== tenantId) continue;
          
          await storage.deleteAllClientDependencies(id);
          await storage.deleteClient(id);
          
          await storage.createAuditLog({
            tenantId,
            action: "delete",
            entityType: "client",
            entityId: id,
            details: { clientName: client.name, batchDelete: true },
          });
          deleted++;
        } catch (e) {
          errors++;
        }
      }
      
      res.json({ success: true, deleted, errors, message: `${deleted} cliente(s) excluído(s)` });
    } catch (error) {
      console.error("Error batch deleting clients:", error);
      res.status(500).json({ error: "Falha ao excluir clientes em lote" });
    }
  });

  app.delete("/api/clients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID inválido" });
      }
      const existing = await storage.getClient(id, tenantId);
      if (!existing) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      if (existing.tenantId !== tenantId) {
        return res.status(403).json({ error: "Sem permissão para excluir este cliente" });
      }
      await storage.deleteAllClientDependencies(id);
      await storage.deleteClient(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Erro ao excluir cliente" });
    }
  });

  app.post("/api/clients/batch-import", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clients: clientsData } = req.body;
      if (!Array.isArray(clientsData)) {
        return res.status(400).json({ error: "clients array is required" });
      }

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      const existingClients = await storage.getClientsByTenant(tenantId);
      const docSet = new Set(existingClients.filter(c => c.document).map(c => c.document.trim()));

      for (const item of clientsData) {
        try {
          const doc = (item.document || "").trim();
          if (doc && docSet.has(doc)) {
            skipped++;
            continue;
          }

          await storage.createClient({
            tenantId,
            name: item.name || "",
            document: doc,
            type: item.type === "juridica" ? "PJ" : "PF",
            email: item.email || null,
            phone: item.phone || null,
            address: item.address || null,
          });
          if (doc) docSet.add(doc);
          imported++;
        } catch (err: any) {
          errors++;
        }
      }

      res.json({ imported, skipped, errors });
    } catch (error) {
      console.error("Error in batch import clients:", error);
      res.status(500).json({ error: "Falha na importação em lote" });
    }
  });

  // ==================== CONTRACTS ====================
  app.get("/api/contracts", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const contracts = await storage.getContractsByTenant(tenantId);
      const clients = await storage.getClientsByTenant(tenantId);
      const clientMap = new Map(clients.map(c => [c.id, c]));
      const enriched = contracts.map(contract => ({
        ...contract,
        clientName: clientMap.get(contract.clientId)?.name || "Cliente desconhecido",
        clientType: clientMap.get(contract.clientId)?.type || null,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      res.status(500).json({ error: "Failed to fetch contracts" });
    }
  });

  app.post("/api/contracts", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const body = { ...req.body, tenantId };
      if (body.startDate && typeof body.startDate === "string") {
        body.startDate = new Date(body.startDate);
      }
      if (body.endDate && typeof body.endDate === "string") {
        body.endDate = new Date(body.endDate);
      }
      const data = insertContractSchema.parse(body);
      const contract = await storage.createContract(data);
      
      await storage.createAuditLog({
        tenantId,
        action: "create",
        entityType: "contract",
        entityId: contract.id,
      });
      
      res.status(201).json(contract);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating contract:", error);
      res.status(500).json({ error: "Failed to create contract" });
    }
  });

  app.put("/api/contracts/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid contract ID" });

      const existing = await storage.getContract(id, tenantId);
      if (!existing) return res.status(404).json({ error: "Contract not found" });

      const body = { ...req.body };
      if (body.startDate && typeof body.startDate === "string") {
        body.startDate = new Date(body.startDate);
      }
      if (body.endDate && typeof body.endDate === "string") {
        body.endDate = new Date(body.endDate);
      }
      delete body.id;
      delete body.tenantId;
      delete body.clientName;

      const updated = await storage.updateContract(id, body);

      await storage.createAuditLog({
        tenantId,
        action: "update",
        entityType: "contract",
        entityId: id,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating contract:", error);
      res.status(500).json({ error: "Failed to update contract" });
    }
  });

  app.delete("/api/contracts/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid contract ID" });

      const existing = await storage.getContract(id, tenantId);
      if (!existing) return res.status(404).json({ error: "Contract not found" });

      await storage.deleteContract(id);

      await storage.createAuditLog({
        tenantId,
        action: "delete",
        entityType: "contract",
        entityId: id,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contract:", error);
      res.status(500).json({ error: "Failed to delete contract" });
    }
  });

  // ==================== CASES ====================
  app.get("/api/cases", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const cases = await storage.getCasesByTenant(tenantId);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching cases:", error);
      res.status(500).json({ error: "Failed to fetch cases" });
    }
  });

  app.get("/api/cases/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req); // TODO: Get from authenticated session
      const id = parseInt(req.params.id);
      const caseItem = await storage.getCase(id, tenantId);
      if (!caseItem) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.json(caseItem);
    } catch (error) {
      console.error("Error fetching case:", error);
      res.status(500).json({ error: "Failed to fetch case" });
    }
  });

  app.get("/api/cases/:id/movements", async (req: Request, res: Response) => {
    try {
      const caseId = parseInt(req.params.id);
      const movements = await storage.getCaseMovements(caseId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching movements:", error);
      res.status(500).json({ error: "Failed to fetch movements" });
    }
  });

  app.post("/api/cases", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const data = insertCaseSchema.parse({ ...req.body, tenantId });
      const caseItem = await storage.createCase(data);
      
      await storage.createAuditLog({
        tenantId,
        action: "create",
        entityType: "case",
        entityId: caseItem.id,
        details: { caseNumber: caseItem.caseNumber },
      });
      
      res.status(201).json(caseItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating case:", error);
      res.status(500).json({ error: "Failed to create case" });
    }
  });

  app.put("/api/cases/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const caseId = parseInt(req.params.id);
      const existing = await storage.getCase(caseId, tenantId);
      if (!existing) {
        return res.status(404).json({ error: "Processo não encontrado" });
      }
      const allowedFields = [
        "title", "caseType", "court", "judge", "caseClass", "subject", "status",
        "riskLevel", "estimatedValue", "tags", "clientId", "contractId",
        "adversePartyName", "adversePartyDocument", "adversePartyAddress",
        "adversePartyRepresentative", "adversePartyLawyer"
      ];
      const sanitized: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) sanitized[key] = req.body[key];
      }
      const updated = await storage.updateCase(caseId, sanitized, tenantId);
      if (!updated) {
        return res.status(404).json({ error: "Processo não encontrado" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating case:", error);
      res.status(500).json({ error: "Erro ao atualizar processo" });
    }
  });

  app.delete("/api/cases/batch", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { caseIds } = req.body;
      
      if (!Array.isArray(caseIds) || caseIds.length === 0) {
        return res.status(400).json({ error: "Nenhum processo selecionado" });
      }
      
      let deleted = 0;
      let errors = 0;
      
      for (const id of caseIds) {
        try {
          const caseItem = await storage.getCase(id, tenantId);
          if (!caseItem) continue;
          
          await storage.deleteAllCaseDependencies(id);
          await storage.deleteCase(id);
          
          await storage.createAuditLog({
            tenantId,
            action: "delete",
            entityType: "case",
            entityId: id,
            details: { caseNumber: caseItem.caseNumber, batchDelete: true },
          });
          deleted++;
        } catch (e) {
          errors++;
        }
      }
      
      res.json({ success: true, deleted, errors, message: `${deleted} processo(s) excluído(s)` });
    } catch (error) {
      console.error("Error batch deleting cases:", error);
      res.status(500).json({ error: "Falha ao excluir processos em lote" });
    }
  });

  app.delete("/api/cases/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const caseId = parseInt(req.params.id);
      
      const caseItem = await storage.getCase(caseId, tenantId);
      if (!caseItem) {
        return res.status(404).json({ error: "Processo não encontrado" });
      }
      
      await storage.deleteAllCaseDependencies(caseId);
      await storage.deleteCase(caseId);
      
      await storage.createAuditLog({
        tenantId,
        action: "delete",
        entityType: "case",
        entityId: caseId,
        details: { caseNumber: caseItem.caseNumber },
      });
      
      res.json({ success: true, message: "Processo excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting case:", error);
      res.status(500).json({ error: "Falha ao excluir processo" });
    }
  });

  app.post("/api/cases/parse-excel", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
      
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      
      if (!jsonData.length) return res.status(400).json({ error: "Planilha vazia" });

      const headerMap: Record<string, string> = {
        "numero": "caseNumber", "número": "caseNumber", "numero_processo": "caseNumber", 
        "numero do processo": "caseNumber", "número do processo": "caseNumber",
        "npu": "caseNumber", "cnj": "caseNumber", "processo": "caseNumber",
        "case_number": "caseNumber", "casenumber": "caseNumber", "num_processo": "caseNumber",
        "titulo": "title", "título": "title", "nome": "title", "title": "title", "descricao": "title", "descrição": "title",
        "tipo": "caseType", "type": "caseType", "case_type": "caseType", "casetype": "caseType", "natureza": "caseType",
        "tribunal": "court", "court": "court", "orgao": "court", "órgão": "court", "orgao_julgador": "court",
        "cliente": "clientName", "client": "clientName", "clientname": "clientName", "client_name": "clientName",
        "nome_cliente": "clientName", "parte": "clientName",
        "status": "status", "situacao": "status", "situação": "status",
        "autor": "autor", "requerente": "autor", "exequente": "autor", "reclamante": "autor",
        "reu": "reu", "réu": "reu", "requerido": "reu", "executado": "reu", "reclamado": "reu",
        "vara": "vara", "juizo": "vara", "juízo": "vara", "unidade": "vara",
        "classe": "caseClass", "class": "caseClass", "classe_processual": "caseClass",
        "valor": "estimatedValue", "valor_causa": "estimatedValue", "valor da causa": "estimatedValue",
      };

      const firstRowKeys = Object.keys(jsonData[0]);
      const columnMapping: Record<string, string> = {};
      for (const key of firstRowKeys) {
        const normalizedKey = key.toLowerCase().trim().replace(/[_\s]+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        for (const [pattern, field] of Object.entries(headerMap)) {
          const normalizedPattern = pattern.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (normalizedKey === normalizedPattern || normalizedKey.includes(normalizedPattern)) {
            if (!columnMapping[field]) {
              columnMapping[field] = key;
            }
            break;
          }
        }
      }

      const isSingleColumnFormat = firstRowKeys.length <= 2 && jsonData.some((row: any) => {
        const val = String(row[firstRowKeys[0]] || "");
        return val.includes(";") && val.split(";").length >= 5;
      });

      const parsedCases: any[] = [];

      if (isSingleColumnFormat) {
        for (const row of jsonData) {
          const rawLine = String(row[firstRowKeys[0]] || "");
          const parts = rawLine.split(";").map((p: string) => p.trim());
          if (parts.length < 5) continue;
          
          const caseNumIdx = parts.findIndex((p: string) => /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(p));
          if (caseNumIdx === -1) continue;

          const caseNumber = parts[caseNumIdx];
          const caseClass = parts[caseNumIdx + 1] || "";
          const autor = parts[caseNumIdx + 2] || "";
          const autorQuality = parts[caseNumIdx + 3] || "";
          const reu = parts[caseNumIdx + 4] || "";
          
          const tribunalIdx = parts.findIndex((p: string) => /tribunal/i.test(p));
          const tribunal = tribunalIdx >= 0 ? parts[tribunalIdx] : "";
          const status = tribunalIdx >= 0 && parts[tribunalIdx + 1] ? parts[tribunalIdx + 1] : "Ativo";

          const title = autor && reu ? `${autor} x ${reu}` : autor || reu || caseNumber;

          let caseType = "civil";
          const classLower = caseClass.toLowerCase();
          if (/trabalh|reclama/i.test(classLower)) caseType = "trabalhista";
          else if (/penal|crim/i.test(classLower)) caseType = "criminal";
          else if (/tribut|fiscal/i.test(classLower)) caseType = "tributario";

          parsedCases.push({
            caseNumber,
            title,
            caseType,
            court: tribunal,
            clientName: autor,
            status: status.toLowerCase() === "ativo" ? "ativo" : status.toLowerCase(),
            autor,
            reu,
            vara: "",
            caseClass,
          });
        }
      } else {
        for (const row of jsonData) {
          const getValue = (field: string) => {
            const col = columnMapping[field];
            return col ? String(row[col] || "").trim() : "";
          };

          const caseNumber = getValue("caseNumber");
          if (!caseNumber) continue;

          const autor = getValue("autor");
          const reu = getValue("reu");
          let title = getValue("title");
          if (!title && autor && reu) title = `${autor} x ${reu}`;
          if (!title) title = caseNumber;

          let caseType = getValue("caseType") || "civil";
          const classVal = getValue("caseClass");
          if (classVal && caseType === "civil") {
            const cl = classVal.toLowerCase();
            if (/trabalh|reclama/i.test(cl)) caseType = "trabalhista";
            else if (/penal|crim/i.test(cl)) caseType = "criminal";
            else if (/tribut|fiscal/i.test(cl)) caseType = "tributario";
            else if (/execu/i.test(cl)) caseType = "execucao";
            else if (/monit/i.test(cl)) caseType = "monitoria";
          }

          parsedCases.push({
            caseNumber,
            title,
            caseType,
            court: getValue("court"),
            clientName: getValue("clientName") || autor || "",
            status: getValue("status") || "ativo",
            autor,
            reu,
            vara: getValue("vara"),
            caseClass: classVal,
          });
        }
      }

      res.json({
        total: parsedCases.length,
        columns: firstRowKeys,
        mapping: columnMapping,
        cases: parsedCases,
      });
    } catch (error: any) {
      console.error("[parse-excel] Error:", error);
      res.status(500).json({ error: "Erro ao processar arquivo: " + error.message });
    }
  });

  app.post("/api/cases/batch-import", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { cases: casesData } = req.body;
      if (!Array.isArray(casesData)) {
        return res.status(400).json({ error: "cases array is required" });
      }

      let imported = 0;
      let skipped = 0;
      let errors = 0;
      const details: string[] = [];
      const existingClients = await storage.getClientsByTenant(tenantId);
      const clientMap = new Map(existingClients.map(c => [c.name.toLowerCase().trim(), c]));
      const existingCases = await storage.getCasesByTenant(tenantId);
      const existingCaseNumbers = new Set(existingCases.map(c => c.caseNumber.replace(/\D/g, "")));

      for (const item of casesData) {
        try {
          const normalizedNum = (item.caseNumber || "").replace(/\D/g, "");
          if (normalizedNum && existingCaseNumbers.has(normalizedNum)) {
            skipped++;
            details.push(`Processo ${item.caseNumber} já existe - ignorado`);
            continue;
          }

          let clientId: number;
          const clientKey = (item.clientName || "").toLowerCase().trim();

          if (clientKey && clientMap.has(clientKey)) {
            clientId = clientMap.get(clientKey)!.id;
          } else {
            const newClient = await storage.createClient({
              tenantId,
              name: item.clientName || "Cliente não informado",
              document: "",
              type: "PF",
            });
            clientMap.set(clientKey, newClient);
            clientId = newClient.id;
          }

          await storage.createCase({
            tenantId,
            clientId,
            caseNumber: item.caseNumber || "",
            title: item.title || item.caseNumber || "Sem título",
            caseType: item.caseType || "civil",
            court: item.court || "",
            status: item.status || "ativo",
            autor: item.autor || null,
            reu: item.reu || null,
            vara: item.vara || null,
          });
          if (normalizedNum) existingCaseNumbers.add(normalizedNum);
          imported++;
        } catch (err: any) {
          errors++;
          details.push(`Erro ao importar ${item.caseNumber || "caso"}: ${err.message}`);
        }
      }

      res.json({ imported, skipped, errors, details });
    } catch (error) {
      console.error("Error in batch import cases:", error);
      res.status(500).json({ error: "Falha na importação em lote" });
    }
  });

  app.patch("/api/cases/:id/own-case", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const caseId = parseInt(req.params.id);
      const { isOwnCase } = req.body;
      if (typeof isOwnCase !== "boolean") {
        return res.status(400).json({ error: "isOwnCase (boolean) is required" });
      }
      const existing = await storage.getCase(caseId);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ error: "Processo não encontrado" });
      }
      const updated = await storage.updateCase(caseId, { isOwnCase });
      res.json(updated);
    } catch (error) {
      console.error("Error updating isOwnCase:", error);
      res.status(500).json({ error: "Failed to update case" });
    }
  });

  app.patch("/api/cases/:id/strategic", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const caseId = parseInt(req.params.id);
      const { isStrategic } = req.body;
      if (typeof isStrategic !== "boolean") {
        return res.status(400).json({ error: "isStrategic (boolean) is required" });
      }
      const existing = await storage.getCase(caseId);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ error: "Processo não encontrado" });
      }
      const updated = await storage.updateCase(caseId, { isStrategic });
      res.json(updated);
    } catch (error) {
      console.error("Error updating isStrategic:", error);
      res.status(500).json({ error: "Failed to update case" });
    }
  });

  // ==================== CSV TEMPLATES ====================
  app.get("/api/templates/cases-csv", (req: Request, res: Response) => {
    const csv = "Número do Processo,Título,Tipo (civil/trabalhista/federal),Tribunal/Vara,Nome do Cliente,Status,Autor,Réu,Vara\n";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=modelo_processos.csv");
    res.send("\uFEFF" + csv);
  });

  app.get("/api/templates/clients-csv", (req: Request, res: Response) => {
    const csv = "Nome,CPF/CNPJ,Tipo (fisica/juridica),Email,Telefone,Endereço\n";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=modelo_clientes.csv");
    res.send("\uFEFF" + csv);
  });

  // ==================== INTIMAÇÕES & MOVIMENTAÇÕES ====================
  app.get("/api/intimacoes", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const parsedStart = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const parsedEnd = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const startDate = parsedStart && !isNaN(parsedStart.getTime()) ? parsedStart : undefined;
      const endDate = parsedEnd && !isNaN(parsedEnd.getTime()) ? parsedEnd : undefined;
      const movements = await storage.getIntimacoesByTenant(tenantId, true, startDate, endDate);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching intimações:", error);
      res.status(500).json({ error: "Failed to fetch intimações" });
    }
  });

  app.get("/api/intimacoes/unread-count", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const count = await storage.getUnreadIntimacaoCount(tenantId, true);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.post("/api/intimacoes/:id/read", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const movement = await storage.markMovementAsRead(id);
      res.json(movement);
    } catch (error) {
      console.error("Error marking as read:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  app.post("/api/intimacoes/mark-all-read", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      await storage.markAllMovementsAsRead(tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all as read:", error);
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.post("/api/intimacoes/acknowledge/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const movement = await storage.acknowledgeMovement(id, userId);
      res.json(movement);
    } catch (error) {
      console.error("Error acknowledging intimação:", error);
      res.status(500).json({ error: "Failed to acknowledge intimação" });
    }
  });

  app.post("/api/intimacoes/batch-analyze", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { batchAnalyzeIntimacoes } = await import("./services/intimacaoAnalysis");
      const result = await batchAnalyzeIntimacoes(tenantId, 10);
      res.json(result);
    } catch (error) {
      console.error("Error batch analyzing intimações:", error);
      res.status(500).json({ error: "Failed to batch analyze intimações" });
    }
  });

  app.post("/api/intimacoes/reset-analysis", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const result = await db.update(caseMovements)
        .set({
          aiAnalyzedAt: null,
          aiDeadlineDays: null,
          aiDeadlineType: null,
          aiDeadlineDate: null,
          aiPublicacaoDate: null,
          aiInicioPrazoDate: null,
          aiDeadlineStatus: null,
          aiLegalBasis: null,
          aiSuggestedPiece: null,
          aiDeadlineSummary: null,
          aiClassification: null,
        })
        .where(and(
          inArray(caseMovements.caseId, db.select({ id: cases.id }).from(cases).where(eq(cases.tenantId, tenantId))),
          gte(caseMovements.date, sixtyDaysAgo),
          isNotNull(caseMovements.aiAnalyzedAt)
        ));
      res.json({ success: true, message: "Analysis reset. Items will be re-analyzed on next load." });
    } catch (error) {
      console.error("Error resetting analysis:", error);
      res.status(500).json({ error: "Failed to reset analysis" });
    }
  });

  app.post("/api/intimacoes/recalculate-cpc", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { recalculateCPCDates } = await import("./services/intimacaoAnalysis");
      const result = await recalculateCPCDates(tenantId);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error recalculating CPC dates:", error);
      res.status(500).json({ error: "Failed to recalculate CPC dates" });
    }
  });

  app.post("/api/intimacoes/reclassify-deadlines", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const allCases = await db.select().from(cases).where(eq(cases.tenantId, tenantId));
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const movements = await db.select().from(caseMovements).where(
        and(
          inArray(caseMovements.caseId, allCases.map(c => c.id)),
          isNotNull(caseMovements.aiAnalyzedAt),
          isNotNull(caseMovements.aiDeadlineDays)
        )
      );

      let reclassified = 0;
      let unchanged = 0;

      for (const mov of movements) {
        const caseItem = allCases.find(c => c.id === mov.caseId);
        if (!caseItem) continue;

        const isJuizado = isJuizadoEspecial({
          classeNome: (caseItem as any).classeNome,
          vara: (caseItem as any).vara,
          court: caseItem.court,
          caseNumber: caseItem.caseNumber
        });
        const correctType = isJuizado ? "corridos" : "uteis";

        if (mov.aiDeadlineType !== correctType && mov.aiDeadlineDays && mov.date) {
          const startDate = new Date(mov.date);
          if (!isNaN(startDate.getTime())) {
            const deadlineDate = calculateDeadlineDate(startDate, mov.aiDeadlineDays, correctType as "uteis" | "corridos");
            const aiDeadlineDate = deadlineDate.toISOString().split('T')[0];
            const remaining = countDaysRemaining(deadlineDate, correctType as "uteis" | "corridos");
            let aiDeadlineStatus: string;
            if (remaining <= 0) aiDeadlineStatus = "vencido";
            else if (remaining <= 2) aiDeadlineStatus = "critico";
            else if (remaining <= 5) aiDeadlineStatus = "urgente";
            else aiDeadlineStatus = "normal";

            await db.update(caseMovements)
              .set({
                aiDeadlineType: correctType,
                aiDeadlineDate: aiDeadlineDate,
                aiDeadlineStatus: aiDeadlineStatus,
              })
              .where(eq(caseMovements.id, mov.id));
            reclassified++;
          }
        } else {
          unchanged++;
        }
      }

      res.json({
        success: true,
        total: movements.length,
        reclassified,
        unchanged,
        message: `Reclassificados ${reclassified} prazos (${unchanged} já corretos) de ${movements.length} movimentações analisadas.`
      });
    } catch (error) {
      console.error("Error reclassifying deadlines:", error);
      res.status(500).json({ error: "Failed to reclassify deadlines" });
    }
  });

  app.post("/api/escavador/sync-all", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { triggerManualSync } = await import("./services/datajudSync");
      const result = await triggerManualSync(tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error triggering sync:", error);
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  app.post("/api/escavador/force-sync", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { triggerEscavadorOnlySync } = await import("./services/datajudSync");
      triggerEscavadorOnlySync(tenantId).catch(err => {
        console.error("[Escavador Force Sync] Background sync error:", err);
      });
      res.json({ started: true, message: "Escavador-only sync started in background" });
    } catch (error) {
      console.error("Error triggering Escavador sync:", error);
      res.status(500).json({ error: "Failed to trigger Escavador sync" });
    }
  });

  app.get("/api/escavador/force-sync/progress", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { getEscavadorSyncProgress } = await import("./services/datajudSync");
      res.json(getEscavadorSyncProgress(tenantId));
    } catch (error) {
      res.status(500).json({ error: "Failed to get sync progress" });
    }
  });

  // ==================== ESCAVADOR ====================
  app.get("/api/escavador/status", async (req: Request, res: Response) => {
    try {
      const configured = escavadorService.isConfigured();
      let balance = null;
      if (configured) {
        balance = await escavadorService.checkBalance();
      }
      res.json({ configured, balance });
    } catch (error) {
      console.error("Error checking Escavador status:", error);
      res.json({ configured: escavadorService.isConfigured(), balance: null });
    }
  });

  app.post("/api/escavador/search-process", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada. Adicione ESCAVADOR_API_KEY nos secrets." });
      }
      const { caseNumber } = req.body;
      if (!caseNumber) {
        return res.status(400).json({ error: "Número do processo é obrigatório" });
      }
      const result = await escavadorService.searchByProcessNumber(caseNumber);
      if (!result) {
        return res.status(404).json({ error: "Processo não encontrado na base do Escavador. Verifique o número e tente novamente." });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error searching Escavador:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar Escavador" });
    }
  });

  app.post("/api/escavador/import-process", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { escavadorData, clientId } = req.body;

      if (!escavadorData) {
        return res.status(400).json({ error: "Dados do Escavador são obrigatórios" });
      }

      const caseNumber = escavadorData.numero_cnj || escavadorData.numeroProcesso || escavadorData.numero || "";
      if (!caseNumber) {
        return res.status(400).json({ error: "Número do processo não encontrado nos dados" });
      }

      const existingCase = await storage.getCaseByNumber(caseNumber);
      if (existingCase && existingCase.tenantId === tenantId) {
        return res.status(409).json({ error: "Processo já existe no sistema", caseId: existingCase.id });
      }

      let resolvedClientId = clientId;
      if (!resolvedClientId) {
        const clients = await storage.getClientsByTenant(tenantId);
        if (clients.length === 0) {
          const newClient = await storage.createClient({
            tenantId,
            name: "Cliente Importado Escavador",
            document: "00000000000",
            type: "fisica",
          });
          resolvedClientId = newClient.id;
        } else {
          resolvedClientId = clients[0].id;
        }
      }

      const classe = escavadorData.classe || escavadorData.tipo || "";
      const assuntoNome = escavadorData.assuntos?.[0]?.nome || escavadorData.assuntos?.[0] || "Processo Importado";
      const title = classe ? `${classe} - ${assuntoNome}` : assuntoNome;
      const tribunal = escavadorData.tribunal?.sigla || escavadorData.tribunal || "";
      const vara = escavadorData.vara || escavadorData.orgao_julgador || "";

      let caseType = "civil";
      const tribunalLower = (typeof tribunal === "string" ? tribunal : "").toLowerCase();
      if (tribunalLower.includes("trt") || tribunalLower.includes("tst")) {
        caseType = "trabalhista";
      } else if (tribunalLower.includes("trf") || tribunalLower.includes("stj") || tribunalLower.includes("stf")) {
        caseType = "federal";
      } else if (tribunalLower.includes("tre") || tribunalLower.includes("tse")) {
        caseType = "eleitoral";
      }

      const envolvidos = escavadorData.envolvidos || escavadorData.partes || [];
      let autor = null;
      let reu = null;
      for (const e of envolvidos) {
        const tipo = (e.tipo_participacao || e.tipo || "").toLowerCase();
        if (tipo.includes("autor") || tipo.includes("requerente") || tipo.includes("reclamante")) {
          autor = e.nome || e.name;
        }
        if (tipo.includes("réu") || tipo.includes("reu") || tipo.includes("requerido") || tipo.includes("reclamado")) {
          reu = e.nome || e.name;
        }
      }

      const assuntos = (escavadorData.assuntos || []).map((a: any) => typeof a === "string" ? a : a.nome).filter(Boolean);

      const newCase = await storage.createCase({
        tenantId,
        clientId: resolvedClientId,
        caseNumber,
        title: title.substring(0, 255),
        caseType,
        court: `${tribunal}${vara ? ` - ${vara}` : ""}`,
        caseClass: classe || null,
        subject: assuntoNome || null,
        status: "ativo",
        riskLevel: "medio",
        tags: ["Importado Escavador"],
        responsibleUserId: 1,
        createdBy: 1,
        datajudId: escavadorData.id?.toString(),
        datajudLastSync: new Date(),
        autor,
        reu,
        vara: vara || null,
        valorCausa: escavadorData.valor_causa?.toString() || null,
        classeNome: classe || null,
        assuntos: assuntos.length > 0 ? assuntos : null,
      });

      await storage.createAuditLog({
        tenantId,
        action: "escavador_import",
        entityType: "case",
        entityId: newCase.id,
        details: { caseNumber, tribunal },
      });

      res.status(201).json({
        success: true,
        case: newCase,
      });
    } catch (error) {
      console.error("Error creating case from Escavador:", error);
      res.status(500).json({ error: "Failed to create case from Escavador" });
    }
  });

  app.post("/api/escavador/search-person", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada. Adicione ESCAVADOR_API_KEY nos secrets." });
      }
      const { query, page } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Nome ou CPF/CNPJ é obrigatório" });
      }
      const result = await escavadorService.searchByNameOrDocument(query, page || 1);
      if (!result) {
        return res.status(404).json({ error: "Nenhum resultado encontrado" });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error searching person in Escavador:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar Escavador" });
    }
  });

  app.post("/api/escavador/search-oab", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada. Adicione ESCAVADOR_API_KEY nos secrets." });
      }
      const { oabNumber, oabState, page } = req.body;
      if (!oabNumber) {
        return res.status(400).json({ error: "Número da OAB é obrigatório" });
      }
      const result = await escavadorService.searchByOAB(oabNumber, oabState || "DF", page || 1);
      if (!result) {
        return res.status(404).json({ error: "Nenhum resultado encontrado" });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error searching OAB in Escavador:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar Escavador" });
    }
  });

  app.post("/api/escavador/movements/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { caseNumber } = req.params;
      const { page } = req.body;
      const result = await escavadorService.getMovements(caseNumber, page || 1);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching Escavador movements:", error);
      res.status(500).json({ error: error.message || "Erro ao buscar movimentações" });
    }
  });

  app.post("/api/escavador/envolvidos/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { caseNumber } = req.params;
      const envolvidos = await escavadorService.getEnvolvidos(caseNumber);
      res.json(envolvidos);
    } catch (error: any) {
      console.error("Error fetching envolvidos:", error);
      res.status(500).json({ error: error.message || "Erro ao buscar envolvidos" });
    }
  });

  app.post("/api/escavador/import/:caseId", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const caseId = parseInt(req.params.caseId);
      const caseItem = await storage.getCase(caseId);
      if (!caseItem) {
        return res.status(404).json({ error: "Processo não encontrado" });
      }
      const processData = await escavadorService.searchByProcessNumber(caseItem.caseNumber);
      if (!processData) {
        return res.status(404).json({ error: "Processo não encontrado no Escavador" });
      }
      const result = await escavadorService.importProcessToCase(caseId, processData);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error importing from Escavador:", error);
      res.status(500).json({ error: error.message || "Erro ao importar do Escavador" });
    }
  });

  app.post("/api/escavador/create-from-search", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { escavadorData } = req.body;
      if (!escavadorData?.numero_cnj) {
        return res.status(400).json({ error: "Dados do processo são obrigatórios" });
      }

      const tenantId = getTenantId(req);
      const normalizedCNJ = escavadorData.numero_cnj.replace(/\D/g, "");
      const existingCases = await storage.getCasesByTenant(tenantId);
      const duplicate = existingCases.find((c: any) => c.caseNumber.replace(/\D/g, "") === normalizedCNJ);
      if (duplicate) {
        return res.status(409).json({ error: "Este processo já existe no sistema", existingId: duplicate.id });
      }

      const clients = await storage.getClientsByTenant(tenantId);
      let resolvedClientId: number;
      if (clients.length === 0) {
        const newClient = await storage.createClient({
          tenantId,
          name: "Cliente Importado Escavador",
          document: "00000000000",
          type: "fisica",
        });
        resolvedClientId = newClient.id;
      } else {
        resolvedClientId = clients[0].id;
      }

      const fonte = escavadorData.fontes?.[0];
      const capa = fonte?.capa;

      let caseType = "civil";
      const tribunalNome = (fonte?.sigla || fonte?.nome || "").toLowerCase();
      if (tribunalNome.includes("trt") || tribunalNome.includes("tst")) caseType = "trabalhista";
      else if (tribunalNome.includes("trf") || tribunalNome.includes("stj") || tribunalNome.includes("stf")) caseType = "federal";
      else if (tribunalNome.includes("tre") || tribunalNome.includes("tse")) caseType = "eleitoral";

      const title = `${escavadorData.titulo_polo_ativo || "Autor"} x ${escavadorData.titulo_polo_passivo || "Réu"}`;
      
      const OAB_SOCIOS_ESC = ["23.947", "23947"];
      const escPartesStr = JSON.stringify(escavadorData).toLowerCase();
      const isOwnCaseEsc = OAB_SOCIOS_ESC.some((oab: string) => escPartesStr.includes(oab)) ||
                            escPartesStr.includes("serra") || escPartesStr.includes("marques");

      const newCase = await storage.createCase({
        tenantId,
        clientId: resolvedClientId,
        caseNumber: escavadorData.numero_cnj,
        title,
        caseType,
        court: fonte?.nome || "Tribunal não identificado",
        status: "Em andamento",
        datajudId: escavadorData.id?.toString(),
        classeNome: capa?.classe,
        subject: capa?.assunto,
        autor: escavadorData.titulo_polo_ativo || "",
        reu: escavadorData.titulo_polo_passivo || "",
        vara: capa?.orgao_julgador || "",
        valorCausa: capa?.valor_causa?.valor?.toString() || null,
        isOwnCase: isOwnCaseEsc,
      });

      const result = await escavadorService.importProcessToCase(newCase.id, escavadorData);

      res.json({
        success: true,
        caseId: newCase.id,
        movementsImported: result.movementsImported,
      });
    } catch (error: any) {
      console.error("Error creating case from Escavador:", error);
      res.status(500).json({ error: error.message || "Erro ao criar processo" });
    }
  });

  app.post("/api/escavador/bulk-import", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const tenantId = getTenantId(req);
      const { cnjNumbers } = req.body;
      if (!Array.isArray(cnjNumbers) || cnjNumbers.length === 0) {
        return res.status(400).json({ error: "Lista de números CNJ é obrigatória" });
      }

      if (cnjNumbers.length > 200) {
        return res.status(400).json({ error: "Máximo de 200 processos por importação" });
      }

      const existingCases = await storage.getCasesByTenant(tenantId);
      const existingCaseNumbers = new Set(existingCases.map((c: any) => c.caseNumber.replace(/\D/g, "")));

      const clients = await storage.getClientsByTenant(tenantId);
      let defaultClientId: number;
      if (clients.length === 0) {
        const newClient = await storage.createClient({
          tenantId,
          name: "Cliente Importado Escavador",
          document: "00000000000",
          type: "fisica",
        });
        defaultClientId = newClient.id;
      } else {
        defaultClientId = clients[0].id;
      }

      const results: Array<{ cnj: string; status: string; caseId?: number; movements?: number; error?: string }> = [];
      let imported = 0;
      let skipped = 0;
      let errors = 0;

      const OAB_SOCIOS = ["23.947", "23947"];

      for (const rawCnj of cnjNumbers) {
        const cnj = (rawCnj || "").toString().trim();
        if (!cnj) continue;

        const normalizedCNJ = cnj.replace(/\D/g, "");
        if (existingCaseNumbers.has(normalizedCNJ)) {
          skipped++;
          results.push({ cnj, status: "skipped", error: "Já existe no sistema" });
          continue;
        }

        try {
          const processData = await escavadorService.searchByProcessNumber(cnj);
          if (!processData) {
            errors++;
            results.push({ cnj, status: "not_found", error: "Não encontrado no Escavador" });
            continue;
          }

          const fonte = processData.fontes?.[0];
          const capa = fonte?.capa;

          let caseType = "civil";
          const tribunalNome = (fonte?.sigla || fonte?.nome || "").toLowerCase();
          if (tribunalNome.includes("trt") || tribunalNome.includes("tst")) caseType = "trabalhista";
          else if (tribunalNome.includes("trf") || tribunalNome.includes("stj") || tribunalNome.includes("stf")) caseType = "federal";
          else if (tribunalNome.includes("tre") || tribunalNome.includes("tse")) caseType = "eleitoral";

          const title = `${processData.titulo_polo_ativo || "Autor"} x ${processData.titulo_polo_passivo || "Réu"}`;

          const escPartesStr = JSON.stringify(processData).toLowerCase();
          const isOwnCase = OAB_SOCIOS.some((oab: string) => escPartesStr.includes(oab)) ||
                            escPartesStr.includes("serra") || escPartesStr.includes("marques");

          const newCase = await storage.createCase({
            tenantId,
            clientId: defaultClientId,
            caseNumber: processData.numero_cnj,
            title,
            caseType,
            court: fonte?.nome || "Tribunal não identificado",
            status: "Em andamento",
            classeNome: capa?.classe,
            subject: capa?.assunto,
            autor: processData.titulo_polo_ativo || "",
            reu: processData.titulo_polo_passivo || "",
            vara: capa?.orgao_julgador || "",
            valorCausa: capa?.valor_causa?.valor?.toString() || null,
            isOwnCase,
          });

          let movementsImported = 0;
          try {
            const importResult = await escavadorService.importProcessToCase(newCase.id, processData);
            movementsImported = importResult.movementsImported;
          } catch (movErr: any) {
            console.warn(`[Escavador Bulk] Movements import failed for ${cnj}: ${movErr.message}`);
          }
          existingCaseNumbers.add(normalizedCNJ);
          imported++;
          results.push({ cnj: processData.numero_cnj, status: "imported", caseId: newCase.id, movements: movementsImported });
        } catch (err: any) {
          errors++;
          results.push({ cnj, status: "error", error: err.message });
        }
      }

      res.json({ imported, skipped, errors, total: cnjNumbers.length, results });
    } catch (error: any) {
      console.error("Error in Escavador bulk import:", error);
      res.status(500).json({ error: error.message || "Erro na importação em lote" });
    }
  });

  app.post("/api/escavador/request-update/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { caseNumber } = req.params;
      const { baixarDocumentosPublicos, baixarAutos } = req.body || {};
      const result = await escavadorService.requestProcessUpdate(caseNumber, {
        baixarDocumentosPublicos,
        baixarAutos,
      });
      if (result?._escavadorError && result.status === 422) {
        const updateInfo = result.appends?.ultima_verificacao;
        return res.json({
          alreadyUpdating: true,
          message: result.message || "Processo já está sendo atualizado",
          status: updateInfo?.status || "PENDENTE",
          requestedAt: updateInfo?.criado_em,
          options: updateInfo?.opcoes,
        });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao solicitar atualização" });
    }
  });

  app.get("/api/escavador/update-status/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const result = await escavadorService.getUpdateStatus(req.params.caseNumber);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao verificar status" });
    }
  });

  app.get("/api/escavador/documents/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.getPublicDocuments(req.params.caseNumber, page);
      console.log("[Escavador] Public documents response:", JSON.stringify(result)?.substring(0, 500));
      if (!result) {
        return res.json({ documents: [], message: "Nenhum documento público encontrado. Solicite uma atualização do processo para buscar documentos." });
      }
      const documents = result.data || result.items || result.documents || result.documentos || [];
      res.json({ documents, pagination: result.pagination || result.paginator || null });
    } catch (error: any) {
      console.error("[Escavador] Documents error:", error.message);
      res.status(500).json({ error: error.message || "Erro ao buscar documentos" });
    }
  });

  app.get("/api/escavador/autos/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.getProcessAutos(req.params.caseNumber, page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao buscar autos" });
    }
  });

  app.get("/api/escavador/document-download/:documentId", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const documentId = parseInt(req.params.documentId);
      const buffer = await escavadorService.downloadDocument(documentId);
      if (!buffer) {
        return res.status(404).json({ error: "Documento não encontrado" });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="documento_${documentId}.pdf"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao baixar documento" });
    }
  });

  app.post("/api/escavador/ai-summary/request/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const result = await escavadorService.requestAISummary(req.params.caseNumber);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao solicitar resumo inteligente" });
    }
  });

  app.get("/api/escavador/ai-summary/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const result = await escavadorService.getAISummary(req.params.caseNumber);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao buscar resumo inteligente" });
    }
  });

  app.get("/api/escavador/ai-summary-status/:caseNumber", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const result = await escavadorService.getAISummaryStatus(req.params.caseNumber);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao verificar status do resumo" });
    }
  });

  app.post("/api/escavador/monitoring/process", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { caseNumber } = req.body;
      if (!caseNumber || !caseNumber.trim()) {
        return res.status(400).json({ error: "Número do processo é obrigatório" });
      }
      console.log(`[Monitoring] Creating process monitoring for: ${caseNumber}`);
      const result = await escavadorService.createProcessMonitoring(caseNumber);
      if (result && result._escavadorError) {
        console.log(`[Monitoring] Escavador error: ${result.message}`);
        return res.status(result.status || 422).json({ error: result.message || "Erro na API do Escavador" });
      }
      console.log(`[Monitoring] Process monitoring created successfully:`, JSON.stringify(result).substring(0, 200));
      res.json(result);
    } catch (error: any) {
      console.error(`[Monitoring] Error creating process monitoring:`, error.message);
      res.status(500).json({ error: error.message || "Erro ao criar monitoramento" });
    }
  });

  app.get("/api/escavador/monitoring/processes", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.listProcessMonitorings(page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao listar monitoramentos" });
    }
  });

  app.delete("/api/escavador/monitoring/process/:id", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const id = parseInt(req.params.id);
      await escavadorService.removeProcessMonitoring(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao remover monitoramento" });
    }
  });

  app.post("/api/escavador/monitoring/new-process", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { tipoPessoa, valor, nome } = req.body;
      if (!valor || !valor.trim()) {
        return res.status(400).json({ error: "CPF ou CNPJ é obrigatório" });
      }
      const result = await escavadorService.createNewProcessMonitoring({
        tipo_pessoa: tipoPessoa,
        valor,
        nome,
      });
      if (result && result._escavadorError) {
        return res.status(result.status || 422).json({ error: result.message || "Erro na API do Escavador" });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao criar monitoramento" });
    }
  });

  app.get("/api/escavador/monitoring/new-processes", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.listNewProcessMonitorings(page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao listar monitoramentos" });
    }
  });

  app.delete("/api/escavador/monitoring/new-process/:id", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const id = parseInt(req.params.id);
      await escavadorService.removeNewProcessMonitoring(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao remover monitoramento" });
    }
  });

  app.get("/api/escavador/monitoring/new-process/:id/results", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const id = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.listNewProcessMonitoringResults(id, page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao listar resultados" });
    }
  });

  app.post("/api/escavador/tribunal/search", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { caseNumber } = req.body;
      const result = await escavadorService.searchProcessOnTribunal(caseNumber);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao buscar no tribunal" });
    }
  });

  app.get("/api/escavador/tribunal/search-result/:buscaId", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const buscaId = parseInt(req.params.buscaId);
      const result = await escavadorService.getAsyncSearchResult(buscaId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao buscar resultado" });
    }
  });

  app.post("/api/escavador/monitoring/tribunal", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { caseNumber } = req.body;
      if (!caseNumber || !caseNumber.trim()) {
        return res.status(400).json({ error: "Número do processo é obrigatório" });
      }
      const result = await escavadorService.createTribunalMonitoring(caseNumber);
      if (result && result._escavadorError) {
        return res.status(result.status || 422).json({ error: result.message || "Erro na API do Escavador" });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao criar monitoramento" });
    }
  });

  app.get("/api/escavador/monitoring/tribunais", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.listTribunalMonitorings(page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao listar monitoramentos" });
    }
  });

  app.delete("/api/escavador/monitoring/tribunal/:id", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const id = parseInt(req.params.id);
      await escavadorService.removeTribunalMonitoring(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao remover monitoramento" });
    }
  });

  app.post("/api/escavador/monitoring/diario", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const { termo, origens } = req.body;
      if (!termo || !termo.trim()) {
        return res.status(400).json({ error: "Termo de monitoramento é obrigatório" });
      }
      const result = await escavadorService.createDiarioMonitoring({ termo, origens });
      if (result && result._escavadorError) {
        return res.status(result.status || 422).json({ error: result.message || "Erro na API do Escavador" });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao criar monitoramento" });
    }
  });

  app.get("/api/escavador/monitoring/diarios", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.listDiarioMonitorings(page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao listar monitoramentos" });
    }
  });

  app.delete("/api/escavador/monitoring/diario/:id", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const id = parseInt(req.params.id);
      await escavadorService.removeDiarioMonitoring(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao remover monitoramento" });
    }
  });

  app.get("/api/escavador/monitoring/diario/:id/appearances", async (req: Request, res: Response) => {
    try {
      if (!escavadorService.isConfigured()) {
        return res.status(400).json({ error: "API do Escavador não configurada" });
      }
      const id = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const result = await escavadorService.getDiarioAppearances(id, page);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao buscar aparições" });
    }
  });

  // ==================== DEADLINES ====================
  app.get("/api/deadlines", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const deadlines = await storage.getDeadlinesByTenant(tenantId);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching deadlines:", error);
      res.status(500).json({ error: "Failed to fetch deadlines" });
    }
  });

  app.get("/api/deadlines/urgent", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const days = parseInt(req.query.days as string) || 3;
      const deadlines = await storage.getUrgentDeadlines(tenantId, days);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching urgent deadlines:", error);
      res.status(500).json({ error: "Failed to fetch urgent deadlines" });
    }
  });

  app.post("/api/deadlines", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const data = insertDeadlineSchema.parse({ ...req.body, tenantId });
      const deadline = await storage.createDeadline(data);
      res.status(201).json(deadline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating deadline:", error);
      res.status(500).json({ error: "Failed to create deadline" });
    }
  });

  // ==================== INVOICES ====================
  app.get("/api/invoices", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const invoices = await storage.getInvoicesByTenant(tenantId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices", async (req: Request, res: Response) => {
    try {
      const invoice = await storage.createInvoice(req.body);
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  app.put("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);

      const existing = await storage.getInvoice(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ error: "Fatura não encontrada" });
      }

      const { nfPath: _nfPath, ...safeData } = req.body;
      const invoice = await storage.updateInvoice(id, safeData);
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  app.post("/api/invoices/:id/upload-nf", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const file = req.file;
      const { nfNumber } = req.body;

      const existing = await storage.getInvoice(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ error: "Fatura não encontrada" });
      }

      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      const uploadDir = path.join(".", "uploads", `tenant_${tenantId}`, "nf");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const safeName = `nf_${id}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(uploadDir, safeName);
      fs.writeFileSync(filePath, file.buffer);

      const updatePayload: Partial<{ nfPath: string; nfNumber: string }> = { nfPath: filePath };
      if (nfNumber) updatePayload.nfNumber = nfNumber;

      const invoice = await storage.updateInvoice(id, updatePayload);
      res.json(invoice);
    } catch (error) {
      console.error("Error uploading NF:", error);
      res.status(500).json({ error: "Falha ao fazer upload da nota fiscal" });
    }
  });

  app.get("/api/invoices/:id/nf", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const invoice = await storage.getInvoice(id);

      if (!invoice || invoice.tenantId !== tenantId) {
        return res.status(404).json({ error: "Fatura não encontrada" });
      }

      if (!invoice.nfPath) {
        return res.status(404).json({ error: "Nota fiscal não anexada" });
      }

      const allowedDir = path.resolve(".", "uploads", `tenant_${tenantId}`, "nf");
      const resolvedPath = path.resolve(invoice.nfPath);
      if (!resolvedPath.startsWith(allowedDir)) {
        return res.status(403).json({ error: "Acesso negado ao arquivo" });
      }

      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: "Arquivo da nota fiscal não encontrado" });
      }

      const originalName = path.basename(resolvedPath).replace(/^nf_\d+_\d+_/, "");
      res.download(resolvedPath, originalName);
    } catch (error) {
      console.error("Error serving NF:", error);
      res.status(500).json({ error: "Falha ao servir nota fiscal" });
    }
  });

  app.post("/api/notas-fiscais", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const file = req.file;
      const { nfNumber, clientId, invoiceId, description, referenceMonth } = req.body;

      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      const uploadDir = path.join(".", "uploads", `tenant_${tenantId}`, "nf");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const safeName = `nf_standalone_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(uploadDir, safeName);
      fs.writeFileSync(filePath, file.buffer);

      if (clientId) {
        const client = await storage.getClient(Number(clientId), tenantId);
        if (!client) {
          return res.status(404).json({ error: "Cliente não encontrado" });
        }
      }

      if (invoiceId) {
        const inv = await storage.getInvoice(Number(invoiceId));
        if (!inv || inv.tenantId !== tenantId) {
          return res.status(404).json({ error: "Fatura não encontrada" });
        }
      }

      const nf = await storage.createNotaFiscal({
        tenantId,
        clientId: clientId ? Number(clientId) : null,
        invoiceId: invoiceId ? Number(invoiceId) : null,
        nfNumber: nfNumber || null,
        filePath,
        fileName: file.originalname,
        description: description || null,
        referenceMonth: referenceMonth || null,
      });

      if (invoiceId) {
        const invoiceUpdate: Partial<{ nfPath: string; nfNumber: string }> = { nfPath: filePath };
        if (nfNumber) invoiceUpdate.nfNumber = nfNumber;
        await storage.updateInvoice(Number(invoiceId), invoiceUpdate);
      }

      res.status(201).json(nf);
    } catch (error) {
      console.error("Error creating nota fiscal:", error);
      res.status(500).json({ error: "Falha ao criar nota fiscal" });
    }
  });

  app.get("/api/notas-fiscais", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const nfs = await storage.getNotasFiscaisByTenant(tenantId);
      res.json(nfs);
    } catch (error) {
      console.error("Error fetching notas fiscais:", error);
      res.status(500).json({ error: "Falha ao buscar notas fiscais" });
    }
  });

  app.get("/api/notas-fiscais/:id/download", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const nf = await storage.getNotaFiscal(id);

      if (!nf || nf.tenantId !== tenantId) {
        return res.status(404).json({ error: "Nota fiscal não encontrada" });
      }

      const allowedDir = path.resolve(".", "uploads", `tenant_${tenantId}`, "nf");
      const resolvedPath = path.resolve(nf.filePath);
      if (!resolvedPath.startsWith(allowedDir)) {
        return res.status(403).json({ error: "Acesso negado ao arquivo" });
      }

      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: "Arquivo da nota fiscal não encontrado" });
      }

      res.download(resolvedPath, nf.fileName);
    } catch (error) {
      console.error("Error serving nota fiscal:", error);
      res.status(500).json({ error: "Falha ao servir nota fiscal" });
    }
  });

  app.delete("/api/notas-fiscais/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const nf = await storage.getNotaFiscal(id);

      if (!nf || nf.tenantId !== tenantId) {
        return res.status(404).json({ error: "Nota fiscal não encontrada" });
      }

      if (fs.existsSync(nf.filePath)) {
        fs.unlinkSync(nf.filePath);
      }

      await storage.deleteNotaFiscal(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting nota fiscal:", error);
      res.status(500).json({ error: "Falha ao excluir nota fiscal" });
    }
  });

  app.get("/api/billing/summary", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const [allInvoices, allContracts, allClients] = await Promise.all([
        storage.getInvoicesByTenant(tenantId),
        storage.getContractsByTenant(tenantId),
        storage.getClientsByTenant(tenantId),
      ]);

      const now = new Date();
      const activeContracts = allContracts.filter(c => c.status === "ativo");
      const receitaContratual = activeContracts.reduce((sum, c) => sum + Number(c.monthlyValue || 0), 0);

      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const invoicesThisMonth = allInvoices.filter(inv => inv.referenceMonth === currentMonth || (inv.createdAt && inv.createdAt.toISOString().startsWith(currentMonth)));

      const totalFaturado = invoicesThisMonth.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
      const totalRecebido = allInvoices
        .filter(inv => inv.status === "pago")
        .filter(inv => inv.paidAt && inv.paidAt.getMonth() === now.getMonth() && inv.paidAt.getFullYear() === now.getFullYear())
        .reduce((sum, inv) => sum + Number(inv.paidAmount || inv.amount || 0), 0);

      const overdueInvoices = allInvoices.filter(inv =>
        inv.status !== "pago" && inv.status !== "cancelada" && inv.dueDate && new Date(inv.dueDate) < now
      );
      const totalInadimplencia = overdueInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

      const aging = { d30: 0, d60: 0, d90: 0, d90plus: 0 };
      overdueInvoices.forEach(inv => {
        const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
        const amt = Number(inv.amount || 0);
        if (days <= 30) aging.d30 += amt;
        else if (days <= 60) aging.d60 += amt;
        else if (days <= 90) aging.d90 += amt;
        else aging.d90plus += amt;
      });

      const clientMap = new Map(allClients.map(c => [c.id, c]));
      const contractMap = new Map(allContracts.map(c => [c.id, c]));

      const invoicesWithDetails = allInvoices.map(inv => {
        const client = clientMap.get(inv.clientId);
        const contract = contractMap.get(inv.contractId);
        return {
          ...inv,
          clientName: client?.name || "—",
          clientType: client?.type || "PF",
          contractType: contract?.type || "—",
          contractMonthlyValue: contract?.monthlyValue || null,
        };
      });

      res.json({
        kpis: {
          receitaContratual,
          totalFaturado,
          totalRecebido,
          totalInadimplencia,
          totalInvoices: allInvoices.length,
          overdueCount: overdueInvoices.length,
        },
        aging,
        invoices: invoicesWithDetails,
        activeContracts: activeContracts.map(c => {
          const client = clientMap.get(c.clientId);
          return { ...c, clientName: client?.name || "—" };
        }),
      });
    } catch (error) {
      console.error("Error fetching billing summary:", error);
      res.status(500).json({ error: "Failed to fetch billing summary" });
    }
  });

  // ==================== REPORTS / RELATÓRIOS ====================
  app.get("/api/reports/summary", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const [allClients, allContracts, allInvoices, allCases] = await Promise.all([
        storage.getClientsByTenant(tenantId),
        storage.getContractsByTenant(tenantId),
        storage.getInvoicesByTenant(tenantId),
        storage.getCasesByTenant(tenantId),
      ]);

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const activeContracts = allContracts.filter(c => c.status === "ativo");
      const receitaFixa = activeContracts
        .filter(c => c.type === "mensal" || c.type === "mensalidade")
        .reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
      const receitaVariavel = activeContracts
        .filter(c => c.type === "exito" || c.type === "êxito" || c.type === "hibrido" || c.type === "híbrido")
        .reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
      const receitaMensal = activeContracts.reduce((s, c) => s + Number(c.monthlyValue || 0), 0);

      const paidInvoices = allInvoices.filter(i => i.status === "pago");
      const pendingInvoices = allInvoices.filter(i => i.status !== "pago" && i.status !== "cancelada");
      const overdueInvoices = pendingInvoices.filter(i => i.dueDate && new Date(i.dueDate) < now);
      const pendenteCobranca = overdueInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);

      // Build contract lookup map: contractId -> contract type
      const contractTypeMap = new Map<number, string>();
      allContracts.forEach(c => contractTypeMap.set(c.id, c.type || "outro"));

      // Fallback: clientId -> first contract type (for invoices without contractId)
      const clientFallbackType = new Map<number, string>();
      allContracts.forEach(c => {
        if (!clientFallbackType.has(c.clientId)) clientFallbackType.set(c.clientId, c.type || "outro");
      });

      const isFixedType = (type: string) => {
        const normalized = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return normalized === "mensal" || normalized === "mensalidade";
      };

      const last6months: { mes: string; fixa: number; variavel: number; total: number }[] = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthInvoices = paidInvoices.filter(i =>
          i.referenceMonth === monthKey || (i.paidAt && i.paidAt.getMonth() === d.getMonth() && i.paidAt.getFullYear() === d.getFullYear())
        );
        let fixa = 0;
        let variavel = 0;
        monthInvoices.forEach(i => {
          // Per-invoice: use the invoice's contractId first, fall back to client's primary contract type
          const contractType = i.contractId
            ? (contractTypeMap.get(i.contractId) || "variavel")
            : (clientFallbackType.get(i.clientId) || "variavel");
          const amt = Number(i.amount || 0);
          if (isFixedType(contractType)) {
            fixa += amt;
          } else {
            variavel += amt;
          }
        });
        const total = fixa + variavel;
        last6months.push({ mes: label.charAt(0).toUpperCase() + label.slice(1), fixa: Math.round(fixa), variavel: Math.round(variavel), total });
      }

      const contractTypes = allContracts.reduce((acc: Record<string, number>, c) => {
        const t = c.type || "outro";
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      const distribuicaoContratos = Object.entries(contractTypes).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }));

      const expiringContracts = activeContracts.filter(c => {
        if (!c.endDate) return false;
        const end = new Date(c.endDate);
        const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays > 0 && diffDays <= 30;
      });

      const clientRevenue = new Map<number, number>();
      allInvoices.forEach(inv => {
        const prev = clientRevenue.get(inv.clientId) || 0;
        clientRevenue.set(inv.clientId, prev + Number(inv.amount || 0));
      });
      const sortedClients = Array.from(clientRevenue.entries()).sort((a, b) => b[1] - a[1]);
      const totalRevenue = sortedClients.reduce((s, [, v]) => s + v, 0);
      const top3Revenue = sortedClients.slice(0, 3).reduce((s, [, v]) => s + v, 0);
      const concentracaoPct = totalRevenue > 0 ? Math.round((top3Revenue / totalRevenue) * 100) : 0;

      const clientMap = new Map(allClients.map(c => [c.id, c]));
      const topClients = sortedClients.slice(0, 5).map(([id, revenue]) => ({
        name: clientMap.get(id)?.name || "—",
        revenue,
      }));

      const casesAtivos = allCases.filter(c => {
        const s = (c.status || "").toLowerCase().replace(/ /g, "_");
        return s === "em_andamento" || s === "ativo";
      });
      const casesFinalizados = allCases.filter(c => {
        const s = (c.status || "").toLowerCase();
        return s === "finalizado" || s === "arquivado" || s === "encerrado";
      });

      const casesLast6: { mes: string; novos: number; finalizados: number }[] = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
        const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        const novos = allCases.filter(c => c.createdAt && c.createdAt >= d && c.createdAt < nextMonth).length;
        casesLast6.push({ mes: label.charAt(0).toUpperCase() + label.slice(1), novos, finalizados: 0 });
      }

      const inadimplentes = new Set(overdueInvoices.map(i => i.clientId)).size;

      res.json({
        financeiro: {
          receitaMensal,
          receitaFixa,
          receitaVariavel,
          pendenteCobranca,
          previsao60dias: receitaMensal * 2,
          historico: last6months,
          totalRecebido: paidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
        },
        contratos: {
          ativos: activeContracts.length,
          total: allContracts.length,
          vencendo30dias: expiringContracts.length,
          inadimplentes,
          distribuicao: distribuicaoContratos,
        },
        clientes: {
          total: allClients.length,
          topRentaveis: topClients,
          concentracaoPct,
          dependenciaFinanceira: concentracaoPct >= 60
            ? `Alta (Top 3 clientes geram ${concentracaoPct}% da receita)`
            : concentracaoPct >= 40
            ? `Média (Top 3 clientes geram ${concentracaoPct}% da receita)`
            : `Saudável (Top 3 clientes geram ${concentracaoPct}% da receita)`,
        },
        processos: {
          total: allCases.length,
          ativos: casesAtivos.length,
          finalizados: casesFinalizados.length,
          historico: casesLast6,
        },
        performance: {
          faturasEmitidas: allInvoices.length,
          faturasPagas: paidInvoices.length,
          taxaRecebimento: allInvoices.length > 0 ? Math.round((paidInvoices.length / allInvoices.length) * 100) : 0,
          overdueCount: overdueInvoices.length,
          totalInadimplencia: pendenteCobranca,
        },
        alertas: [
          ...(concentracaoPct >= 60 ? [{
            type: "danger",
            title: "Concentração de Receita",
            message: `${concentracaoPct}% do faturamento depende de apenas 3 clientes. Alto risco operacional.`,
          }] : []),
          ...(expiringContracts.length > 0 ? [{
            type: "warning",
            title: "Contratos Vencendo",
            message: `${expiringContracts.length} contrato(s) vencem nos próximos 30 dias. Ação comercial necessária.`,
          }] : []),
          ...(overdueInvoices.length > 0 ? [{
            type: "warning",
            title: "Cobranças Pendentes",
            message: `${overdueInvoices.length} fatura(s) em atraso totalizando R$ ${pendenteCobranca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Iniciar cobrança.`,
          }] : []),
          ...(receitaVariavel > receitaFixa ? [{
            type: "info",
            title: "Oportunidade de Estabilização",
            message: "Receita variável supera a fixa. Considere converter clientes de êxito para contratos mensais.",
          }] : []),
        ],
      });
    } catch (error) {
      console.error("Error fetching reports summary:", error);
      res.status(500).json({ error: "Failed to fetch reports summary" });
    }
  });

  app.post("/api/reports/ai-diagnostic", async (req: Request, res: Response) => {
    try {
      const { firmData, question } = req.body;
      const isQuestion = !!question;

      const systemPrompt = isQuestion
        ? `Você é um consultor executivo especializado em gestão de escritórios de advocacia no Brasil. Responda à pergunta do gestor com base nos dados financeiros e operacionais fornecidos. Seja objetivo, direto e prático. Use dados concretos na resposta. Responda em português.`
        : `Você é um consultor executivo especializado em gestão de escritórios de advocacia no Brasil. Analise os dados consolidados do escritório e gere um relatório estratégico mensal completo com:

1. DIAGNÓSTICO GERAL - Saúde financeira e operacional
2. PONTOS FORTES - O que está funcionando bem
3. RISCOS IDENTIFICADOS - Problemas atuais e potenciais
4. AÇÕES PRIORITÁRIAS - 5 ações concretas ordenadas por urgência
5. PREVISÃO - Cenário para os próximos 60 dias

Seja objetivo e use números reais dos dados. Responda em português. Formate com títulos claros.`;

      const userMessage = isQuestion
        ? `Dados do escritório:\n${JSON.stringify(firmData, null, 2)}\n\nPergunta: ${question}`
        : `Dados consolidados do escritório:\n${JSON.stringify(firmData, null, 2)}`;

      const openai = (await import("openai")).default;
      const client = new openai({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      });

      res.json({ analysis: completion.choices[0]?.message?.content || "" });
    } catch (error) {
      console.error("Error generating AI diagnostic:", error);
      res.status(500).json({ error: "Failed to generate AI diagnostic" });
    }
  });

  // ==================== AI / LEXAI STUDIO ====================
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    try {
      const { messages, contextDocuments } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const response = await aiService.chat(messages, contextDocuments);
      
      await storage.createAiGenerationLog({
        tenantId: 1,
        userId: 1,
        generationType: "chat",
        prompt: messages[messages.length - 1]?.content || "",
        citations: response.citations as any,
        modelUsed: "gpt-4o",
        tokensUsed: response.tokensUsed,
        outputPreview: response.content.substring(0, 500),
      });

      res.json(response);
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ error: "Failed to process AI request" });
    }
  });

  app.post("/api/ai/daily-briefing", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const now = new Date();

      const allCases = await storage.getCasesByTenant(tenantId);
      const allDeadlines = await storage.getDeadlinesByTenant(tenantId);
      const allInvoices = await storage.getInvoicesByTenant(tenantId);
      const allContracts = await storage.getContractsByTenant(tenantId);
      const todayStr = now.toISOString().split("T")[0];
      const agendaToday = await storage.getAgendaEventsByDate(tenantId, todayStr);

      const activeCases = allCases.filter(c => c.status === "ativo" || c.status === "em_andamento");
      const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const urgentDeadlines = allDeadlines.filter(d => d.status === "pendente" && new Date(d.dueDate) >= now && new Date(d.dueDate) <= threeDays);
      const overdueInvoices = allInvoices.filter(inv => (inv.status !== "pago" && inv.status !== "cancelada") && new Date(inv.dueDate) < now);
      const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
      const pendingAmount = allInvoices.filter(inv => inv.status !== "pago" && inv.status !== "cancelada").reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

      // Overdue deadlines (dueDate < now, status pendente)
      const overdueDeadlines = allDeadlines.filter(d => d.status === "pendente" && new Date(d.dueDate) < now);

      // Today's intimations/movements from caseMovements
      const { caseMovements: caseMovementsTable, cases: casesTable } = await import("@shared/schema");
      const { db } = await import("./db");
      const { and: andOp, eq: eqOp, gte, lt } = await import("drizzle-orm");
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const todayMovements = await db.select({
        id: caseMovementsTable.id,
        caseId: caseMovementsTable.caseId,
        type: caseMovementsTable.type,
        description: caseMovementsTable.description,
        aiDeadlineSummary: caseMovementsTable.aiDeadlineSummary,
        aiDeadlineDate: caseMovementsTable.aiDeadlineDate,
        caseNumber: casesTable.caseNumber,
      }).from(caseMovementsTable)
        .innerJoin(casesTable, eqOp(caseMovementsTable.caseId, casesTable.id))
        .where(andOp(
          eqOp(casesTable.tenantId, tenantId),
          gte(caseMovementsTable.createdAt, todayStart),
          lt(caseMovementsTable.createdAt, todayEnd)
        ));

      // Stale cases (no movement > 30 days)
      const thirtyDaysAgoBriefing = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const staleCasesCount = activeCases.filter(c => {
        const ref = c.datajudLastSync ? new Date(c.datajudLastSync) : new Date(c.createdAt);
        return ref < thirtyDaysAgoBriefing;
      }).length;

      const contextData = `
DATA: ${now.toLocaleDateString("pt-BR")} (${now.toLocaleDateString("pt-BR", { weekday: "long" })})

AGENDA HOJE: ${agendaToday.length} compromisso(s)
${agendaToday.map(e => `  • ${e.timeStart} - ${e.title} (${e.type})`).join("\n") || "  Nenhum compromisso"}

PRAZOS JÁ VENCIDOS (pendentes): ${overdueDeadlines.length}
${overdueDeadlines.slice(0, 5).map(d => {
  const c = allCases.find(cs => cs.id === d.caseId);
  return `  • VENCIDO em ${new Date(d.dueDate).toLocaleDateString("pt-BR")} - ${d.title}${c ? ` (${c.caseNumber})` : ""}`;
}).join("\n") || "  Nenhum prazo vencido"}

INTIMAÇÕES/MOVIMENTAÇÕES DO DIA: ${todayMovements.length}
${todayMovements.slice(0, 5).map(m => `  • ${m.caseNumber} - ${m.type}${m.aiDeadlineSummary ? `: ${m.aiDeadlineSummary}` : ""}`).join("\n") || "  Nenhuma intimação hoje"}

PRAZOS URGENTES (próximos 3 dias): ${urgentDeadlines.length}
${urgentDeadlines.map(d => {
  const c = allCases.find(cs => cs.id === d.caseId);
  return `  • ${new Date(d.dueDate).toLocaleDateString("pt-BR")} - ${d.title}${c ? ` (${c.caseNumber})` : ""}`;
}).join("\n") || "  Nenhum prazo urgente"}

FINANCEIRO:
  • Faturas vencidas: ${overdueInvoices.length} (total: R$ ${totalOverdue.toFixed(2)})
  • Valores pendentes: R$ ${pendingAmount.toFixed(2)}

PROCESSOS: ${activeCases.length} ativos de ${allCases.length} total | ${staleCasesCount} parados há mais de 30 dias
CONTRATOS: ${allContracts.filter(c => c.status === "ativo").length} ativos
`;

      const messages = [
        {
          role: "user" as const,
          content: `Você é o assistente jurídico de um escritório de advocacia. Com base nos dados abaixo, gere um BRIEFING EXECUTIVO DO DIA extremamente conciso e direto (MÁXIMO 3 parágrafos curtos, estilo telegrama executivo).

REGRAS OBRIGATÓRIAS:
- Máximo 3 parágrafos curtos (cada parágrafo = 2-3 frases no máximo)
- Linguagem direta, sem introduções longas
- Primeiro parágrafo: cumprimento rápido + alertas críticos (prazos VENCIDOS e intimações do dia primeiro)
- Segundo parágrafo: agenda do dia + prazos urgentes dos próximos 3 dias
- Terceiro parágrafo: situação financeira + uma recomendação prioritária
- Se não houver prazos vencidos ou intimações, mencione apenas os urgentes
- Nunca use markdown, títulos ou listas numeradas

${contextData}`
        }
      ];

      const response = await aiService.chat(messages);

      await storage.createAiGenerationLog({
        tenantId,
        userId: 1,
        generationType: "daily_briefing",
        prompt: "Daily briefing generation",
        citations: response.citations as any,
        modelUsed: "gpt-4o",
        tokensUsed: response.tokensUsed,
        outputPreview: response.content.substring(0, 500),
      });

      res.json({ briefing: response.content });
    } catch (error) {
      console.error("Error generating daily briefing:", error);
      res.status(500).json({ error: "Failed to generate briefing" });
    }
  });

  app.post("/api/ai/strategic-analysis", async (req: Request, res: Response) => {
    try {
      const { clientId } = req.body;
      const tenantId = getTenantId(req);

      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }

      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const cases = await storage.getCasesByClient(clientId);
      const contracts = await storage.getContractsByClient(clientId);
      const invoices = await storage.getInvoicesByClient(clientId);
      const deadlines = await storage.getDeadlinesByClient(clientId);

      const activeCases = cases.filter((c: any) => c.status === "ativo" || c.status === "em_andamento");
      const wonCases = cases.filter((c: any) => c.status === "ganho" || c.status === "favorável");
      const lostCases = cases.filter((c: any) => c.status === "perdido");
      const activeContracts = contracts.filter((c: any) => c.status === "ativo");
      const totalValue = activeCases.reduce((sum: number, c: any) => sum + (parseFloat(c.value) || 0), 0);
      const totalInvoiced = invoices.reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);
      const totalPaid = invoices.filter((i: any) => i.status === "pago").reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0);
      const upcomingDeadlines = deadlines.filter((d: any) => new Date(d.date) > new Date()).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 10);

      const contextSummary = `
DADOS DO CLIENTE: ${client.name}
Tipo: ${client.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
Documento: ${client.document || "Não informado"}

PROCESSOS (${cases.length} total):
- Ativos: ${activeCases.length}
- Ganhos: ${wonCases.length}
- Perdidos: ${lostCases.length}
- Valor total em disputa: R$ ${totalValue.toFixed(2)}
${activeCases.map((c: any) => `  • ${c.title} (${c.caseNumber}) - ${c.court} - R$ ${parseFloat(c.value || 0).toFixed(2)} - Tipo: ${c.type}`).join("\n")}

CONTRATOS (${contracts.length} total, ${activeContracts.length} ativos):
${contracts.map((c: any) => `  • ${c.type} - Status: ${c.status} - Valor mensal: R$ ${parseFloat(c.monthlyValue || 0).toFixed(2)}`).join("\n")}

FINANCEIRO:
- Total faturado: R$ ${totalInvoiced.toFixed(2)}
- Total recebido: R$ ${totalPaid.toFixed(2)}
- Total pendente: R$ ${(totalInvoiced - totalPaid).toFixed(2)}

PRÓXIMOS PRAZOS:
${upcomingDeadlines.length > 0 ? upcomingDeadlines.map((d: any) => `  • ${new Date(d.date).toLocaleDateString("pt-BR")} - ${d.title} (${d.type})`).join("\n") : "  Nenhum prazo próximo"}
`;

      const messages = [
        {
          role: "user" as const,
          content: `Analise os dados abaixo e gere uma ANÁLISE ESTRATÉGICA JURÍDICA completa para o cliente. Estruture sua resposta nos seguintes tópicos:

1. **SITUAÇÃO ATUAL**: Resumo geral da posição jurídica do cliente
2. **PONTOS DE ATENÇÃO**: Riscos identificados, prazos críticos, processos preocupantes
3. **OPORTUNIDADES**: Possibilidades de acordo, chances de êxito, otimizações
4. **ANÁLISE FINANCEIRA**: Comentários sobre a saúde financeira da relação (faturamento, inadimplência, etc.)
5. **RECOMENDAÇÕES**: Ações concretas sugeridas para o escritório em ordem de prioridade
6. **PRÓXIMOS PASSOS**: Atividades imediatas que devem ser realizadas

Seja específico e pragmático, referenciando os processos e dados reais. Evite generalizações vagas.

${contextSummary}`
        }
      ];

      const response = await aiService.chat(messages);

      await storage.createAiGenerationLog({
        tenantId,
        userId: 1,
        generationType: "strategic_analysis",
        prompt: `Strategic analysis for client ${client.name} (ID: ${clientId})`,
        citations: response.citations as any,
        modelUsed: "gpt-4o",
        tokensUsed: response.tokensUsed,
        outputPreview: response.content.substring(0, 500),
      });

      res.json({ analysis: response.content });
    } catch (error) {
      console.error("Error in strategic analysis:", error);
      res.status(500).json({ error: "Failed to generate strategic analysis" });
    }
  });

  app.post("/api/ai/analyze-file", async (req: Request, res: Response) => {
    try {
      const { content, fileName, isImage, imageBase64 } = req.body;
      
      if (!fileName) {
        return res.status(400).json({ error: "fileName is required" });
      }

      const response = await aiService.analyzeFile(
        content || "",
        fileName,
        isImage || false,
        imageBase64
      );

      res.json(response);
    } catch (error) {
      console.error("Error analyzing file:", error);
      res.status(500).json({ error: "Failed to analyze file" });
    }
  });

  app.post("/api/ai/transcribe", async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType, participants, recentUtterances, activeSpeakerHint } = req.body;

      if (!audioBase64) {
        return res.status(400).json({ error: "audioBase64 is required" });
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      const rawMime = mimeType || "audio/webm";
      const audioMime = rawMime.split(";")[0].trim();
      console.log(`[Transcribe] Received audio: ${audioBuffer.length} bytes, mime: ${audioMime}${activeSpeakerHint ? `, hint: ${activeSpeakerHint}` : ""}`);

      if (audioBuffer.length < 1000) {
        console.log("[Transcribe] Audio too small, skipping");
        return res.json({ text: "", segments: [] });
      }

      const { transcribeAudio } = await import("./services/transcriptionAI");
      const result = await transcribeAudio(
        audioBase64,
        audioMime,
        Array.isArray(participants) ? participants : [],
        Array.isArray(recentUtterances) ? recentUtterances : [],
        typeof activeSpeakerHint === "string" && activeSpeakerHint.trim() ? activeSpeakerHint.trim() : undefined
      );

      res.json(result);
    } catch (error) {
      console.error("[Transcribe] Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // ==================== INTERPRETER — PT→EN translation, phonetic, teleprompter ====================

  // Whisper transcription for interpreter Mode 1 (Neural) — uses OpenAI Whisper, not Gemini
  app.post("/api/ai/whisper-transcribe", requireAuth, async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType, language } = req.body;
      if (!audioBase64) return res.status(400).json({ error: "audioBase64 is required" });
      const whisperLang = typeof language === "string" && language.length >= 2 ? language : "pt";

      const audioBuffer = Buffer.from(audioBase64, "base64");
      if (audioBuffer.length < 1000) return res.json({ text: "" });

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const { toFile } = await import("openai");
      const ext = (mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm";
      const audioFile = await toFile(audioBuffer, `recording.${ext}`, { type: mimeType || "audio/webm" });

      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: whisperLang,
      });

      res.json({ text: transcription.text || "" });
    } catch (error) {
      console.error("[Whisper] Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio via Whisper" });
    }
  });

  app.post("/api/ai/interpret", requireAuth, async (req: Request, res: Response) => {
    try {
      const { text, mode, meetingType } = req.body;
      const VALID_MODES = ["neural", "phonetic", "teleprompter"] as const;
      if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
      if (text.length > 2000) return res.status(400).json({ error: "text exceeds 2000 character limit" });
      if (mode && !VALID_MODES.includes(mode)) return res.status(400).json({ error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` });

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const toneNote = meetingType === "negociacao"
        ? "Use diplomatic and persuasive legal negotiation language."
        : meetingType === "consultoria"
        ? "Use professional legal advisory language."
        : "Use formal professional language.";

      let systemPrompt = "";
      let userPrompt = "";

      if (mode === "phonetic") {
        systemPrompt = `You are a phonetic transliteration expert specialized in helping Brazilian Portuguese speakers pronounce English. Given a Portuguese sentence:
1. Translate it to English (translationLiteral field).
2. Generate a phonetic guide using Brazilian Portuguese phoneme approximations so a native PT speaker can read English aloud. Rules:
   - Use PT phonemes: "w" → "u" (we → ui), "th" → "d" or "z" (this → dis, the → di), "sh" → "ch" (sure → chur), "-tion" → "xen" (jurisdiction → djuris-DIC-xen), "j" → "dj" (just → djast), silent letters omitted, "r" at start like PT "r".
   - Separate syllables with hyphens within each word.
   - Write stressed/tonic syllables in UPPERCASE.
   - Words separated by spaces.
Return JSON only with fields: translationLiteral, phonetic.`;
        userPrompt = `Portuguese: "${text}"\nReturn JSON only.`;
      } else if (mode === "teleprompter") {
        systemPrompt = `You are a bilingual legal English coach. ${toneNote} Given a Portuguese sentence, return three things:
1. translationLiteral: literal, word-for-word English translation.
2. translationPolished: polished, eloquent, professional English version suitable for speaking in a meeting. Make it flow naturally and sound confident.
3. ptBack: Portuguese back-translation of the polished version, so the speaker understands exactly what the polished version says (may differ from original).
Return JSON only with these three fields.`;
        userPrompt = `Portuguese: "${text}"\nReturn JSON only.`;
      } else {
        systemPrompt = `You are a professional Portuguese-to-English translator specializing in legal contexts. ${toneNote} Translate the following Portuguese text to professional English. Return JSON only with field: translationLiteral.`;
        userPrompt = `Portuguese: "${text}"\nReturn JSON only.`;
      }

      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);

      res.json({
        translationLiteral: parsed.translationLiteral || "",
        translationPolished: parsed.translationPolished || "",
        phonetic: parsed.phonetic || "",
        ptBack: parsed.ptBack || "",
      });
    } catch (error) {
      console.error("[Interpret] Error:", error);
      res.status(500).json({ error: "Failed to interpret text" });
    }
  });

  app.post("/api/ai/tts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { text, voice = "nova" } = req.body;
      if (!text) return res.status(400).json({ error: "text is required" });

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const speech = await client.audio.speech.create({
        model: "tts-1",
        voice: voice as "nova",
        input: text,
      });

      const buffer = Buffer.from(await speech.arrayBuffer());
      res.set("Content-Type", "audio/mpeg");
      res.set("Content-Length", buffer.length.toString());
      res.send(buffer);
    } catch (error) {
      console.error("[TTS] Error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  app.post("/api/ai/translate-en-pt", requireAuth, async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "text is required" });

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Translate the following English text to Brazilian Portuguese. Return only the translation, no explanations." },
          { role: "user", content: text },
        ],
        max_tokens: 400,
      });

      const translation = completion.choices[0]?.message?.content?.trim() || "";
      res.json({ translation });
    } catch (error) {
      console.error("[TranslateENPT] Error:", error);
      res.status(500).json({ error: "Failed to translate" });
    }
  });

  app.post("/api/ai/extract-text", async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName, isReferenceModel } = req.body;
      
      if (!fileBase64 || !fileName) {
        return res.status(400).json({ error: "fileBase64 and fileName are required" });
      }

      const buffer = Buffer.from(fileBase64, "base64");
      let extractedText = "";

      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);

      if (isImage) {
        const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "";
        if (geminiKey) {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL } });
          const ext = fileName.split('.').pop()?.toLowerCase() || "jpeg";
          const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
          const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: [
              { role: "user", parts: [
                { text: "Extraia TODO o texto visível desta imagem. Retorne APENAS o texto extraído, sem comentários ou formatação adicional. Se houver dados como nome, CPF/CNPJ, endereço, telefone, email, destaque-os." },
                { inlineData: { mimeType: mimeMap[ext] || "image/jpeg", data: fileBase64 } }
              ] }
            ]
          });
          extractedText = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
        const mammoth = await import("mammoth");
        if (isReferenceModel) {
          const htmlResult = await mammoth.default.convertToHtml({ buffer }, {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ]
          });
          extractedText = htmlResult.value;
          console.log(`[extract-text] Reference model: extracted HTML (${extractedText.length} chars)`);
        } else {
          const result = await mammoth.default.extractRawText({ buffer });
          extractedText = result.value;
        }
      } else if (fileName.endsWith(".pdf")) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const parser = new (PDFParse as any)({ data: buffer });
          await parser.load();
          const result = await parser.getText();
          extractedText = (typeof result === "string" ? result : result?.text || "") as string;
          try { await parser.destroy(); } catch {}
        } catch (e) {
          console.log("[extract-text] PDF parse error, will try Gemini OCR:", (e as any)?.message);
        }

        const cleanText = extractedText.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim();
        if (!cleanText || cleanText.length < 30) {
          console.log(`[extract-text] PDF appears scanned (extracted ${cleanText.length} chars), using Gemini OCR...`);
          const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "";
          if (geminiKey) {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL } });
            const response = await ai.models.generateContent({
              model: "gemini-2.5-pro",
              contents: [
                { role: "user", parts: [
                  { text: "Este é um PDF digitalizado/escaneado. Extraia TODO o texto visível de todas as páginas. Retorne APENAS o texto extraído, sem comentários. Se houver dados como nome, CPF/CNPJ, endereço, telefone, email, razão social, destaque-os." },
                  { inlineData: { mimeType: "application/pdf", data: fileBase64 } }
                ] }
              ]
            });
            extractedText = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            console.log(`[extract-text] Gemini OCR extracted ${extractedText.length} chars from scanned PDF`);
          }
        }
      } else {
        extractedText = buffer.toString("utf-8");
      }

      if (!extractedText || extractedText.trim().length === 0) {
        return res.json({ text: "", error: "Não foi possível extrair texto do arquivo" });
      }

      const response = await aiService.analyzeFile(extractedText, fileName, false);

      res.json({ text: extractedText.substring(0, 5000), analysis: response.content });
    } catch (error) {
      console.error("Error extracting text:", error);
      res.status(500).json({ error: "Failed to extract text from file" });
    }
  });

  app.post("/api/ai/upload-file", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const fileName = (req.body.fileName || file?.originalname || "unknown").toString();

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const buffer = file.buffer;
      const mimeType = file.mimetype || "";
      console.log(`[upload-file] Received: ${fileName} (${mimeType}, ${buffer.length} bytes)`);

      if (mimeType.startsWith("image/")) {
        const base64 = buffer.toString("base64");
        const response = await aiService.analyzeFile("", fileName, true, base64);
        return res.json({ type: "image", content: response.content });
      }

      if (mimeType.startsWith("audio/") || mimeType.startsWith("video/") || /\.(mp3|wav|ogg|m4a|webm|mp4)$/i.test(fileName)) {
        const base64 = buffer.toString("base64");
        const { GoogleGenAI } = await import("@google/genai");
        const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "";
        if (!geminiKey) {
          return res.json({ type: "audio", text: "", error: "Gemini API key not configured" });
        }
        const genAI = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
        });
        const response = await genAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: "Transcreva o áudio a seguir em português. Retorne APENAS a transcrição, sem comentários." },
                { inlineData: { mimeType: mimeType || "audio/webm", data: base64 } },
              ],
            },
          ],
        });
        const text = response?.text || "";
        return res.json({ type: "audio", text: text.trim() });
      }

      if (fileName.endsWith(".pdf")) {
        const { PDFParse } = await import("pdf-parse");
        const parser = new (PDFParse as any)({ data: buffer });
        await parser.load();
        const result = await parser.getText();
        const extractedText = (typeof result === "string" ? result : result?.text || "") as string;
        try { await parser.destroy(); } catch {}

        if (!extractedText.trim()) {
          return res.json({ type: "document", text: "", error: "PDF escaneado - sem texto extraível. Envie como imagem para OCR." });
        }

        const aiResponse = await aiService.analyzeFile(extractedText, fileName, false);
        return res.json({ type: "document", text: extractedText.substring(0, 3000), analysis: aiResponse.content });
      }

      if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.default.extractRawText({ buffer });
        const extractedText = result.value;

        if (!extractedText.trim()) {
          return res.json({ type: "document", text: "", error: "Não foi possível extrair texto do documento." });
        }

        const aiResponse = await aiService.analyzeFile(extractedText, fileName, false);
        return res.json({ type: "document", text: extractedText.substring(0, 3000), analysis: aiResponse.content });
      }

      const text = buffer.toString("utf-8").substring(0, 6000);
      const aiResponse = await aiService.analyzeFile(text, fileName, false);
      return res.json({ type: "text", content: aiResponse.content });
    } catch (error: any) {
      console.error("[upload-file] Error:", error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message || "desconhecido"}` });
    }
  });

  app.post("/api/ai/generate-piece", async (req: Request, res: Response) => {
    try {
      const { pieceType, caseContext, intimationText, additionalInstructions } = req.body;
      
      if (!pieceType || !caseContext || !intimationText) {
        return res.status(400).json({ error: "pieceType, caseContext, and intimationText are required" });
      }

      const response = await aiService.generatePiece(
        pieceType,
        caseContext,
        intimationText,
        additionalInstructions
      );

      await storage.createAiGenerationLog({
        tenantId: 1,
        userId: 1,
        generationType: "peca",
        prompt: `Gerar ${pieceType} para: ${intimationText}`,
        citations: response.citations as any,
        modelUsed: "gpt-4o",
        tokensUsed: response.tokensUsed,
        outputPreview: response.content.substring(0, 500),
      });

      res.json(response);
    } catch (error) {
      console.error("Error generating piece:", error);
      res.status(500).json({ error: "Failed to generate piece" });
    }
  });

  function isJuizadoEspecial(params: { classeNome?: string | null; vara?: string | null; caseNumber?: string | null; court?: string | null }): boolean {
    const { classeNome, vara, caseNumber, court } = params;
    const classeNomeUpper = (classeNome || "").toUpperCase();
    if (classeNomeUpper.includes("JUIZADO ESPECIAL")) return true;
    if (classeNomeUpper.includes("PROCEDIMENTO DO JUIZADO")) return true;
    if (classeNomeUpper.includes("TURMA RECURSAL")) return true;

    const varaUpper = (vara || "").toUpperCase();
    if (varaUpper.includes("JUIZADO ESPECIAL")) return true;
    if (varaUpper.includes("TURMA RECURSAL")) return true;
    if (/\bJE[CF]?\b/.test(varaUpper)) return true;
    if (/\bJUIZADO\b/.test(varaUpper)) return true;

    const courtUpper = (court || "").toUpperCase();
    if (courtUpper.includes("JUIZADO ESPECIAL")) return true;
    if (courtUpper.includes("TURMA RECURSAL")) return true;

    return false;
  }

  function addBusinessDays(startDate: Date, businessDays: number): Date {
    const result = new Date(startDate);
    let added = 0;
    while (added < businessDays) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) {
        added++;
      }
    }
    return result;
  }

  function addCalendarDays(startDate: Date, days: number): Date {
    const result = new Date(startDate);
    result.setDate(result.getDate() + days);
    return result;
  }

  function countDaysRemaining(deadlineDate: Date, type: "uteis" | "corridos" = "uteis"): number {
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    today.setHours(0, 0, 0, 0);
    const target = new Date(deadlineDate);
    target.setHours(0, 0, 0, 0);
    if (target <= today) return 0;

    if (type === "corridos") {
      return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    let count = 0;
    const current = new Date(today);
    while (current < target) {
      current.setDate(current.getDate() + 1);
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) {
        count++;
      }
    }
    return count;
  }

  function calculateDeadlineDate(startDate: Date, days: number, type: "uteis" | "corridos"): Date {
    let deadlineDate: Date;
    if (type === "corridos") {
      deadlineDate = addCalendarDays(startDate, days);
      const dow = deadlineDate.getDay();
      if (dow === 0) deadlineDate.setDate(deadlineDate.getDate() + 1);
      else if (dow === 6) deadlineDate.setDate(deadlineDate.getDate() + 2);
    } else {
      deadlineDate = addBusinessDays(startDate, days);
    }
    return deadlineDate;
  }

  app.post("/api/ai/analyze-intimacao", async (req: Request, res: Response) => {
    try {
      const { description, teor, type, caseNumber, court, caseClass, intimationDate, classeNome, vara } = req.body;

      if (!description) {
        return res.status(400).json({ error: "description is required" });
      }

      const isJuizado = isJuizadoEspecial({ classeNome, vara, court, caseNumber });
      const deadlineCountingRule = isJuizado
        ? `ATENÇÃO: Este processo tramita em JUIZADO ESPECIAL. Os prazos devem ser contados em DIAS CORRIDOS (Art. 12-A da Lei 9.099/95, incluído pela Lei 13.728/2018). Somente se excluem da contagem os dias em que não houver expediente forense. O campo deadlineType DEVE ser "corridos".`
        : `Este processo tramita na JUSTIÇA COMUM. Os prazos devem ser contados em DIAS ÚTEIS conforme Art. 219 do CPC/2015. Excluem-se sábados, domingos e feriados. O campo deadlineType DEVE ser "uteis".`;

      const prompt = `Você é um advogado brasileiro sênior, especialista em processo civil, trabalhista e penal. Analise a seguinte movimentação processual/intimação e determine:

1. Se requer ação do advogado (sim/não)
2. O tipo de peça processual mais adequado para responder (se aplicável)
3. O prazo processual aplicável com base na legislação brasileira vigente (CPC, CLT, CPP, leis especiais). Informe o número exato de dias do prazo.
4. O fundamento legal do prazo (artigo, parágrafo, lei)
5. Uma breve justificativa da sugestão
6. Se o prazo é em dias úteis ou corridos

REGRA FUNDAMENTAL DE CONTAGEM DE PRAZOS:
${deadlineCountingRule}

REGRAS DE PRAZOS DO CPC (referência - Justiça Comum em dias ÚTEIS):
- Contestação: 15 dias (art. 335)
- Réplica/Impugnação à contestação: 15 dias (art. 351)
- Recurso de Apelação: 15 dias (art. 1.003, §5º)
- Agravo de Instrumento: 15 dias (art. 1.003, §5º)
- Embargos de Declaração: 5 dias (art. 1.023)
- Embargos à Execução: 15 dias (art. 915)
- Impugnação ao Cumprimento de Sentença: 15 dias (art. 525)
- Manifestação genérica: 5 dias (art. 218, §3º)
- Recurso Especial/Extraordinário: 15 dias (art. 1.003, §5º)
- Contrarrazões: mesmo prazo do recurso
- Cumprimento voluntário de sentença: 15 dias (art. 523)
- Reconvenção: 15 dias (art. 343)

PRAZOS DOS JUIZADOS ESPECIAIS (Lei 9.099/95 - dias CORRIDOS):
- Recurso Inominado: 10 dias corridos (art. 42)
- Embargos de Declaração: 5 dias corridos (art. 49)
- Contrarrazões ao Recurso Inominado: 10 dias corridos (art. 42, §2º)
- Contestação: audiência de conciliação (art. 30)
- Execução de sentença: 15 dias corridos

REGRAS DE CONTAGEM:
- Exclui o dia do início (dia da intimação)
- Inclui o dia do vencimento
${isJuizado ? '- Conta dias CORRIDOS (Art. 12-A, Lei 9.099/95) - somente se excluem dias sem expediente forense' : '- Só conta dias ÚTEIS (Art. 219, CPC) - exclui sábados, domingos e feriados'}
- Se o vencimento cair em dia não útil, prorroga para o próximo dia útil

MOVIMENTAÇÃO/INTIMAÇÃO:
Tipo: ${type || "Não especificado"}
Processo: ${caseNumber || "Não informado"}
Vara/Tribunal: ${vara || court || "Não informado"}
Classe Processual: ${classeNome || caseClass || "Não informada"}
Data da Intimação: ${intimationDate || "Não informada"}
${isJuizado ? '⚠️ PROCESSO DE JUIZADO ESPECIAL - PRAZOS EM DIAS CORRIDOS' : ''}
Descrição: ${description}
${teor ? `Teor completo: ${teor}` : ""}

Responda APENAS em JSON válido neste formato exato:
{
  "requiresAction": true ou false,
  "suggestedPieceType": "nome da peça (ex: Contestação, Apelação, Embargos de Declaração, Manifestação, etc.) ou null se não requer ação",
  "deadlineDays": número inteiro de dias do prazo ou null,
  "deadlineType": "${isJuizado ? 'corridos' : 'uteis'}",
  "legalBasis": "fundamento legal (ex: Art. 335, CPC) ou null",
  "justification": "breve explicação do prazo e da peça sugerida",
  "urgency": "alta", "media" ou "baixa",
  "summary": "resumo em 1 frase do que a intimação determina"
}`;

      const response = await aiService.chat([
        { role: "user", content: prompt }
      ]);

      let analysis;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
          requiresAction: false,
          suggestedPieceType: null,
          deadlineDays: null,
          deadlineType: "uteis",
          legalBasis: null,
          justification: "Não foi possível analisar automaticamente",
          urgency: "baixa",
          summary: "Movimentação sem prazo identificado"
        };
      } catch {
        analysis = {
          requiresAction: false,
          suggestedPieceType: null,
          deadlineDays: null,
          deadlineType: "uteis",
          legalBasis: null,
          justification: "Não foi possível analisar automaticamente",
          urgency: "baixa",
          summary: "Movimentação sem prazo identificado"
        };
      }

      const enforcedType = isJuizado ? "corridos" : "uteis";
      analysis.deadlineType = enforcedType;
      analysis.isJuizadoEspecial = isJuizado;

      if (analysis.deadlineDays && intimationDate) {
        try {
          const startDate = new Date(intimationDate);
          if (!isNaN(startDate.getTime())) {
            const deadlineType: "uteis" | "corridos" = analysis.deadlineType;
            const deadlineDate = calculateDeadlineDate(startDate, analysis.deadlineDays, deadlineType);
            analysis.deadlineDate = deadlineDate.toISOString().split('T')[0];
            analysis.daysRemaining = countDaysRemaining(deadlineDate, deadlineType);
            analysis.countingType = deadlineType === "corridos" ? "dias corridos (Juizado Especial - Art. 12-A, Lei 9.099/95)" : "dias úteis (Art. 219, CPC)";
            
            if (analysis.daysRemaining <= 0) {
              analysis.deadlineStatus = "vencido";
            } else if (analysis.daysRemaining <= 2) {
              analysis.deadlineStatus = "critico";
              analysis.urgency = "alta";
            } else if (analysis.daysRemaining <= 5) {
              analysis.deadlineStatus = "urgente";
              if (analysis.urgency !== "alta") analysis.urgency = "media";
            } else {
              analysis.deadlineStatus = "normal";
            }
          }
        } catch (e) {
          console.error("Error calculating deadline date:", e);
        }
      }

      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing intimação:", error);
      res.status(500).json({ error: "Failed to analyze intimação" });
    }
  });

  app.post("/api/ai/summarize", async (req: Request, res: Response) => {
    try {
      const { documentContent, documentTitle } = req.body;
      
      if (!documentContent || !documentTitle) {
        return res.status(400).json({ error: "documentContent and documentTitle are required" });
      }

      const response = await aiService.summarizeDocument(documentContent, documentTitle);
      res.json(response);
    } catch (error) {
      console.error("Error summarizing document:", error);
      res.status(500).json({ error: "Failed to summarize document" });
    }
  });

  app.post("/api/ai/extract", async (req: Request, res: Response) => {
    try {
      const { documentContent, extractionType } = req.body;
      
      if (!documentContent || !extractionType) {
        return res.status(400).json({ error: "documentContent and extractionType are required" });
      }

      const data = await aiService.extractDataFromDocument(documentContent, extractionType);
      res.json(data);
    } catch (error) {
      console.error("Error extracting data:", error);
      res.status(500).json({ error: "Failed to extract data" });
    }
  });

  app.post("/api/ai/extract-debtor", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      const buffer = file.buffer;
      const fileName = (req.body.fileName || file.originalname || "unknown").toString();
      const mimeType = file.mimetype || "";
      let extractedText = "";

      if (mimeType.startsWith("image/")) {
        const base64 = buffer.toString("base64");
        const prompt = `Analise esta imagem de documento e extraia os dados de um devedor/pessoa.
Retorne APENAS um JSON válido com estes campos (preencha o que encontrar, deixe string vazia para campos não encontrados):
{
  "type": "PF ou PJ",
  "name": "nome completo ou razão social",
  "document": "CPF ou CNPJ",
  "email": "email",
  "phone": "telefone",
  "whatsapp": "whatsapp",
  "address": "endereço completo",
  "city": "cidade",
  "state": "estado/UF",
  "zipCode": "CEP",
  "totalDebt": "valor da dívida se mencionado",
  "notes": "outras informações relevantes"
}`;
        const response = await aiService.analyzeFile(prompt, fileName, true, base64);
        try {
          const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            return res.json(parsed);
          }
        } catch {}
        return res.json({ rawExtraction: response.content });
      }

      if (fileName.endsWith(".pdf")) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const parser = new (PDFParse as any)({ data: buffer });
          await parser.load();
          const result = await parser.getText();
          extractedText = (typeof result === "string" ? result : result?.text || "") as string;
          try { await parser.destroy(); } catch {}
        } catch {
          extractedText = "";
        }
      } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.default.extractRawText({ buffer });
        extractedText = result.value;
      } else if (fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/i)) {
        const base64 = buffer.toString("base64");
        const prompt = `Analise esta imagem de documento e extraia os dados de um devedor/pessoa.
Retorne APENAS um JSON válido com estes campos (preencha o que encontrar, deixe string vazia para campos não encontrados):
{"type":"PF ou PJ","name":"","document":"","email":"","phone":"","whatsapp":"","address":"","city":"","state":"","zipCode":"","totalDebt":"","notes":""}`;
        const response = await aiService.analyzeFile(prompt, fileName, true, base64);
        try {
          const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) return res.json(JSON.parse(jsonMatch[1] || jsonMatch[0]));
        } catch {}
        return res.json({ rawExtraction: response.content });
      } else {
        extractedText = buffer.toString("utf-8");
      }

      if (!extractedText || extractedText.trim().length < 10) {
        if (mimeType.startsWith("image/") || fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/i)) {
          const base64 = buffer.toString("base64");
          const prompt = `Analise esta imagem e extraia dados de devedor/pessoa. Retorne JSON com: type, name, document, email, phone, whatsapp, address, city, state, zipCode, totalDebt, notes`;
          const response = await aiService.analyzeFile(prompt, fileName, true, base64);
          try {
            const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) return res.json(JSON.parse(jsonMatch[1] || jsonMatch[0]));
          } catch {}
          return res.json({ rawExtraction: response.content });
        }
        return res.status(400).json({ error: "Não foi possível extrair texto do arquivo. Tente enviar como imagem para OCR." });
      }

      const prompt = `Extraia os dados de devedor/pessoa do seguinte texto de documento. 
Retorne APENAS um JSON válido com estes campos (preencha o que encontrar, deixe string vazia para campos não encontrados):
{
  "type": "PF ou PJ (PF=pessoa física, PJ=pessoa jurídica)",
  "name": "nome completo ou razão social",
  "document": "CPF ou CNPJ formatado",
  "email": "email",
  "phone": "telefone formatado",
  "whatsapp": "whatsapp formatado",
  "address": "endereço completo",
  "city": "cidade",
  "state": "estado/UF (sigla)",
  "zipCode": "CEP formatado",
  "totalDebt": "valor da dívida se mencionado (apenas números e vírgula)",
  "notes": "outras informações relevantes encontradas no documento"
}

TEXTO DO DOCUMENTO:
${extractedText.substring(0, 8000)}`;

      const response = await aiService.chat([{ role: "user", content: prompt }]);
      try {
        const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return res.json(JSON.parse(jsonMatch[1] || jsonMatch[0]));
        }
      } catch {}
      return res.json({ rawExtraction: response.content });
    } catch (error: any) {
      console.error("[extract-debtor] Error:", error);
      res.status(500).json({ error: `Erro ao processar arquivo: ${error.message || "desconhecido"}` });
    }
  });

  // ==================== CONVERSATIONS ====================
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const conversations = await storage.getConversationsByTenant(tenantId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await storage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title, caseId } = req.body;
      const conversation = await storage.createConversation({
        title: title || "Nova Conversa",
        tenantId: 1,
        caseId,
      });
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      await storage.createMessage({
        conversationId,
        role: "user",
        content,
      });

      const allMessages = await storage.getMessagesByConversation(conversationId);
      const chatMessages = allMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await aiService.chat(chatMessages);

      const assistantMessage = await storage.createMessage({
        conversationId,
        role: "assistant",
        content: response.content,
        citations: response.citations as any,
      });

      res.json({
        message: assistantMessage,
        citations: response.citations,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // ==================== AUDIT LOGS ====================
  app.get("/api/audit-logs", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAuditLogs(tenantId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ==================== EMAIL ====================
  app.get("/api/email/status", async (req: Request, res: Response) => {
    try {
      const configured = emailService.isConfigured();
      if (!configured) {
        return res.json({ configured: false, message: "Email service not configured" });
      }
      
      const verification = await emailService.verifyConnection();
      res.json({ 
        configured: true, 
        connected: verification.success,
        error: verification.error 
      });
    } catch (error) {
      console.error("Error checking email status:", error);
      res.status(500).json({ error: "Failed to check email status" });
    }
  });

  app.post("/api/email/send", upload.array("attachments", 10), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { to, subject, html, text, cc, bcc } = req.body;
      
      if (!to || !subject) {
        return res.status(400).json({ error: "to and subject are required" });
      }

      const files = (req as any).files as Express.Multer.File[] | undefined;
      const attachments = files?.map(f => ({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype,
      }));

      let result: { success: boolean; messageId?: string; error?: string };
      const hasAttachments = attachments && attachments.length > 0;

      if (!hasAttachments && zohoMailService.isConfigured()) {
        result = await zohoMailService.sendEmail({
          to,
          subject,
          htmlBody: html || text || "",
          cc,
          bcc,
        });
        if (!result.success) {
          console.log("[Email] Zoho API send failed, falling back to SMTP:", result.error);
          result = await emailService.sendEmail({ to, subject, html, text, cc, bcc });
        }
      } else {
        result = await emailService.sendEmail({
          to, subject, html, text, cc, bcc, attachments,
        });
      }
      
      if (result.success) {
        await storage.createAuditLog({
          tenantId,
          action: "email_sent",
          entityType: "email",
          entityId: 0,
          details: { to, subject, messageId: result.messageId, attachmentCount: attachments?.length || 0, sentVia: hasAttachments ? "smtp" : "zoho_api" },
        });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  app.post("/api/email/notify-deadline", async (req: Request, res: Response) => {
    try {
      const { to, deadlineId } = req.body;
      
      if (!to || !deadlineId) {
        return res.status(400).json({ error: "to and deadlineId are required" });
      }
      
      const deadline = await storage.getDeadline(deadlineId);
      if (!deadline) {
        return res.status(404).json({ error: "Deadline not found" });
      }
      
      if (!deadline.caseId) {
        return res.status(400).json({ error: "Deadline has no associated case" });
      }
      
      const caseItem = await storage.getCase(deadline.caseId, 1);
      
      const daysRemaining = Math.ceil(
        (new Date(deadline.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      
      const result = await emailService.sendDeadlineNotification(to, {
        caseNumber: caseItem?.caseNumber || "N/A",
        caseTitle: caseItem?.title || "Processo",
        deadlineDate: new Date(deadline.dueDate),
        description: deadline.description || "Prazo processual",
        daysRemaining: Math.max(0, daysRemaining),
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error sending deadline notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/email/notify-movement", async (req: Request, res: Response) => {
    try {
      const { to, movementId } = req.body;
      
      if (!to || !movementId) {
        return res.status(400).json({ error: "to and movementId are required" });
      }
      
      const movement = await storage.getCaseMovement(movementId);
      if (!movement) {
        return res.status(404).json({ error: "Movement not found" });
      }
      
      const caseItem = await storage.getCase(movement.caseId, 1);
      
      const result = await emailService.sendMovementNotification(to, {
        caseNumber: caseItem?.caseNumber || "N/A",
        caseTitle: caseItem?.title || "Processo",
        movementType: movement.type,
        movementDate: new Date(movement.date),
        description: movement.description,
        requiresAction: movement.requiresAction || false,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error sending movement notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // ==================== EMAIL INBOX (Zoho Mail API) ====================
  app.get("/api/inbox/status", async (req: Request, res: Response) => {
    try {
      const configured = zohoMailService.isConfigured();
      if (!configured) {
        return res.json({ configured: false, message: "Zoho Mail not configured" });
      }
      
      const test = await zohoMailService.testConnection();
      res.json({ configured: true, connected: test.success, error: test.error });
    } catch (error) {
      console.error("Error checking Zoho Mail status:", error);
      res.status(500).json({ error: "Failed to check Zoho Mail status" });
    }
  });

  app.get("/api/inbox/folders", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const folders = await storage.getEmailFolders(tenantId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/inbox/sync-folders", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!zohoMailService.isConfigured()) {
        return res.status(400).json({ error: "Zoho Mail not configured" });
      }
      await zohoMailService.syncFolders(tenantId);
      const folders = await storage.getEmailFolders(tenantId);
      res.json({ success: true, folders });
    } catch (error) {
      console.error("Error syncing folders:", error);
      res.status(500).json({ error: "Failed to sync folders" });
    }
  });

  app.post("/api/inbox/sync", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { folderId, limit = 50 } = req.body;
      
      if (!zohoMailService.isConfigured()) {
        return res.status(400).json({ error: "Zoho Mail not configured" });
      }

      if (folderId) {
        const folder = await storage.getEmailFolder(folderId);
        if (!folder) {
          return res.status(404).json({ error: "Folder not found" });
        }
        const synced = await zohoMailService.syncEmails(tenantId, folderId, folder.imapPath, limit);
        res.json({ success: true, synced });
      } else {
        const results = await zohoMailService.syncAllFolders(tenantId, limit);
        res.json({ success: true, results });
      }
    } catch (error) {
      console.error("Error syncing emails:", error);
      res.status(500).json({ error: "Failed to sync emails" });
    }
  });

  app.post("/api/inbox/refetch-content", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!zohoMailService.isConfigured()) {
        return res.status(400).json({ error: "Zoho Mail not configured" });
      }
      const result = await zohoMailService.refetchEmailContent(tenantId);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error re-fetching email content:", error);
      res.status(500).json({ error: "Failed to re-fetch email content" });
    }
  });

  app.post("/api/inbox/emails/:id/refetch", async (req: Request, res: Response) => {
    try {
      const emailId = parseInt(req.params.id);
      if (!zohoMailService.isConfigured()) {
        return res.status(400).json({ error: "Zoho Mail not configured" });
      }
      const result = await zohoMailService.fetchSingleEmailContent(emailId);
      if (result.success) {
        const updatedEmail = await storage.getEmail(emailId);
        res.json({ success: true, sizeBytes: result.sizeBytes, email: updatedEmail });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error re-fetching single email content:", error);
      res.status(500).json({ error: "Failed to re-fetch email content" });
    }
  });

  app.get("/api/inbox/folders/:folderId/emails", async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.folderId);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const emailsList = await storage.getEmails(folderId, limit, offset);
      res.json(emailsList);
    } catch (error) {
      console.error("Error fetching emails:", error);
      res.status(500).json({ error: "Failed to fetch emails" });
    }
  });

  app.get("/api/inbox/emails/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const email = await storage.getEmail(id);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      if (!email.isRead) {
        await storage.markEmailAsRead(id, true);
        const folder = await storage.getEmailFolder(email.folderId);
        if (folder) {
          await storage.updateEmailFolderCounts(folder.id);
        }
      }
      
      const attachments = await storage.getEmailAttachments(id);
      res.json({ ...email, attachments });
    } catch (error) {
      console.error("Error fetching email:", error);
      res.status(500).json({ error: "Failed to fetch email" });
    }
  });

  app.patch("/api/inbox/emails/:id/read", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { isRead } = req.body;
      
      const email = await storage.markEmailAsRead(id, isRead);
      await storage.updateEmailFolderCounts(email.folderId);
      res.json(email);
    } catch (error) {
      console.error("Error updating email:", error);
      res.status(500).json({ error: "Failed to update email" });
    }
  });

  app.patch("/api/inbox/emails/:id/star", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const email = await storage.toggleEmailStar(id);
      res.json(email);
    } catch (error) {
      console.error("Error toggling star:", error);
      res.status(500).json({ error: "Failed to toggle star" });
    }
  });

  app.delete("/api/inbox/emails/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const email = await storage.getEmail(id);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      await storage.deleteEmail(id);
      await storage.updateEmailFolderCounts(email.folderId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting email:", error);
      res.status(500).json({ error: "Failed to delete email" });
    }
  });

  app.get("/api/inbox/search", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      
      const results = await storage.searchEmails(tenantId, query);
      res.json(results);
    } catch (error) {
      console.error("Error searching emails:", error);
      res.status(500).json({ error: "Failed to search emails" });
    }
  });

  // Email Drafts
  app.get("/api/inbox/drafts", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const drafts = await storage.getEmailDrafts(tenantId);
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      res.status(500).json({ error: "Failed to fetch drafts" });
    }
  });

  app.post("/api/inbox/drafts", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { toAddresses, ccAddresses, bccAddresses, subject, bodyHtml, inReplyTo, caseId, clientId } = req.body;
      
      const draft = await storage.createEmailDraft({
        tenantId,
        toAddresses,
        ccAddresses,
        bccAddresses,
        subject,
        bodyHtml,
        inReplyTo,
        caseId,
        clientId,
      });
      
      res.status(201).json(draft);
    } catch (error) {
      console.error("Error creating draft:", error);
      res.status(500).json({ error: "Failed to create draft" });
    }
  });

  app.put("/api/inbox/drafts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { toAddresses, ccAddresses, bccAddresses, subject, bodyHtml } = req.body;
      
      const draft = await storage.updateEmailDraft(id, {
        toAddresses,
        ccAddresses,
        bccAddresses,
        subject,
        bodyHtml,
      });
      
      res.json(draft);
    } catch (error) {
      console.error("Error updating draft:", error);
      res.status(500).json({ error: "Failed to update draft" });
    }
  });

  app.delete("/api/inbox/drafts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteEmailDraft(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting draft:", error);
      res.status(500).json({ error: "Failed to delete draft" });
    }
  });

  app.post("/api/inbox/drafts/:id/send", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      
      const draft = await storage.getEmailDraft(id);
      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }
      
      if (!draft.toAddresses || draft.toAddresses.length === 0) {
        return res.status(400).json({ error: "No recipients specified" });
      }
      
      const result = await emailService.sendEmail({
        to: draft.toAddresses.join(", "),
        cc: draft.ccAddresses?.join(", "),
        bcc: draft.bccAddresses?.join(", "),
        subject: draft.subject || "(Sem assunto)",
        html: draft.bodyHtml || "",
      });
      
      if (result.success) {
        await storage.deleteEmailDraft(id);
        await storage.createAuditLog({
          tenantId,
          action: "email_sent",
          entityType: "email",
          entityId: 0,
          details: { to: draft.toAddresses, subject: draft.subject, messageId: result.messageId },
        });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error sending draft:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  app.get("/api/email/signature", (req: Request, res: Response) => {
    const signer = (req.query.signer as string) || "pedro";
    res.json({ html: getSignatureForPartner(signer) });
  });

  app.put("/api/email/signature", (req: Request, res: Response) => {
    const { html } = req.body;
    if (typeof html !== "string") {
      return res.status(400).json({ error: "html (string) is required" });
    }
    emailSignatureHtml = html;
    res.json({ html: emailSignatureHtml });
  });

  app.get("/api/email/templates", (req: Request, res: Response) => {
    res.json(emailTemplates);
  });

  app.post("/api/email/templates", (req: Request, res: Response) => {
    const { name, subject, bodyHtml } = req.body;
    if (!name || !subject || !bodyHtml) {
      return res.status(400).json({ error: "name, subject, and bodyHtml are required" });
    }
    const template = { id: emailTemplateNextId++, name, subject, bodyHtml };
    emailTemplates.push(template);
    res.status(201).json(template);
  });

  app.put("/api/email/templates/:id", (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const idx = emailTemplates.findIndex(t => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Template not found" });
    }
    const { name, subject, bodyHtml } = req.body;
    if (name !== undefined) emailTemplates[idx].name = name;
    if (subject !== undefined) emailTemplates[idx].subject = subject;
    if (bodyHtml !== undefined) emailTemplates[idx].bodyHtml = bodyHtml;
    res.json(emailTemplates[idx]);
  });

  app.delete("/api/email/templates/:id", (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const idx = emailTemplates.findIndex(t => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Template not found" });
    }
    emailTemplates.splice(idx, 1);
    res.json({ success: true });
  });

  // ==================== LEXAI STUDIO - DEFAULT LETTERHEAD ====================
  app.get("/api/studio/default-letterhead", async (req: Request, res: Response) => {
    try {
      const templatePath = path.join(process.cwd(), "public/templates/default_letterhead.docx");
      const fileBuffer = await fs.promises.readFile(templatePath);
      const base64Data = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${fileBuffer.toString("base64")}`;
      res.json({ 
        name: "Papel Timbrado Padrão.docx", 
        data: base64Data 
      });
    } catch (error) {
      console.error("Error fetching default letterhead:", error);
      res.status(404).json({ error: "Default letterhead not found" });
    }
  });

  // ==================== LEXAI STUDIO - DOCUMENT TEMPLATES ====================
  app.get("/api/studio/templates", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const templates = await storage.getDocumentTemplatesByTenant(tenantId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/studio/templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getDocumentTemplate(id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/studio/templates", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const createSchema = insertDocumentTemplateSchema.omit({ tenantId: true });
      const parsed = createSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid template data", details: parsed.error.flatten() });
      }
      
      const template = await storage.createDocumentTemplate({
        tenantId,
        ...parsed.data,
      });
      
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.put("/api/studio/templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { name, category, description, contentHtml, variables } = req.body;
      
      const template = await storage.updateDocumentTemplate(id, {
        name,
        category,
        description,
        contentHtml,
        variables,
      });
      
      res.json(template);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/studio/templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteDocumentTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ==================== LEXAI STUDIO - GENERATED PIECES ====================
  app.get("/api/studio/pieces", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const caseId = req.query.caseId ? parseInt(req.query.caseId as string) : undefined;
      
      const pieces = caseId 
        ? await storage.getGeneratedPiecesByCase(caseId)
        : await storage.getGeneratedPiecesByTenant(tenantId);
      
      res.json(pieces);
    } catch (error) {
      console.error("Error fetching pieces:", error);
      res.status(500).json({ error: "Failed to fetch pieces" });
    }
  });

  app.get("/api/studio/pieces/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const piece = await storage.getGeneratedPiece(id);
      if (!piece) {
        return res.status(404).json({ error: "Piece not found" });
      }
      res.json(piece);
    } catch (error) {
      console.error("Error fetching piece:", error);
      res.status(500).json({ error: "Failed to fetch piece" });
    }
  });

  app.post("/api/studio/pieces", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const createSchema = insertGeneratedPieceSchema.omit({ tenantId: true });
      const parsed = createSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid piece data", details: parsed.error.flatten() });
      }
      
      const piece = await storage.createGeneratedPiece({
        tenantId,
        ...parsed.data,
      });

      await storage.createAuditLog({
        tenantId,
        action: "piece_generated",
        entityType: "generated_piece",
        entityId: piece.id,
        details: { title: parsed.data.title, pieceType: parsed.data.pieceType },
      });

      // Harvey: índice de embedding fire-and-forget (não bloqueia resposta)
      // Só indexa se a peça já vier aprovada (raro) — normalmente acontece via /approve
      if (piece.humanApproved) {
        import("./services/embeddingService").then(({ embeddingService }) => {
          embeddingService.upsertPieceEmbeddingForApprovedPiece(piece.id, tenantId)
            .catch(e => console.warn("[RAG] Auto-embed on save failed:", e?.message));
        }).catch(() => {});
      }

      res.status(201).json(piece);
    } catch (error) {
      console.error("Error creating piece:", error);
      res.status(500).json({ error: "Failed to create piece" });
    }
  });

  app.put("/api/studio/pieces/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { title, contentHtml, contentText } = req.body;
      
      const piece = await storage.updateGeneratedPiece(id, {
        title,
        contentHtml,
        contentText,
      });
      
      res.json(piece);
    } catch (error) {
      console.error("Error updating piece:", error);
      res.status(500).json({ error: "Failed to update piece" });
    }
  });

  app.delete("/api/studio/pieces/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGeneratedPiece(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting piece:", error);
      res.status(500).json({ error: "Failed to delete piece" });
    }
  });

  // ==================== HARVEY: PIECE APPROVAL + EMBEDDING INDEXING ====================
  app.post("/api/studio/pieces/:id/approve", async (req: Request, res: Response) => {
    try {
      const pieceId = parseInt(req.params.id);
      const userId = getUserId(req);
      const tenantId = getTenantId(req);

      if (isNaN(pieceId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const piece = await storage.getGeneratedPiece(pieceId);
      if (!piece) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      // Persist approval in database
      await storage.approveGeneratedPiece(pieceId, userId, tenantId);

      // Async: index embedding for RAG (non-blocking)
      import("./services/embeddingService").then(({ embeddingService }) => {
        void embeddingService.upsertPieceEmbedding({
          tenantId,
          pieceId,
          pieceType: piece.pieceType,
          contentText: piece.contentText || piece.contentHtml.replace(/<[^>]+>/g, " ").substring(0, 8000),
        }).catch(err => console.error("[RAG] Failed to index approved piece:", err.message));
      });

      console.log(`[Harvey] Piece ${pieceId} approved by user ${userId} — embedding indexing queued`);
      res.json({ success: true, pieceId });
    } catch (error) {
      console.error("Error approving piece:", error);
      res.status(500).json({ error: "Falha ao aprovar a peça" });
    }
  });

  // ==================== LEXAI STUDIO - GENERATE PIECE ====================
  const generatePieceSchema = z.object({
    prompt: z.string().min(3, "O prompt deve ter pelo menos 3 caracteres"),
    templateType: z.string().min(1, "O tipo de peça é obrigatório"),
    attorney: z.string().optional(),
    attorneys: z.array(z.string()).optional(),
    systemContext: z.string().optional(),
    files: z.array(z.object({
      name: z.string(),
      type: z.string(),
      data: z.string(),
      extractedText: z.string().optional(),
      isReferenceModel: z.boolean().optional(),
    })).optional().default([]),
    selectedJurisprudence: z.array(z.object({
      title: z.string(),
      summary: z.string().optional(),
      ementa: z.string().optional(),
      legalThesis: z.string().optional(),
      court: z.string().optional(),
      caseNumber: z.string().optional(),
      citationABNT: z.string().optional(),
    })).optional().default([]),
    selectedDoctrine: z.array(z.object({
      title: z.string(),
      summary: z.string().optional(),
      citationABNT: z.string().optional(),
    })).optional().default([]),
  });

  app.post("/api/studio/generate", async (req: Request, res: Response) => {
    try {
      const parsed = generatePieceSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
      }

      const { prompt, templateType, files, selectedJurisprudence, selectedDoctrine, attorney, attorneys, systemContext } = parsed.data;

      const result = await generateStudioPiece({
        prompt,
        templateType,
        files,
        selectedJurisprudence,
        selectedDoctrine,
        attorney,
        attorneys,
        systemContext,
        tenantId: getTenantId(req),
        userId: getUserId(req),
      });

      res.json(result);
    } catch (error) {
      console.error("Error generating piece:", error);
      res.status(500).json({ error: "Falha ao gerar a peça. Por favor, tente novamente." });
    }
  });

  app.post("/api/reports/export-pdf", async (req: Request, res: Response) => {
    try {
      const { content, title, clientName } = req.body;

      if (!content) {
        return res.status(400).json({ error: "Conteúdo é obrigatório" });
      }

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 120, bottom: 80, left: 72, right: 72 },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));

      const pdfReady = new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
      });

      const pageWidth = doc.page.width;
      const headerY = 30;
      
      const addHeaderFooter = () => {
        doc.save();
        doc.fontSize(14).font("Helvetica-Bold")
          .text("MARQUES & SERRA", 72, headerY, { align: "center", width: pageWidth - 144 });
        doc.fontSize(8).font("Helvetica")
          .text("ADVOCACIA", 72, headerY + 18, { align: "center", width: pageWidth - 144 });
        doc.fontSize(7).font("Helvetica")
          .text("Ronald Ferreira Serra - OAB/DF 23.947", 72, headerY + 32, { align: "center", width: pageWidth - 144 });
        
        doc.moveTo(72, headerY + 48).lineTo(pageWidth - 72, headerY + 48).lineWidth(0.5).stroke("#333333");

        const footerY = doc.page.height - 50;
        doc.moveTo(72, footerY).lineTo(pageWidth - 72, footerY).lineWidth(0.5).stroke("#333333");
        doc.fontSize(7).font("Helvetica")
          .text("Escritório Marques e Serra - Documento gerado pelo LexAI", 72, footerY + 8, { align: "center", width: pageWidth - 144 });
        doc.restore();
      };

      addHeaderFooter();

      doc.y = 120;
      
      if (title) {
        doc.fontSize(13).font("Helvetica-Bold")
          .text(title.replace(/_/g, " ").toUpperCase(), { align: "center" });
        doc.moveDown(0.5);
      }

      if (clientName) {
        doc.fontSize(9).font("Helvetica")
          .text(`Cliente: ${clientName}`, { align: "left" });
        doc.fontSize(9).font("Helvetica")
          .text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, { align: "left" });
        doc.moveDown(1);
      }

      const paragraphs = content.split(/\n\n+/).filter((p: string) => p.trim());
      
      for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length < 100 && !trimmed.includes('.');

        if (isHeading) {
          doc.moveDown(0.5);
          doc.fontSize(11).font("Helvetica-Bold").text(trimmed, { align: "left" });
          doc.moveDown(0.3);
        } else {
          const lines = trimmed.split('\n');
          for (const line of lines) {
            const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
            if (isBullet) {
              doc.fontSize(10).font("Helvetica").text(`  ${line.trim()}`, { align: "left", indent: 15 });
            } else {
              doc.fontSize(10).font("Helvetica").text(line.trim(), { align: "justify" });
            }
          }
          doc.moveDown(0.4);
        }

        if (doc.y > doc.page.height - 100) {
          doc.addPage();
          addHeaderFooter();
          doc.y = 120;
        }
      }

      doc.end();
      const pdfBuffer = await pdfReady;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${(title || "Relatorio").replace(/\s+/g, "_")}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      res.status(500).json({ error: "Falha ao exportar para PDF" });
    }
  });

  // ==================== LEXAI STUDIO - EXPORT WORD WITH TEMPLATE ====================
  app.post("/api/studio/export-word", async (req: Request, res: Response) => {
    try {
      const { contentHtml, title, wordTemplateData, wordTemplateFileData, userId, attorney } = req.body;
      const templateData = wordTemplateData || wordTemplateFileData;

      if (!contentHtml) {
        return res.status(400).json({ error: "Conteúdo HTML é obrigatório" });
      }

      const exportAttorneyMap: Record<string, { name: string; oab: string }> = {
        ronald: { name: "Ronald Ferreira Serra", oab: "OAB/DF 23.947" },
        pedro: { name: "Pedro César N. F. Marques de Sousa", oab: "OAB/DF 57.058" },
      };
      const attyChoice = exportAttorneyMap[attorney || "pedro"] || exportAttorneyMap.pedro;
      let advogadoNome = attyChoice.name;
      let advogadoOab = attyChoice.oab;
      
      if (!attorney && userId && userId !== 1) {
        const user = await storage.getUser(userId);
        if (user?.name) advogadoNome = user.name;
        if (user?.oabNumber) advogadoOab = user.oabNumber;
      }

      console.log("[export-word] Using attorney:", advogadoNome, advogadoOab);
      
      // Replace placeholders in HTML (multiple formats to catch all variations)
      let processedHtml = contentHtml
        .replace(/\[ADVOGADO_NOME\]/gi, advogadoNome)
        .replace(/\[ADVOGADO_OAB\]/gi, advogadoOab)
        .replace(/\{\{ADVOGADO_NOME\}\}/g, advogadoNome)
        .replace(/\{\{ADVOGADO_OAB\}\}/g, advogadoOab)
        .replace(/\{ADVOGADO_NOME\}/g, advogadoNome)
        .replace(/\{ADVOGADO_OAB\}/g, advogadoOab)
        .replace(/\[Nome e assinatura do advogado\]/g, advogadoNome)
        .replace(/\[OAB\/UF número\]/g, advogadoOab)
        .replace(/\[Local e data\]/g, "Brasília, nesta data.")
        .replace(/\[LOCAL\]/g, "Brasília")
        .replace(/\[COMPLETAR\]/g, "_____________________");

      // If word template provided, use docxtemplater to inject content preserving template formatting
      if (templateData) {
        try {
          const PizZip = (await import("pizzip")).default;
          const Docxtemplater = (await import("docxtemplater")).default;
          
          const base64Data = templateData.replace(/^data:application\/.*?;base64,/, "");
          const templateBuffer = Buffer.from(base64Data, "base64");
          
          const zip = new PizZip(templateBuffer) as any;

          // === FIX 1: Inject <w:doNotExpandShiftReturn/> into word/settings.xml ===
          // This prevents Word from expanding character spaces on lines ending with soft breaks (SHIFT-RETURN)
          const settingsFile = zip.file("word/settings.xml");
          if (settingsFile) {
            let settingsXml = settingsFile.asText();
            if (!settingsXml.includes("doNotExpandShiftReturn")) {
              settingsXml = settingsXml.replace(
                '</w:settings>',
                '<w:doNotExpandShiftReturn/></w:settings>'
              );
              zip.file("word/settings.xml", settingsXml);
            }
          }

          // === FIX 2: Convert HTML to proper OOXML paragraphs with bold support ===
          // This creates real <w:p> paragraphs that each inherit justification from the template
          // and preserves <strong>/<b> tags as bold OOXML runs

          // Helper: escape XML special chars
          const escapeXml = (text: string) => text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

          // Helper: decode HTML entities
          const decodeEntities = (text: string) => text
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)));

          // Helper: clean markdown artifacts from text
          const cleanMarkdown = (text: string) => text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^---+$/gm, '')
            .replace(/^___+$/gm, '')
            .replace(/^\*\*\*+$/gm, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1');

          // Helper: replace attorney placeholders
          const replaceAttorneyPlaceholders = (text: string) => text
            .replace(/\[ADVOGADO_NOME\]/g, advogadoNome)
            .replace(/\[ADVOGADO_OAB\]/g, advogadoOab)
            .replace(/\{\{ADVOGADO_NOME\}\}/g, advogadoNome)
            .replace(/\{\{ADVOGADO_OAB\}\}/g, advogadoOab)
            .replace(/\{ADVOGADO_NOME\}/g, advogadoNome)
            .replace(/\{ADVOGADO_OAB\}/g, advogadoOab);

          interface ParsedParagraph {
            segments: Array<{ text: string; bold: boolean }>;
            isBlockquote: boolean;
            isPageBreak: boolean;
            isEmptyLines: boolean;
            isCentered: boolean;
            isLeftAligned: boolean;
          }

          const parseHtmlToParagraphs = (html: string): ParsedParagraph[] => {
            const results: ParsedParagraph[] = [];
            let cleaned = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            cleaned = cleanMarkdown(cleaned);
            cleaned = replaceAttorneyPlaceholders(cleaned);

            cleaned = cleaned.replace(/<hr\s*\/?>/gi, '<p class="page-break"></p>');

            const blockRegex = /<(p|blockquote|h[1-6]|li|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
            let m;
            while ((m = blockRegex.exec(cleaned)) !== null) {
              const tag = m[1].toLowerCase();
              const attrs = m[2] || '';
              let inner = m[3].trim();

              if (tag === 'p' && (/class\s*=\s*["'][^"']*page-break[^"']*["']/i.test(attrs) || /page-break-before\s*:\s*always/i.test(attrs))) {
                results.push({ segments: [], isBlockquote: false, isPageBreak: true, isEmptyLines: false, isCentered: false, isLeftAligned: false });
                continue;
              }
              if (tag === 'p' && /class\s*=\s*["'][^"']*empty-lines[^"']*["']/i.test(attrs)) {
                results.push({ segments: [], isBlockquote: false, isPageBreak: false, isEmptyLines: true, isCentered: false, isLeftAligned: false });
                continue;
              }

              const isBlockquote = tag === 'blockquote';
              const isCentered = /text-align\s*:\s*center/i.test(attrs) || /class\s*=\s*["'][^"']*centered-title[^"']*["']/i.test(attrs) || /class\s*=\s*["'][^"']*signature-block[^"']*["']/i.test(attrs);
              const isLeftAligned = /text-align\s*:\s*left/i.test(attrs) || /class\s*=\s*["'][^"']*section-title[^"']*["']/i.test(attrs);

              inner = inner.replace(/<br\s*\/?>/gi, '\n');

              const segments: Array<{ text: string; bold: boolean }> = [];
              const boldRegex = /<(strong|b)>([\s\S]*?)<\/\1>/gi;
              let lastIdx = 0;
              let bm;
              while ((bm = boldRegex.exec(inner)) !== null) {
                if (bm.index > lastIdx) {
                  const beforeText = inner.substring(lastIdx, bm.index).replace(/<[^>]+>/g, '');
                  const decoded = decodeEntities(beforeText);
                  if (decoded.trim()) segments.push({ text: decoded, bold: false });
                }
                const boldText = bm[2].replace(/<[^>]+>/g, '');
                const decoded = decodeEntities(boldText);
                if (decoded.trim()) segments.push({ text: decoded, bold: true });
                lastIdx = bm.index + bm[0].length;
              }
              if (lastIdx < inner.length) {
                const remaining = inner.substring(lastIdx).replace(/<[^>]+>/g, '');
                const decoded = decodeEntities(remaining);
                if (decoded.trim()) segments.push({ text: decoded, bold: false });
              }

              if (segments.length === 0) continue;

              results.push({ segments, isBlockquote, isPageBreak: false, isEmptyLines: false, isCentered, isLeftAligned });
            }

            if (results.length === 0) {
              const stripped = decodeEntities(cleaned.replace(/<[^>]+>/g, ''));
              const lines = stripped.split(/\n\n+/).map(l => l.trim()).filter(l => l.length > 0);
              for (const line of lines) {
                results.push({ segments: [{ text: line, bold: false }], isBlockquote: false, isPageBreak: false, isEmptyLines: false, isCentered: false, isLeftAligned: false });
              }
            }

            return results;
          };

          const parsedParagraphs = parseHtmlToParagraphs(processedHtml);
          console.log("[export-word] Processing template with", parsedParagraphs.length, "parsed paragraphs");

          // Read the document.xml and find the paragraph containing {CONTEUDO}
          let xmlContent = zip.file("word/document.xml")?.asText() || "";
          
          // Fix double braces if present
          xmlContent = xmlContent.replace(/\{\{CONTEUDO\}\}/g, "{CONTEUDO}");

          // Word often splits placeholder text across multiple XML runs like:
          // <w:r><w:t>{CON</w:t></w:r><w:r><w:t>TEUDO</w:t></w:r><w:r><w:t>}</w:t></w:r>
          // We need to merge these runs within each paragraph so we can find {CONTEUDO} as a single string
          const mergeRunsInParagraph = (paraXml: string): string => {
            // Extract all <w:t> text content from runs to check if they form {CONTEUDO} or CONTEUDO
            const textParts: string[] = [];
            const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
            let m;
            while ((m = textRegex.exec(paraXml)) !== null) {
              textParts.push(m[1]);
            }
            const fullText = textParts.join('');
            
            if (fullText.includes('{CONTEUDO}') || fullText.includes('CONTEUDO')) {
              // This paragraph contains the placeholder split across runs
              // Merge all runs into a single run with the combined text
              // First, extract paragraph properties
              const pPrMatch = paraXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
              const pPr = pPrMatch ? pPrMatch[0] : '';
              
              // Extract the first run's properties for styling
              const rPrMatch = paraXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
              const rPr = rPrMatch ? rPrMatch[0] : '';
              
              // Reconstruct as a single paragraph with one run
              const mergedText = fullText.replace(/\{\{CONTEUDO\}\}/g, '{CONTEUDO}');
              return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${mergedText}</w:t></w:r></w:p>`;
            }
            return paraXml;
          };
          
          // Apply run merging to each paragraph in the document
          xmlContent = xmlContent.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paraMatch: string) => {
            return mergeRunsInParagraph(paraMatch);
          });

          // Find the <w:p> paragraph that contains {CONTEUDO} and extract its paragraph properties
          const conteudoRegex = /(<w:p\b[^>]*>)([\s\S]*?)(<\/w:p>)/g;
          let conteudoParagraph: { fullMatch: string; pPr: string; } | null = null;
          
          let match;
          while ((match = conteudoRegex.exec(xmlContent)) !== null) {
            const paragraphContent = match[0];
            const textOnly = paragraphContent.replace(/<[^>]+>/g, '');
            if (textOnly.includes('{CONTEUDO}') || textOnly.includes('CONTEUDO')) {
              const pPrMatch = paragraphContent.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
              const pPr = pPrMatch ? `<w:pPr>${pPrMatch[1]}</w:pPr>` : '<w:pPr><w:jc w:val="both"/></w:pPr>';
              conteudoParagraph = { fullMatch: paragraphContent, pPr };
              break;
            }
          }

          if (conteudoParagraph) {
            const rPrMatch = conteudoParagraph.fullMatch.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
            const baseRPrContent = rPrMatch ? rPrMatch[1] : '';
            const baseRPrContentNoSize = baseRPrContent.replace(/<w:sz[^/]*\/>/g, '').replace(/<w:szCs[^/]*\/>/g, '');

            const makeRPr = (bold: boolean, smallFont: boolean): string => {
              let inner = bold
                ? (baseRPrContentNoSize ? baseRPrContentNoSize + '<w:b/><w:bCs/>' : '<w:b/><w:bCs/>')
                : baseRPrContentNoSize;
              if (smallFont) {
                inner += '<w:sz w:val="22"/><w:szCs w:val="22"/>';
              } else if (baseRPrContent.includes('w:sz')) {
                const szMatch = baseRPrContent.match(/<w:sz\s[^/]*\/>/);
                const szCsMatch = baseRPrContent.match(/<w:szCs\s[^/]*\/>/);
                if (szMatch) inner += szMatch[0];
                if (szCsMatch) inner += szCsMatch[0];
              }
              return inner ? `<w:rPr>${inner}</w:rPr>` : '';
            };

            const pPrJustified = `<w:pPr><w:jc w:val="both"/><w:spacing w:after="200" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="720"/></w:pPr>`;
            const pPrLeft = `<w:pPr><w:jc w:val="left"/><w:spacing w:before="300" w:after="200" w:line="360" w:lineRule="auto"/></w:pPr>`;
            const pPrCenterTitle = `<w:pPr><w:jc w:val="center"/><w:spacing w:before="400" w:after="200" w:line="360" w:lineRule="auto"/></w:pPr>`;
            const pPrCenterSignature = `<w:pPr><w:jc w:val="center"/><w:spacing w:after="200" w:line="360" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/></w:pPr>`;
            const pPrBlockquote = `<w:pPr><w:jc w:val="both"/><w:spacing w:after="200" w:line="360" w:lineRule="auto"/><w:ind w:left="2268"/></w:pPr>`;
            const pPrEmpty = `<w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr>`;
            const pPrNoIndent = `<w:pPr><w:jc w:val="both"/><w:spacing w:after="200" w:line="360" w:lineRule="auto"/></w:pPr>`;

            const segmentsToRuns = (segments: Array<{ text: string; bold: boolean }>, smallFont: boolean): string => {
              let runs = '';
              for (const seg of segments) {
                const rpr = makeRPr(seg.bold, smallFont);
                const lines = seg.text.split('\n');
                lines.forEach((line: string, lineIdx: number) => {
                  if (lineIdx > 0) {
                    runs += `<w:r>${rpr}<w:br/></w:r>`;
                  }
                  if (line) {
                    runs += `<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`;
                  }
                });
              }
              return runs;
            };

            const ooxmlParts: string[] = [];
            for (const para of parsedParagraphs) {
              if (para.isPageBreak) {
                ooxmlParts.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
                continue;
              }
              if (para.isEmptyLines) {
                ooxmlParts.push(`<w:p>${pPrEmpty}</w:p>`);
                continue;
              }

              const allBold = para.segments.every(s => s.bold);
              const hasBoldLabel = !allBold && para.segments.length >= 2 && para.segments[0].bold && para.segments[0].text.length < 40;
              const fullText = para.segments.map(s => s.text).join('').trim();
              const isShortTitle = fullText.length < 120 && allBold;
              const isFecho = /^(Termos em que|Nestes termos|Brasília|Respeitosamente)/i.test(fullText);
              const isPedido = /^[a-z]\)\s/i.test(fullText);

              const isSignature = hasBoldLabel && (fullText.includes('OAB') || fullText.includes('CRM') || fullText.includes('CREA'));

              let currentPPr: string;
              if (para.isBlockquote) {
                currentPPr = pPrBlockquote;
              } else if (para.isCentered && isSignature) {
                currentPPr = pPrCenterSignature;
              } else if (para.isCentered) {
                currentPPr = pPrCenterTitle;
              } else if (para.isLeftAligned && isShortTitle) {
                currentPPr = pPrLeft;
              } else if (isShortTitle && !para.isCentered) {
                currentPPr = pPrLeft;
              } else if (allBold && fullText.length < 60) {
                currentPPr = pPrNoIndent;
              } else if (hasBoldLabel || isFecho || isPedido) {
                currentPPr = pPrNoIndent;
              } else {
                currentPPr = pPrJustified;
              }

              const runs = segmentsToRuns(para.segments, para.isBlockquote);
              ooxmlParts.push(`<w:p>${currentPPr}${runs}</w:p>`);
            }

            const ooxmlContent = ooxmlParts.join('');
            
            // Replace the original CONTEUDO paragraph with the generated paragraphs
            xmlContent = xmlContent.replace(conteudoParagraph.fullMatch, ooxmlContent);
            zip.file("word/document.xml", xmlContent);
            
            console.log("[export-word] Injected", ooxmlParts.length, "justified OOXML paragraphs");
            
            // Use docxtemplater only for remaining placeholders (not CONTEUDO)
            const doc = new Docxtemplater(zip, {
              paragraphLoop: true,
              linebreaks: true,
            }) as any;

            doc.setData({
              ADVOGADO_NOME: advogadoNome,
              ADVOGADO_OAB: advogadoOab,
              LOCAL: "Brasília",
              DATA: "nesta data",
            });
            doc.render();

            const outputBuffer = doc.getZip().generate({
              type: "nodebuffer",
              compression: "DEFLATE",
            });

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${(title || "Peca_Juridica").replace(/\s+/g, "_")}.docx"`);
            return res.send(outputBuffer);
          } else {
            console.log("[export-word] CONTEUDO paragraph not found in template, using docxtemplater fallback");
            const fallbackContent = parsedParagraphs
              .filter(p => !p.isPageBreak && !p.isEmptyLines)
              .map(p => p.segments.map(s => s.text).join(''))
              .join('\n\n');
            
            const doc = new Docxtemplater(zip, {
              paragraphLoop: true,
              linebreaks: true,
            }) as any;

            doc.setData({
              CONTEUDO: fallbackContent,
              ADVOGADO_NOME: advogadoNome,
              ADVOGADO_OAB: advogadoOab,
              LOCAL: "Brasília",
              DATA: "nesta data",
            });
            doc.render();

            const outputBuffer = doc.getZip().generate({
              type: "nodebuffer",
              compression: "DEFLATE",
            });

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${(title || "Peca_Juridica").replace(/\s+/g, "_")}.docx"`);
            return res.send(outputBuffer);
          }
        } catch (templateError) {
          console.error("Error processing Word template with docxtemplater:", templateError);
        }
      }

      // Default: Use docx library to generate proper Word document (clean text)
      const docx = await import("docx");
      const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;

      let fallbackHtml = processedHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*/gi, '{{PARA_BREAK}}')
        .replace(/<\/h[1-6]>\s*/gi, '{{PARA_BREAK}}')
        .replace(/<\/li>\s*/gi, '{{PARA_BREAK}}')
        .replace(/<\/blockquote>\s*/gi, '{{PARA_BREAK}}')
        .replace(/<\/div>\s*/gi, '{{PARA_BREAK}}');
      
      // Strip all HTML tags
      fallbackHtml = fallbackHtml.replace(/<[^>]+>/g, '');
      fallbackHtml = fallbackHtml
        .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      
      // Clean markdown and formatting markers
      fallbackHtml = fallbackHtml
        .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1')
        .replace(/^#{1,6}\s+/gm, '').replace(/^---+$/gm, '').replace(/^___+$/gm, '').replace(/^\*\*\*+$/gm, '')
        .replace(/```[\s\S]*?```/g, '').replace(/`([^`]+)`/g, '$1');
      
      // Remove any bold/formatting markers
      fallbackHtml = fallbackHtml
        .replace(/\{\{BOLD_START\}\}/g, '').replace(/\{\{BOLD_END\}\}/g, '')
        .replace(/\{\{BOLDSTART\}\}/g, '').replace(/\{\{BOLDEND\}\}/g, '')
        .replace(/\{\{PARABREAK\}\}/g, '{{PARA_BREAK}}');
      
      fallbackHtml = fallbackHtml
        .replace(/\[ADVOGADO_NOME\]/g, advogadoNome).replace(/\[ADVOGADO_OAB\]/g, advogadoOab)
        .replace(/\{\{ADVOGADO_NOME\}\}/g, advogadoNome).replace(/\{\{ADVOGADO_OAB\}\}/g, advogadoOab)
        .replace(/\{ADVOGADO_NOME\}/g, advogadoNome).replace(/\{ADVOGADO_OAB\}/g, advogadoOab);

      let fallbackParagraphs: string[];
      if (fallbackHtml.includes('{{PARA_BREAK}}')) {
        fallbackParagraphs = fallbackHtml.split('{{PARA_BREAK}}').map((p: string) => p.replace(/\n{3,}/g, '\n').trim()).filter((p: string) => p.length > 0);
      } else {
        fallbackParagraphs = fallbackHtml.split(/\n\n+/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
      }

      const docParagraphs = fallbackParagraphs.map((text: string) => {
        const cleanText = text.trim();
        const isHeading = cleanText === cleanText.toUpperCase() && cleanText.length < 100 && !cleanText.includes('.');

        if (isHeading) {
          return new Paragraph({
            children: [new TextRun({ text: cleanText, size: 24, font: "Times New Roman" })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
          });
        }

        return new Paragraph({
          children: [new TextRun({ text: cleanText, size: 24, font: "Times New Roman" })],
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 720 },
          spacing: { after: 200 },
        });
      });

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1417, // ~2.5cm
                right: 1701, // ~3cm
                bottom: 1417,
                left: 1701,
              },
            },
          },
          children: docParagraphs,
        }],
      });

      const buffer = await Packer.toBuffer(doc);

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${(title || "Peca_Juridica").replace(/\s+/g, "_")}.docx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting Word:", error);
      res.status(500).json({ error: "Falha ao exportar para Word" });
    }
  });

  // ==================== LEXAI STUDIO - SUGGEST SEARCH TERMS ====================
  const suggestSearchSchema = z.object({
    prompt: z.string().min(3, "O prompt deve ter pelo menos 3 caracteres"),
    templateType: z.string().optional(),
  });

  app.post("/api/studio/suggest-search", async (req: Request, res: Response) => {
    try {
      const parsed = suggestSearchSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
      }

      const { prompt, templateType } = parsed.data;

      const pieceTypeLabels: Record<string, string> = {
        peticao_inicial: "Petição Inicial",
        execucao: "Execução",
        cumprimento_sentenca: "Cumprimento de Sentença",
        contestacao: "Contestação",
        habeas_corpus: "Habeas Corpus",
        mandado_seguranca: "Mandado de Segurança",
        recurso_apelacao: "Recurso de Apelação",
        agravo_instrumento: "Agravo de Instrumento",
        recurso_especial: "Recurso Especial",
        recurso_extraordinario: "Recurso Extraordinário",
        contrarrazoes: "Contrarrazões ao Recurso de Apelação",
        notificacao_extrajudicial: "Notificação Extrajudicial",
        contrato: "Contrato",
        outro: "Outro",
      };

      const pieceLabel = templateType ? (pieceTypeLabels[templateType] || templateType) : "Documento Jurídico";

      const systemPrompt = `Você é um assistente jurídico especializado em sugerir termos de pesquisa.

Analise a instrução do usuário e o tipo de peça jurídica, e sugira termos de pesquisa relevantes.

REGRAS:
1. Sugira termos específicos e relevantes para o caso descrito
2. Retorne APENAS um objeto JSON válido, sem texto adicional
3. Para jurisprudência: sugira termos para buscar decisões judiciais relevantes (ex: "dano moral contrato bancário", "rescisão trabalhista justa causa")
4. Para doutrina: sugira termos para buscar autores e conceitos jurídicos (ex: "responsabilidade civil objetiva", "princípio da boa-fé contratual")
5. Sugira entre 3 a 5 termos para cada categoria
6. Os termos devem ser em português e específicos ao direito brasileiro

FORMATO DE RESPOSTA (APENAS JSON):
{
  "jurisprudenceTerms": ["termo1", "termo2", "termo3"],
  "doctrineTerms": ["termo1", "termo2", "termo3"]
}`;

      const userMessage = `Tipo de peça: ${pieceLabel}

Instrução do usuário:
${prompt}

Sugira termos de pesquisa relevantes para encontrar jurisprudência e doutrina que fundamentem esta peça.`;

      const fullPrompt = `${systemPrompt}

${userMessage}

Responda APENAS com o JSON, sem nenhum texto adicional:`;

      const response = await aiService.chat([
        { role: "user", content: fullPrompt }
      ], []);

      let result = { jurisprudenceTerms: [] as string[], doctrineTerms: [] as string[] };
      
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          result = {
            jurisprudenceTerms: Array.isArray(parsed.jurisprudenceTerms) ? parsed.jurisprudenceTerms : [],
            doctrineTerms: Array.isArray(parsed.doctrineTerms) ? parsed.doctrineTerms : [],
          };
        }
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
      }

      res.json(result);
    } catch (error) {
      console.error("Error suggesting search terms:", error);
      res.status(500).json({ error: "Falha ao sugerir termos de pesquisa." });
    }
  });

  // ==================== LEXAI STUDIO - PROCESS CASE NOTES ====================
  app.post("/api/studio/process-case", async (req: Request, res: Response) => {
    try {
      const { notes } = req.body;
      
      if (!notes || notes.trim().length === 0) {
        return res.status(400).json({ error: "As anotações não podem estar vazias" });
      }

      const systemPrompt = `Você é um assistente jurídico que organiza e estrutura anotações para casos jurídicos.

TAREFA: Analise as anotações fornecidas e organize as informações de forma estruturada. As anotações podem conter fatos do caso, instruções para a peça, contexto, orientações do advogado ou qualquer conteúdo relevante — tudo deve ser preservado e organizado.

REGRAS:
1. PRESERVE TUDO que o usuário escreveu ou ditou — não descarte nada, pois o campo aceita tanto fatos quanto instruções e prompts
2. Identifique e organize os fatos em ordem cronológica quando possível
3. Se houver instruções ou orientações do advogado (ex: "quero que a peça seja agressiva", "focar na jurisprudência do STJ"), coloque em seção separada de INSTRUÇÕES
4. Identifique: partes envolvidas, datas importantes, valores, documentos mencionados
5. Escreva em linguagem formal jurídica quando se tratar de fatos; mantenha a linguagem original quando se tratar de instruções
6. Organize em tópicos numerados
7. NÃO invente informações - use apenas o que está nas anotações
8. Marque informações incompletas com [informar] ou [data] ou [valor]
9. Aceite qualquer informação, mesmo que pareça simples ou informal

FORMATO DE SAÍDA:
PARTES:
- Autor: [nome ou identificação]
- Réu: [nome ou identificação]

FATOS:
1. [Primeiro fato]
2. [Segundo fato]
...

INSTRUÇÕES DO ADVOGADO:
- [Instruções, orientações ou preferências mencionadas]

DOCUMENTOS MENCIONADOS:
- [Lista de documentos citados nas anotações]

VALORES:
- [Valores monetários mencionados]

DATAS IMPORTANTES:
- [Datas relevantes para o caso]

Omita seções que não tenham informações. Se as anotações forem curtas, adapte o formato — não force todas as seções.`;

      const response = await aiService.chat([
        { role: "user", content: `${systemPrompt}\n\nOrganize e preserve integralmente as seguintes anotações:\n\n${notes}` }
      ], []);

      res.json({ 
        facts: response.content,
        tokensUsed: response.tokensUsed 
      });
    } catch (error) {
      console.error("Error processing case notes:", error);
      res.status(500).json({ error: "Falha ao processar anotações do caso." });
    }
  });

  // ==================== LEXAI STUDIO - EXTRACT PROTOCOL DATA ====================
  app.post("/api/studio/extract-protocol-data", async (req: Request, res: Response) => {
    try {
      const { extractedTexts, systemEntities, templateType, instructionText, selectedAttorney, calcItems, generatedHtml, checklistDocTexts } = req.body;

      const CLASSE_MAP: Record<string, string> = {
        peticao_inicial: "Procedimento Comum Cível",
        acao_monitoria: "Ação Monitória",
        execucao: "Execução de Título Extrajudicial",
        cumprimento_sentenca: "Cumprimento de Sentença",
        mandado_seguranca: "Mandado de Segurança",
        habeas_corpus: "Habeas Corpus",
        agravo_instrumento: "Agravo de Instrumento",
        recurso_especial: "Recurso Especial",
        recurso_extraordinario: "Recurso Extraordinário",
        contestacao: "Contestação (processo existente)",
        contrarrazoes: "Contrarrazões (processo existente)",
        recurso_apelacao: "Recurso de Apelação (processo existente)",
      };

      const MATERIA_MAP: Record<string, string> = {
        habeas_corpus: "CRIMINAL",
      };

      const ATTORNEY_DATA: Record<string, { nome: string; oab: string }> = {
        ronald: { nome: "RONALD FERREIRA SERRA", oab: "OAB/DF 23.947" },
        pedro: { nome: "PEDRO CÉSAR N. F. MARQUES DE SOUSA", oab: "OAB/DF 57.058" },
      };

      const classeJudicial = CLASSE_MAP[templateType] || "Procedimento Comum Cível";
      const materia = MATERIA_MAP[templateType] || "CÍVEL";
      const jurisdicao = ["recurso_especial", "recurso_extraordinario"].includes(templateType) ? "Tribunais Superiores"
        : ["agravo_instrumento", "recurso_apelacao", "contrarrazoes"].includes(templateType) ? "2º Grau" : "1º Grau";

      const JURISDICOES_TJDFT = [
        "Brasília - Fórum Des. Joaquim Sousa Neto - (VERDE)",
        "Brasília - Fórum Des. Jorge Duarte de Azevedo (Infância e Juventude)",
        "Brasília - Fórum Des. José Júlio Leal Fagundes",
        "Brasília - Fórum Des. Milton Sebastião Barbosa",
        "Brazlândia - Fórum Des. Márcio Ribeiro",
        "Ceilândia - Fórum Des. Antônio Garcia de Amorim",
        "Gama - Fórum Des. Fernando Pessoa Mendes Neto",
        "Guará - Fórum Des. José Gonçalves de Mello",
        "Núcleo Bandeirante - Fórum Des. José Luiz de Almeida",
        "Paranoá - Fórum Des. Clóvis Ramalhete",
        "Planaltina - Fórum Des. Raimundo Nonato Gomes da Silva",
        "Recanto das Emas - Fórum Des. Nefi Cordeiro",
        "Riacho Fundo - Fórum Des. Hermenegildo Gonçalves",
        "Samambaia - Fórum Des. Pedro Augusto",
        "Santa Maria - Fórum Des. Olindo Herculano de Menezes",
        "São Sebastião - Fórum Des. José Norberto Calixto de Souza",
        "Sobradinho - Fórum Des. José Braz da Silveira",
        "Taguatinga - Fórum Des. Esdras Neves",
      ];

      const attorney = ATTORNEY_DATA[selectedAttorney] || ATTORNEY_DATA.ronald;

      let valorCausa = "";
      if (calcItems && calcItems.length > 0) {
        const total = calcItems.reduce((sum: number, item: any) => sum + (item.valorTotal || 0), 0);
        if (total > 0) valorCausa = total.toFixed(2);
      }

      const allTexts = (extractedTexts || []).join("\n\n---\n\n");
      const checklistTexts = (checklistDocTexts || []).join("\n\n---\n\n");

      const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
      const pieceText = generatedHtml ? stripHtml(generatedHtml) : "";

      const systemEntitiesText = (systemEntities || []).map((e: any) => {
        const lines = [`${e.entityType === 'client' ? 'CLIENTE (POLO ATIVO)' : 'DEVEDOR (POLO PASSIVO)'}: ${e.name}`];
        if (e.type) lines.push(`Tipo: ${e.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}`);
        if (e.document) lines.push(`Documento: ${e.document}`);
        if (e.email) lines.push(`Email: ${e.email}`);
        if (e.phone) lines.push(`Telefone: ${e.phone}`);
        if (e.address) lines.push(`Endereço: ${e.address}`);
        if (e.city) lines.push(`Cidade: ${e.city}`);
        if (e.state) lines.push(`Estado: ${e.state}`);
        if (e.zipCode) lines.push(`CEP: ${e.zipCode}`);
        return lines.join('\n');
      }).join('\n\n');

      const prompt = `Você é um assistente jurídico especializado em extrair dados para cadastro de processos no PJe (Processo Judicial Eletrônico).

TAREFA: Analise TODOS os documentos e dados abaixo e extraia o MÁXIMO de dados necessários para cadastrar um processo no PJe. A PEÇA JURÍDICA GERADA é a fonte PRINCIPAL — ela contém os nomes das partes, qualificação, endereço, documentos, fundamentos e pedidos. Os documentos adicionais (RG, procuração, comprovante de endereço, contrato) complementam com dados que a peça pode não ter.

TIPO DE PEÇA: ${templateType}
CLASSE JUDICIAL: ${classeJudicial}
MATÉRIA: ${materia}

INSTRUÇÕES DO CASO:
${instructionText || "(nenhuma)"}

DADOS DO SISTEMA (CLIENTES/DEVEDORES CADASTRADOS):
${systemEntitiesText || "(nenhum selecionado)"}

=== PEÇA JURÍDICA GERADA (FONTE PRINCIPAL) ===
${pieceText || "(nenhuma peça gerada)"}

=== DOCUMENTOS ANEXADOS NO STUDIO ===
${allTexts || "(nenhum)"}

=== DOCUMENTOS ADICIONAIS CARREGADOS NO CHECKLIST ===
${checklistTexts || "(nenhum)"}

EXTRAIA e retorne EXATAMENTE este JSON (preencha o MÁXIMO possível a partir de TODAS as fontes acima, use null para campos realmente não encontrados em nenhuma fonte):
{
  "assunto": {
    "sugestao": "descrição hierárquica do assunto CNJ mais provável (ex: DIREITO CIVIL | Obrigações | Inadimplemento)",
    "codigo": "código numérico CNJ se souber, senão null"
  },
  "poloAtivo": [
    {
      "nome": "nome completo em maiúsculas",
      "tipoPessoa": "PF ou PJ",
      "genitora": "nome da mãe ou null",
      "genitor": "nome do pai ou null",
      "sexo": "Masculino/Feminino ou null",
      "dataNascimento": "DD/MM/AAAA ou null",
      "estadoCivil": "solteiro/casado/divorciado/viúvo/união estável ou null",
      "profissao": "profissão ou null",
      "nacionalidade": "nacionalidade ou null",
      "naturalidadeEstado": "UF de nascimento ou null",
      "naturalidadeMunicipio": "município de nascimento ou null",
      "documentoTipo": "CPF ou CNPJ ou RG",
      "documentoNumero": "número do documento ou null",
      "rg": "número do RG se disponível, separado do CPF, ou null",
      "cep": "CEP ou null",
      "estado": "UF do endereço ou null",
      "cidade": "cidade do endereço ou null",
      "bairro": "bairro ou null",
      "logradouro": "rua/avenida ou null",
      "numero": "número do endereço ou null",
      "complemento": "complemento ou null",
      "email": "email ou null",
      "telefone": "telefone ou null"
    }
  ],
  "poloPassivo": [
    {
      "nome": "nome completo em maiúsculas",
      "tipoPessoa": "PF ou PJ",
      "genitora": null,
      "genitor": null,
      "sexo": null,
      "dataNascimento": null,
      "estadoCivil": null,
      "profissao": null,
      "nacionalidade": null,
      "naturalidadeEstado": null,
      "naturalidadeMunicipio": null,
      "documentoTipo": "CPF ou CNPJ",
      "documentoNumero": "número ou null",
      "rg": null,
      "cep": null,
      "estado": null,
      "cidade": null,
      "bairro": null,
      "logradouro": null,
      "numero": null,
      "complemento": null,
      "email": null,
      "telefone": null
    }
  ],
  "caracteristicas": {
    "justicaGratuita": true/false (analise se há menção no contexto),
    "tutelaAntecipada": true/false,
    "valorCausa": "valor numérico extraído da peça (ex: 10500.00) ou null",
    "segredoJustica": false,
    "prioridade": "Idoso/Criança ou Adolescente/Doença Grave ou null"
  }
}

REGRAS IMPORTANTES:
- ANALISE EXAUSTIVAMENTE a peça jurídica gerada — ela geralmente contém na qualificação: nome completo, nacionalidade, estado civil, profissão, CPF, RG, endereço com CEP, bairro, logradouro, número, complemento, cidade e estado
- Se um dado existe em múltiplas fontes, prefira o mais completo/detalhado
- CPF: formato XXX.XXX.XXX-XX; CNPJ: formato XX.XXX.XXX/XXXX-XX
- Nomes sempre em MAIÚSCULAS
- Na peça, o AUTOR/REQUERENTE vai no polo ativo; o RÉU/REQUERIDO/EXECUTADO vai no polo passivo
- Extraia TODOS os dados de qualificação mencionados (nacionalidade, estado civil, profissão, filiação, etc.)
- Se a peça menciona tutela/urgência/liminar/antecipação dos efeitos, tutelaAntecipada = true
- Se menciona hipossuficiência, gratuidade, justiça gratuita, justicaGratuita = true
- O ASSUNTO deve seguir a hierarquia CNJ (ex: "DIREITO CIVIL | Obrigações | Inadimplemento" ou "DIREITO DO CONSUMIDOR | Responsabilidade do Fornecedor | Indenização por Dano Moral"). Analise o conteúdo da peça para sugerir o assunto mais adequado
- Para o valor da causa, extraia o valor mencionado na peça (geralmente aparece nos pedidos ou "Dá-se à causa o valor de R$...")
- Retorne APENAS o JSON, sem markdown, sem explicação`;

      const response = await aiService.chat([{ role: "user", content: prompt }]);

      let protocolData;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          protocolData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error("Error parsing protocol data JSON:", parseError);
        protocolData = { poloAtivo: [], poloPassivo: [], assunto: { sugestao: null, codigo: null }, caracteristicas: {} };
      }

      protocolData.dadosIniciais = { materia, jurisdicao, classeJudicial };
      protocolData.jurisdicoesTJDFT = jurisdicao === "1º Grau" ? JURISDICOES_TJDFT : [];
      protocolData.procurador = attorney;
      if (valorCausa) {
        protocolData.caracteristicas = protocolData.caracteristicas || {};
        protocolData.caracteristicas.valorCausa = valorCausa;
      }

      res.json(protocolData);
    } catch (error) {
      console.error("Error extracting protocol data:", error);
      res.status(500).json({ error: "Falha ao extrair dados para protocolo." });
    }
  });

  // ==================== LEXAI STUDIO - OCR FOR PDF/IMAGES ====================
  const OCR_EXTRACTION_PROMPT = "Extraia e transcreva TODO o texto visível neste documento. REGRAS CRÍTICAS: 1) Transcreva fielmente, SEM interpretar, resumir ou modificar NENHUM dado. 2) Números de CPF, CNPJ, RG, CEP, telefone devem ser transcritos EXATAMENTE como aparecem, dígito por dígito (ex: se o CPF é 123.456.789-00, escreva exatamente 123.456.789-00). 3) Endereços devem ser transcritos por COMPLETO (rua, número, bairro, cidade, UF, CEP). 4) Valores monetários devem ser transcritos exatamente (ex: R$ 8.260,00). 5) Datas exatamente como aparecem (ex: 20/02/2025). 6) Nomes completos sem abreviar. 7) Se houver múltiplos documentos, separe-os com a marcação '--- DOCUMENTO SEPARADOR ---' entre cada um, identificando o tipo de cada documento (ex: 'Nota Promissória', 'RG/CPF', 'Procuração', etc.). 8) Inclua TODAS as informações visíveis: nomes, documentos, endereços, datas, valores, assinaturas, carimbos.";

  const createGeminiOcrClient = async () => {
    const { GoogleGenAI } = await import("@google/genai");
    return new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  };

  app.post("/api/studio/ocr", async (req: Request, res: Response) => {
    try {
      const { fileData, fileName, fileType } = req.body;
      
      if (!fileData || !fileName) {
        return res.status(400).json({ error: "Arquivo não fornecido" });
      }

      let extractedText = "";

      if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const base64Data = fileData.replace(/^data:application\/pdf;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const parser = new (PDFParse as any)({ data: buffer });
          await parser.load();
          const result = await parser.getText();
          extractedText = (typeof result === "string" ? result : result?.text || "") as string;
          try { await parser.destroy(); } catch {}

          const meaningfulText = extractedText.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').replace(/\s+/g, ' ').trim();
          if (meaningfulText.length < 50) {
            if (meaningfulText.length > 0) {
              console.log(`[OCR] PDF com texto insuficiente (${meaningfulText.length} chars úteis) para ${fileName}, usando Gemini para OCR...`);
            } else {
              console.log(`[OCR] PDF escaneado detectado para ${fileName}, usando Gemini para OCR...`);
            }
            try {
              const geminiClient = await createGeminiOcrClient();
              const base64Clean = fileData.replace(/^data:[^;]+;base64,/, "");
              const geminiResponse = await geminiClient.models.generateContent({
                model: "gemini-2.5-pro",
                contents: [{
                  role: "user",
                  parts: [
                    { inlineData: { mimeType: "application/pdf", data: base64Clean } },
                    { text: OCR_EXTRACTION_PROMPT },
                  ],
                }],
                config: { temperature: 0.1, maxOutputTokens: 32768 },
              });
              const geminiText = geminiResponse.text || "";
              if (geminiText.trim()) {
                extractedText = geminiText;
                console.log(`[OCR] Gemini extraiu ${geminiText.length} caracteres de ${fileName}`);
              } else {
                extractedText = "[PDF escaneado - Gemini não conseguiu extrair texto. O documento pode estar muito danificado.]";
              }
            } catch (geminiError) {
              console.error("[OCR] Gemini PDF OCR error:", geminiError);
              extractedText = "[PDF escaneado detectado - falha no OCR automático. Tente enviar como imagem.]";
            }
          }
        } catch (pdfError) {
          console.error("PDF parse error:", pdfError);
          console.log(`[OCR] Tentando Gemini como fallback para ${fileName}...`);
          try {
            const geminiClient = await createGeminiOcrClient();
            const base64Clean = fileData.replace(/^data:[^;]+;base64,/, "");
            const geminiResponse = await geminiClient.models.generateContent({
              model: "gemini-2.5-pro",
              contents: [{
                role: "user",
                parts: [
                  { inlineData: { mimeType: "application/pdf", data: base64Clean } },
                  { text: OCR_EXTRACTION_PROMPT },
                ],
              }],
              config: { temperature: 0.1, maxOutputTokens: 32768 },
            });
            extractedText = geminiResponse.text || "[Erro ao processar PDF.]";
          } catch (geminiError2) {
            console.error("[OCR] Gemini fallback also failed:", geminiError2);
            extractedText = "[Erro ao processar PDF. O arquivo pode estar corrompido ou protegido.]";
          }
        }
      } 
      else if (fileType?.startsWith("image/") || /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(fileName)) {
        const imageMimeType = fileType || "image/png";
        const base64Clean = fileData.replace(/^data:[^;]+;base64,/, "");
        try {
          console.log(`[OCR] Processando imagem ${fileName} com Gemini 2.5 Pro...`);
          const geminiClient = await createGeminiOcrClient();
          const geminiResponse = await geminiClient.models.generateContent({
            model: "gemini-2.5-pro",
            contents: [{
              role: "user",
              parts: [
                { inlineData: { mimeType: imageMimeType, data: base64Clean } },
                { text: OCR_EXTRACTION_PROMPT },
              ],
            }],
            config: { temperature: 0.1, maxOutputTokens: 32768 },
          });
          const geminiText = geminiResponse.text || "";
          if (geminiText.trim()) {
            extractedText = geminiText;
            console.log(`[OCR] Gemini extraiu ${geminiText.length} caracteres da imagem ${fileName}`);
          } else {
            throw new Error("Gemini returned empty OCR output");
          }
        } catch (geminiOcrError: any) {
          console.error("[OCR] Gemini image OCR failed:", geminiOcrError?.message || geminiOcrError);
          console.log(`[OCR] Tentando GPT-4o-mini como fallback para imagem ${fileName}...`);
          try {
            const openaiClient = new (await import("openai")).default({
              apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
              baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
            });
            const imageUrl = fileData.startsWith("data:") ? fileData : `data:${imageMimeType};base64,${fileData}`;
            const visionResponse = await openaiClient.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: OCR_EXTRACTION_PROMPT },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              }],
              max_tokens: 8000,
            });
            extractedText = visionResponse.choices[0]?.message?.content || "[Não foi possível analisar a imagem]";
            console.log(`[OCR] GPT-4o-mini fallback extraiu ${extractedText.length} caracteres de ${fileName}`);
          } catch (openaiError) {
            console.error("[OCR] GPT-4o-mini fallback also failed:", openaiError);
            extractedText = "[Erro ao processar imagem com OCR.]";
          }
        }
      }
      else if (fileType?.includes("word") || /\.(doc|docx)$/i.test(fileName)) {
        try {
          const mammoth = await import("mammoth");
          const base64Data = fileData.replace(/^data:[^;]+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          if (req.body.isReferenceModel) {
            const htmlResult = await mammoth.default.convertToHtml({ buffer }, {
              styleMap: [
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
              ]
            });
            extractedText = htmlResult.value || "[Documento Word vazio]";
            console.log(`[OCR] Reference model DOCX: extracted HTML (${extractedText.length} chars)`);
          } else {
            const result = await mammoth.default.extractRawText({ buffer });
            extractedText = result.value || "[Documento Word vazio]";
          }
        } catch (docError) {
          console.error("DOCX parse error:", docError);
          extractedText = "[Erro ao processar documento Word.]";
        }
      }
      else {
        extractedText = "[Tipo de arquivo não suportado para extração de texto.]";
      }

      let documents: { type: string; text: string }[] = [];
      if (extractedText.includes("--- DOCUMENTO SEPARADOR ---")) {
        const segments = extractedText.split("--- DOCUMENTO SEPARADOR ---").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        documents = segments.map((seg: string) => {
          const firstLine = seg.split("\n")[0] || "";
          const typeMatch = firstLine.match(/^(?:\*\*)?(?:Documento\s*(?:\d+)?:?\s*)?(.+?)(?:\*\*)?$/i);
          const docType = typeMatch ? typeMatch[1].trim().replace(/^\*\*|\*\*$/g, '') : "Documento";
          return { type: docType, text: seg };
        });
      }

      res.json({ 
        success: true, 
        text: extractedText,
        fileName,
        charCount: extractedText.length,
        documents: documents.length > 1 ? documents : undefined,
      });
    } catch (error) {
      console.error("Error in OCR processing:", error);
      res.status(500).json({ error: "Falha ao processar arquivo para OCR" });
    }
  });

  // ==================== LEXAI STUDIO - HUMANIZE PIECE ====================
  app.post("/api/studio/humanize", async (req: Request, res: Response) => {
    try {
      const { content, intensity } = req.body;

      if (!content) {
        return res.status(400).json({ error: "Conteúdo não fornecido" });
      }

      const validIntensities = ["leve", "moderado", "intenso"];
      const level = validIntensities.includes(intensity) ? intensity : "moderado";

      const intensityInstructions: Record<string, string> = {
        leve: `NÍVEL LEVE - Ajustes sutis:
- Faça pequenas variações na estrutura das frases (inverta ordem de algumas orações)
- Substitua 2-3 expressões típicas de IA por equivalentes mais naturais de advogado
- Adicione 1-2 expressões jurídicas coloquiais entre advogados (ex: "data venia", "com a devida licença")
- Varie levemente o comprimento dos parágrafos
- Mantenha 95% do texto original intacto`,

        moderado: `NÍVEL MODERADO - Reescrita parcial:
- Reescreva 40-50% das frases com estruturas diferentes mantendo o significado
- Varie significativamente o comprimento das frases (misture curtas e longas)
- Adicione expressões e maneirismos típicos de advogado experiente brasileiro
- Inclua pequenas digressões argumentativas naturais ("vale ressaltar que", "neste particular", "com efeito")
- Substitua todas as construções formulaicas de IA
- Varie os conectivos (não use "ademais", "outrossim", "destarte" repetidamente)
- Adicione referências indiretas ao contexto prático ("conforme amplamente debatido na doutrina", "na prática forense")
- Reestruture a ordem de alguns argumentos para parecer menos linear/previsível`,

        intenso: `NÍVEL INTENSO - Reescrita completa:
- Reescreva completamente o texto mantendo TODOS os argumentos, citações e pedidos
- Use estilo pessoal e distintivo de advogado sênior brasileiro
- Varie drasticamente a estrutura (parágrafos curtos de 1 frase, depois longos de 4-5 frases)
- Adicione toques retóricos pessoais ("Não se pode olvidar...", "Força convir que...", "Ora, Excelência...")
- Inclua 2-3 passagens com tom mais assertivo/enfático e outras mais analíticas
- Use vocabulário jurídico variado e sofisticado mas natural
- Reestruture completamente a ordem argumentativa
- Adicione transições naturais entre seções ("Superada esta questão, passa-se a analisar...")
- Quebre a previsibilidade: alterne entre argumentação direta e indireta
- O texto deve parecer ter sido escrito por um advogado com 20+ anos de experiência`,
      };

      const systemPrompt = `Você é um revisor especializado em humanização de textos jurídicos brasileiros. Sua função é reescrever peças jurídicas geradas por IA para que pareçam escritas por um advogado humano experiente, passando em qualquer detector de IA.

${intensityInstructions[level]}

REGRAS ABSOLUTAS (NUNCA VIOLAR):
1. PRESERVAR 100% INTOCADO - CITAÇÕES DE JURISPRUDÊNCIA: Todo trecho entre aspas que cite decisão judicial, acórdão, voto, ementa, súmula. Inclui REsp, HC, ADI, AgRg, ARE, RE, AI, MS, RMS, CC, ACO, ADPF e qualquer referência a tribunal (STF, STJ, TST, TRF, TJ, etc.). NÃO altere UMA VÍRGULA dessas citações.
2. PRESERVAR 100% INTOCADO - ARTIGOS DE LEI: Toda referência a artigos, parágrafos (§), incisos, alíneas de qualquer lei, código, decreto, resolução, instrução normativa. Inclui "Art.", "art.", "§", "inciso", "alínea" e o texto literal do dispositivo legal quando citado.
3. PRESERVAR 100% INTOCADO - CITAÇÕES LITERAIS/DOUTRINÁRIAS: Todo texto entre aspas que represente citação direta de qualquer autor, obra doutrinária, parecer ou documento. Manter exatamente como está, incluindo aspas.
4. PRESERVAR 100%: A formatação HTML (tags <p>, <strong>, <em>, <ul>, <li>, <h1>-<h6>, <br>, <blockquote>, etc.)
5. PRESERVAR 100%: Os pedidos finais e seus termos técnicos exatos
6. PRESERVAR 100%: Referências a documentos anexos, números de processo, datas, valores monetários, nomes das partes, CPF/CNPJ
7. NÃO adicionar argumentos novos ou citações inventadas
8. NÃO remover nenhum argumento ou fundamento jurídico
9. A peça humanizada DEVE ter aproximadamente o mesmo comprimento da original (+/- 10%)
10. Retorne APENAS o HTML da peça reescrita, sem explicações ou comentários
11. APENAS reescreva o TEXTO ARGUMENTATIVO do advogado (a "cola" entre as citações). As citações são sagradas e intocáveis.

TÉCNICAS ANTI-DETECÇÃO:
- Evite padrões repetitivos de estrutura (cada parágrafo deve ter estrutura única)
- Use perplex variations: nem sempre comece parágrafos com o sujeito
- Misture voz ativa e passiva naturalmente
- Inclua ocasionalmente frases mais coloquiais do mundo forense
- Varie os conectivos e não siga padrão previsível
- Adicione uma ou outra frase mais curta, direta, quase falada
- Use referências cruzadas internas ("conforme já demonstrado", "como se verá adiante")`;

      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Humanize esta peça jurídica (nível: ${level}):\n\n${content}` },
        ],
        max_tokens: 16000,
        temperature: level === "intenso" ? 0.9 : level === "moderado" ? 0.75 : 0.5,
      });

      const humanizedContent = completion.choices[0]?.message?.content || "";

      if (!humanizedContent.trim()) {
        return res.status(500).json({ error: "Falha ao humanizar o texto" });
      }

      res.json({ content: humanizedContent, intensity: level });
    } catch (error) {
      console.error("Error humanizing piece:", error);
      res.status(500).json({ error: "Falha ao humanizar a peça" });
    }
  });

  // ==================== LEGAL SEARCH ====================
  const searchSchema = z.object({
    query: z.string().min(3, "A pesquisa deve ter pelo menos 3 caracteres"),
    tribunals: z.array(z.string()).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    limit: z.number().min(1).max(50).optional(),
  });

  app.post("/api/search/jurisprudence", searchRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = searchSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid search parameters", details: parsed.error.flatten() });
      }
      
      const results = await legalSearchService.searchJurisprudence(parsed.data.query, {
        tribunals: parsed.data.tribunals,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        limit: parsed.data.limit || 10,
      });
      
      res.json(results);
    } catch (error) {
      console.error("Error searching jurisprudence:", error);
      res.status(500).json({ error: "Failed to search jurisprudence" });
    }
  });

  app.post("/api/search/doctrine", searchRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = searchSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid search parameters", details: parsed.error.flatten() });
      }
      
      const results = await legalSearchService.searchWebDoctrine(parsed.data.query, {
        limit: parsed.data.limit || 10,
      });
      
      res.json(results);
    } catch (error) {
      console.error("Error searching doctrine:", error);
      res.status(500).json({ error: "Failed to search doctrine" });
    }
  });

  app.post("/api/search/summarize", searchRateLimiter, async (req: Request, res: Response) => {
    try {
      const { result } = req.body;
      
      if (!result) {
        return res.status(400).json({ error: "Result is required" });
      }
      
      const summary = await legalSearchService.summarizeResult(result);
      res.json({ summary });
    } catch (error) {
      console.error("Error summarizing result:", error);
      res.status(500).json({ error: "Failed to summarize result" });
    }
  });

  app.post("/api/search/extract-content", searchRateLimiter, async (req: Request, res: Response) => {
    try {
      const { results } = req.body;
      
      if (!results || !Array.isArray(results)) {
        return res.status(400).json({ error: "Results array is required" });
      }
      
      const enrichedResults = await legalSearchService.extractLegalContent(results);
      res.json({ results: enrichedResults });
    } catch (error) {
      console.error("Error extracting content:", error);
      res.status(500).json({ error: "Failed to extract legal content" });
    }
  });

  app.post("/api/search/web-jurisprudence", searchRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = searchSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid search parameters", details: parsed.error.flatten() });
      }
      
      const results = await legalSearchService.searchWebJurisprudence(parsed.data.query, {
        limit: parsed.data.limit || 8,
      });
      
      res.json(results);
    } catch (error) {
      console.error("Error in web jurisprudence search:", error);
      res.status(500).json({ error: "Failed to search web jurisprudence" });
    }
  });

  app.post("/api/search/web-doctrine", searchRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = searchSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid search parameters", details: parsed.error.flatten() });
      }
      
      const results = await legalSearchService.searchWebDoctrine(parsed.data.query, {
        limit: parsed.data.limit || 8,
      });
      
      res.json(results);
    } catch (error) {
      console.error("Error in web doctrine search:", error);
      res.status(500).json({ error: "Failed to search web doctrine" });
    }
  });

  // ==================== AGENDA ====================
  app.get("/api/agenda", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { date, startDate, endDate } = req.query;
      let events;
      if (date) {
        events = await storage.getAgendaEventsByDate(tenantId, date as string);
      } else if (startDate && endDate) {
        events = await storage.getAgendaEventsByRange(tenantId, startDate as string, endDate as string);
      } else {
        events = await storage.getAgendaEventsByTenant(tenantId);
      }
      res.json(events);
    } catch (error) {
      console.error("Error fetching agenda events:", error);
      res.status(500).json({ error: "Failed to fetch agenda events" });
    }
  });

  app.post("/api/agenda", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const data = insertAgendaEventSchema.parse({ ...req.body, tenantId });
      const event = await storage.createAgendaEvent(data);
      res.json(event);
    } catch (error) {
      console.error("Error creating agenda event:", error);
      res.status(500).json({ error: "Failed to create agenda event" });
    }
  });

  app.put("/api/agenda/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.updateAgendaEvent(id, req.body);
      res.json(event);
    } catch (error) {
      console.error("Error updating agenda event:", error);
      res.status(500).json({ error: "Failed to update agenda event" });
    }
  });

  app.delete("/api/agenda/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAgendaEvent(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting agenda event:", error);
      res.status(500).json({ error: "Failed to delete agenda event" });
    }
  });

  // ==================== WHATSAPP CONFIG ====================
  // ── Team: sócio phone management for daily notifications ────────────────
  app.get("/api/team/socios", requireAuth, async (req, res) => {
    try {
      const callerRole = req.session?.user?.role || req.tokenUser?.role;
      if (callerRole !== "socio" && callerRole !== "admin") {
        return res.status(403).json({ error: "Acesso restrito a sócios" });
      }
      const tenantId = getTenantId(req);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const socios = allUsers.filter(u => u.role === "socio");
      res.json(socios.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || null,
        isActive: u.isActive,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch socios" });
    }
  });

  app.patch("/api/team/socios/:id/phone", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const callerRole = req.session?.user?.role || req.tokenUser?.role;
      if (callerRole !== "socio" && callerRole !== "admin") {
        return res.status(403).json({ error: "Apenas sócios podem atualizar números de telefone" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      // Verify target is a sócio in this tenant before updating
      const targetUser = await storage.getUser(id);
      if (!targetUser || targetUser.tenantId !== tenantId || targetUser.role !== "socio") {
        return res.status(404).json({ error: "Sócio not found" });
      }

      const { phone } = req.body as { phone?: string };
      const cleaned = phone ? phone.replace(/\D/g, "") : null;
      const updated = await storage.updateUserPhone(id, tenantId, cleaned);
      if (!updated) return res.status(404).json({ error: "Sócio not found" });
      res.json({ id: updated.id, name: updated.name, phone: updated.phone });
    } catch (error) {
      res.status(500).json({ error: "Failed to update phone" });
    }
  });

  app.get("/api/whatsapp/contacts", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const contacts = await storage.getWhatsappContacts(tenantId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching whatsapp contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.post("/api/whatsapp/contacts", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const data = insertWhatsappConfigSchema.parse({ ...req.body, tenantId });
      const contact = await storage.createWhatsappContact(data);
      res.json(contact);
    } catch (error) {
      console.error("Error creating whatsapp contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  app.delete("/api/whatsapp/contacts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteWhatsappContact(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting whatsapp contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  app.get("/api/whatsapp/schedule", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const schedule = await storage.getWhatsappSchedule(tenantId);
      res.json(schedule || { sendTime: "07:00", isActive: true });
    } catch (error) {
      console.error("Error fetching whatsapp schedule:", error);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  app.put("/api/whatsapp/schedule", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const schedule = await storage.upsertWhatsappSchedule(tenantId, req.body);
      const { updateCronSchedule } = await import("./services/dailyCron");
      await updateCronSchedule(tenantId);
      res.json(schedule);
    } catch (error) {
      console.error("Error updating whatsapp schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // WhatsApp daily summary endpoint (manual trigger)
  // Agenda sync from deadlines/movements
  app.post("/api/agenda/sync", async (req, res) => {
    try {
      const { syncDeadlinesToAgenda } = await import("./services/agendaSync");
      const tenantId = getTenantId(req);
      const created = await syncDeadlinesToAgenda(tenantId);
      res.json({ success: true, created });
    } catch (error) {
      console.error("Error syncing agenda:", error);
      res.status(500).json({ error: "Failed to sync agenda" });
    }
  });

  app.post("/api/whatsapp/send-daily-summary", async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const tenantId = getTenantId(req);
      const result = await whatsappService.sendDailySummaryToAll(tenantId);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error sending daily summary:", error);
      res.status(500).json({ error: "Failed to send daily summary" });
    }
  });

  app.post("/api/whatsapp/migrate-lid", async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const result = await whatsappService.runLidMigration();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error running LID migration:", error);
      res.status(500).json({ error: "Failed to run LID migration" });
    }
  });

  app.get("/api/whatsapp/status", async (_req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      res.json(whatsappService.getStatus());
    } catch (error) {
      res.json({ status: "disconnected", qrCode: null, message: "Serviço não iniciado" });
    }
  });

  app.post("/api/whatsapp/connect", async (_req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const fresh = _req.query.fresh === "true";
      if (fresh) {
        const fs = await import("fs");
        const authDir = "./whatsapp_auth";
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
          console.log("[WhatsApp] Auth credentials cleared for fresh QR code");
        }
      }
      whatsappService.initialize();
      res.json({ success: true, message: "Iniciando conexão..." });
    } catch (error) {
      console.error("Error connecting whatsapp:", error);
      res.status(500).json({ error: "Failed to connect" });
    }
  });


  app.post("/api/whatsapp/disconnect", async (_req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      await whatsappService.disconnect();
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting whatsapp:", error);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  app.post("/api/whatsapp/preview-summary", async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const tenantId = getTenantId(req);
      const summary = await whatsappService.generateDailySummary(tenantId);
      res.json({ summary });
    } catch (error) {
      console.error("Error generating preview:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // WhatsApp Messaging
  const groupNameCache = new Map<string, { name: string; ts: number }>();

  app.get("/api/whatsapp/conversations", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const conversations = await storage.getWhatsappConversations(tenantId);
      const contacts = await storage.getWhatsappContacts(tenantId);

      const { whatsappService } = await import("./services/whatsapp");
      const sock = whatsappService.getSocket();

      const getGroupName = async (jid: string, fallback: string): Promise<string> => {
        const cached = groupNameCache.get(jid);
        if (cached && Date.now() - cached.ts < 300000) return cached.name;
        if (!sock) return fallback;
        try {
          const metadata = await sock.groupMetadata(jid);
          const name = metadata.subject || fallback;
          groupNameCache.set(jid, { name, ts: Date.now() });
          return name;
        } catch {
          return fallback;
        }
      };

      const enriched = await Promise.all(conversations.map(async (conv) => {
        if (conv.isGroup) {
          const groupName = await getGroupName(conv.jid, conv.senderName || conv.jid);
          return {
            ...conv,
            contactName: groupName,
            phoneNumber: conv.jid,
            isGroup: true,
          };
        }

        let number: string;
        if (conv.jid.endsWith("@lid")) {
          const lid = conv.jid.replace("@lid", "");
          const phone = await storage.getPhoneByLid(lid);
          number = phone || lid;
        } else {
          number = conv.jid.replace("@s.whatsapp.net", "");
        }
        const contact = contacts.find(c => c.phoneNumber.replace(/\D/g, "") === number);
        return {
          ...conv,
          contactName: contact?.contactName || conv.senderName || number,
          phoneNumber: number,
          isGroup: false,
        };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/whatsapp/messages/:jid", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { jid } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const messages = await storage.getWhatsappMessages(tenantId, jid, limit);
      res.json(messages.reverse());
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/whatsapp/messages/send-file", upload.single("file"), async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const tenantId = getTenantId(req);
      const { jid, caption } = req.body;

      if (!jid || !req.file) {
        return res.status(400).json({ error: "jid and file are required" });
      }

      if (jid.endsWith("@g.us")) {
        return res.status(400).json({ error: "Sending files to groups is not supported" });
      }

      const file = req.file;
      const allowedMimes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv", "text/plain",
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "video/mp4",
        "audio/mpeg", "audio/ogg", "audio/wav",
      ];
      if (!allowedMimes.includes(file.mimetype)) {
        return res.status(400).json({ error: `Tipo de arquivo não permitido: ${file.mimetype}` });
      }

      const isImage = file.mimetype.startsWith("image/");

      let success: boolean;
      if (isImage) {
        success = await whatsappService.sendImageToJid(jid, file.buffer, file.mimetype, caption || "", tenantId, true);
      } else {
        success = await whatsappService.sendDocumentToJid(jid, file.buffer, file.originalname, file.mimetype, caption || "", tenantId, true);
      }

      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Failed to send file. WhatsApp not connected." });
      }
    } catch (error) {
      console.error("Error sending file:", error);
      res.status(500).json({ error: "Failed to send file" });
    }
  });

  app.post("/api/whatsapp/messages/send", async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const tenantId = getTenantId(req);
      const { jid, message } = req.body;

      if (!jid || !message) {
        return res.status(400).json({ error: "jid and message are required" });
      }

      if (jid.endsWith("@g.us")) {
        return res.status(400).json({ error: "Sending messages to groups is not supported" });
      }

      const success = await whatsappService.sendToJid(jid, message, tenantId, true);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Failed to send message. WhatsApp not connected." });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/whatsapp/send-to-number", async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const tenantId = getTenantId(req);
      const { phoneNumber, message } = req.body;

      if (!phoneNumber || !message) {
        return res.status(400).json({ error: "phoneNumber and message are required" });
      }

      let cleaned = phoneNumber.replace(/\D/g, "");
      if (cleaned.length === 11 || cleaned.length === 10) {
        cleaned = "55" + cleaned;
      }
      if (cleaned.length < 12) {
        return res.status(400).json({ error: "Número inválido. Use DDD + número (ex: 61999999999)" });
      }

      const success = await whatsappService.sendMessage(cleaned, message, tenantId, true);
      if (success) {
        res.json({ success: true, jid: `${cleaned}@s.whatsapp.net` });
      } else {
        res.status(500).json({ error: "Falha ao enviar. WhatsApp não conectado." });
      }
    } catch (error) {
      console.error("Error sending to number:", error);
      res.status(500).json({ error: "Falha ao enviar mensagem" });
    }
  });

  app.post("/api/whatsapp/messages/:jid/read", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { jid } = req.params;
      await storage.markWhatsappMessagesRead(tenantId, jid);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  app.get("/api/whatsapp/unread-count", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const count = await storage.getUnreadWhatsappCount(tenantId);
      res.json({ count });
    } catch (error) {
      res.json({ count: 0 });
    }
  });

  // ==================== SECRETARY LEXAI API ====================
  app.get("/api/secretary/config", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const config = await storage.getSecretaryConfig(tenantId);
      res.json(config || {
        mode: "semi_auto",
        systemPrompt: "",
        businessHoursStart: "08:00",
        businessHoursEnd: "18:00",
        workOnWeekends: false,
        offHoursMessage: "Obrigada pelo contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve.",
        isActive: false,
      });
    } catch (error) {
      console.error("Error fetching secretary config:", error);
      res.status(500).json({ error: "Failed to fetch config" });
    }
  });

  app.put("/api/secretary/config", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const config = await storage.upsertSecretaryConfig(tenantId, req.body);
      res.json(config);
    } catch (error) {
      console.error("Error updating secretary config:", error);
      res.status(500).json({ error: "Failed to update config" });
    }
  });

  app.get("/api/secretary/actions", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const actions = await storage.getSecretaryActions(tenantId, limit);
      res.json(actions);
    } catch (error) {
      console.error("Error fetching secretary actions:", error);
      res.status(500).json({ error: "Failed to fetch actions" });
    }
  });

  app.get("/api/secretary/pending", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actions = await storage.getPendingSecretaryActions(tenantId);
      res.json(actions);
    } catch (error) {
      console.error("Error fetching pending actions:", error);
      res.status(500).json({ error: "Failed to fetch pending actions" });
    }
  });

  app.post("/api/secretary/actions/:id/approve", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const { secretaryService } = await import("./services/secretary");
      const success = await secretaryService.approveDraft(id, tenantId);
      res.json({ success });
    } catch (error) {
      console.error("Error approving action:", error);
      res.status(500).json({ error: "Failed to approve" });
    }
  });

  app.post("/api/secretary/actions/:id/edit-send", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const { message } = req.body;
      const { secretaryService } = await import("./services/secretary");
      const success = await secretaryService.editAndSendDraft(id, tenantId, message);
      res.json({ success });
    } catch (error) {
      console.error("Error editing/sending action:", error);
      res.status(500).json({ error: "Failed to edit and send" });
    }
  });

  app.post("/api/secretary/actions/:id/reject", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { secretaryService } = await import("./services/secretary");
      await secretaryService.rejectDraft(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting action:", error);
      res.status(500).json({ error: "Failed to reject" });
    }
  });

  // ==================== DOCUMENT ARCHIVE ====================

  app.post("/api/documents/archive", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { title, type, clientId, caseId } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fs = await import("fs");
      const path = await import("path");
      const crypto = await import("crypto");

      const uploadDir = path.default.join(".", "uploads", `tenant_${tenantId}`);
      if (!fs.default.existsSync(uploadDir)) {
        fs.default.mkdirSync(uploadDir, { recursive: true });
      }

      const ext = path.default.extname(file.originalname);
      const safeName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.default.join(uploadDir, safeName);
      fs.default.writeFileSync(filePath, file.buffer);

      const fileHash = crypto.default.createHash("md5").update(file.buffer).digest("hex");

      const document = await storage.createDocument({
        tenantId,
        title: title || file.originalname,
        type: type || "documento",
        filePath,
        fileHash,
        fileSize: file.size,
        mimeType: file.mimetype,
        clientId: clientId ? parseInt(clientId) : null,
        caseId: caseId ? parseInt(caseId) : null,
        version: 1,
        aiGenerated: false,
      });

      res.json(document);
    } catch (error) {
      console.error("Error archiving document:", error);
      res.status(500).json({ error: "Failed to archive document" });
    }
  });

  app.get("/api/documents/by-client/:clientId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = parseInt(req.params.clientId);
      const docs = await storage.getDocumentsByClient(clientId);
      const filtered = docs.filter((d: any) => d.tenantId === tenantId);
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching client documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const docId = parseInt(req.params.id);
      const allDocs = await storage.getDocumentsByTenant(tenantId);
      const doc = allDocs.find((d: any) => d.id === docId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      try {
        const fs = await import("fs");
        if (doc.filePath && fs.default.existsSync(doc.filePath)) {
          fs.default.unlinkSync(doc.filePath);
        }
      } catch {}
      await storage.deleteDocument(docId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/documents/download/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const docId = parseInt(req.params.id);
      const allDocs = await storage.getDocumentsByTenant(tenantId);
      const doc = allDocs.find((d: any) => d.id === docId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      const fs = await import("fs");
      const path = await import("path");
      if (!fs.default.existsSync(doc.filePath)) {
        return res.status(404).json({ error: "File not found on disk" });
      }
      const fileName = path.default.basename(doc.filePath);
      res.setHeader("Content-Disposition", `attachment; filename="${doc.title || fileName}"`);
      res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
      fs.default.createReadStream(doc.filePath).pipe(res);
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ error: "Failed to download document" });
    }
  });

  app.get("/api/documents/:id/extract-text", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const docId = parseInt(req.params.id);
      const doc = await storage.getDocument(docId);
      if (!doc || doc.tenantId !== tenantId) {
        return res.status(404).json({ error: "Document not found" });
      }
      // Return cached text if available
      const existingMeta = (doc.metadata || {}) as Record<string, any>;
      if (existingMeta.extractedText) {
        return res.json({ extractedText: existingMeta.extractedText });
      }
      const fs = await import("fs");
      if (!doc.filePath || !fs.default.existsSync(doc.filePath)) {
        return res.json({ extractedText: null });
      }
      const fileBuffer = fs.default.readFileSync(doc.filePath);
      let extractedText: string | null = null;
      try {
        if (doc.mimeType === "application/pdf" || doc.filePath.toLowerCase().endsWith(".pdf")) {
          const pdfParse = (await import("pdf-parse")).default;
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text?.trim() || null;
        } else if (
          doc.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          doc.filePath.toLowerCase().endsWith(".docx")
        ) {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = result.value?.trim() || null;
        } else if (doc.mimeType === "text/plain" || doc.filePath.toLowerCase().endsWith(".txt")) {
          extractedText = fileBuffer.toString("utf-8").trim();
        }
      } catch (extractErr) {
        console.error("Error extracting text from document:", extractErr);
      }
      // Cache in metadata if extracted
      if (extractedText) {
        const updatedMeta = { ...existingMeta, extractedText };
        await storage.updateDocument(docId, { metadata: updatedMeta });
      }
      return res.json({ extractedText });
    } catch (error) {
      console.error("Error extracting document text:", error);
      res.status(500).json({ error: "Failed to extract text" });
    }
  });

  // ==================== DEBTORS ====================

  app.get("/api/clients/:clientId/debtors", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = parseInt(req.params.clientId);
      const result = await storage.getDebtorsByClient(clientId, tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error getting debtors:", error);
      res.status(500).json({ error: "Failed to get debtors" });
    }
  });

  app.get("/api/debtors/:id", async (req, res) => {
    try {
      const debtor = await storage.getDebtor(parseInt(req.params.id));
      if (!debtor) return res.status(404).json({ error: "Not found" });
      res.json(debtor);
    } catch (error) {
      res.status(500).json({ error: "Failed to get debtor" });
    }
  });

  app.post("/api/debtors", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const data = { ...req.body, tenantId };
      Object.keys(data).forEach((k) => { if (data[k] === "") data[k] = null; });
      if (data.totalDebt != null) {
        let raw = String(data.totalDebt).replace(/[^\d.,-]/g, "");
        if (raw.includes(",")) { raw = raw.replace(/\./g, "").replace(",", "."); }
        const parsed = parseFloat(raw);
        data.totalDebt = isNaN(parsed) ? null : String(parsed);
      }
      const debtor = await storage.createDebtor(data);
      res.json(debtor);
    } catch (error) {
      console.error("Error creating debtor:", error);
      res.status(500).json({ error: "Failed to create debtor" });
    }
  });

  app.put("/api/debtors/:id", async (req, res) => {
    try {
      const data = { ...req.body };
      Object.keys(data).forEach((k) => { if (data[k] === "") data[k] = null; });
      if (data.totalDebt != null) {
        let raw = String(data.totalDebt).replace(/[^\d.,-]/g, "");
        if (raw.includes(",")) { raw = raw.replace(/\./g, "").replace(",", "."); }
        const parsed = parseFloat(raw);
        data.totalDebt = isNaN(parsed) ? null : String(parsed);
      }
      const debtor = await storage.updateDebtor(parseInt(req.params.id), data);
      res.json(debtor);
    } catch (error) {
      console.error("Error updating debtor:", error);
      res.status(500).json({ error: "Failed to update debtor" });
    }
  });

  app.delete("/api/debtors/:id", async (req, res) => {
    try {
      await storage.deleteDebtor(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting debtor:", error);
      res.status(500).json({ error: "Failed to delete debtor" });
    }
  });

  app.get("/api/debtors", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const result = await storage.getDebtorsByTenant(tenantId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to get debtors" });
    }
  });

  app.get("/api/debtors/:debtorId/documents", async (req, res) => {
    try {
      const docs = await storage.getDocumentsByDebtor(parseInt(req.params.debtorId));
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get debtor documents" });
    }
  });

  app.post("/api/debtors/:debtorId/documents", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const debtorId = parseInt(req.params.debtorId);
      const { title, type, clientId } = req.body;
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file provided" });

      const fs = await import("fs");
      const path = await import("path");
      const crypto = await import("crypto");

      const uploadDir = path.default.join(".", "uploads", `tenant_${tenantId}`, "debtors");
      if (!fs.default.existsSync(uploadDir)) fs.default.mkdirSync(uploadDir, { recursive: true });

      const safeName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.default.join(uploadDir, safeName);
      fs.default.writeFileSync(filePath, file.buffer);
      const fileHash = crypto.default.createHash("md5").update(file.buffer).digest("hex");

      const document = await storage.createDocument({
        tenantId,
        debtorId,
        clientId: clientId ? parseInt(clientId) : null,
        title: title || file.originalname,
        type: type || "documento_devedor",
        filePath,
        fileHash,
        fileSize: file.size,
        mimeType: file.mimetype,
        version: 1,
        aiGenerated: false,
      });
      res.json(document);
    } catch (error) {
      console.error("Error uploading debtor document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.post("/api/debtors/:debtorId/case-report", async (req: Request, res: Response) => {
    try {
      const debtorId = parseInt(req.params.debtorId);
      const tenantId = getTenantId(req);
      const debtor = await storage.getDebtor(debtorId);
      if (!debtor) return res.status(404).json({ error: "Debtor not found" });

      const clientCases = await storage.getCasesByClient(debtor.clientId!);
      const debtorName = debtor.name?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
      const matchedCases = clientCases.filter((c: any) => {
        const reu = (c.reu || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const title = (c.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return reu.includes(debtorName) || title.includes(debtorName) || debtorName.includes(reu);
      });

      if (matchedCases.length === 0) {
        return res.json({ report: `Nenhum processo encontrado vinculado ao devedor **${debtor.name}**.`, cases: [] });
      }

      const casesWithMovements = await Promise.all(
        matchedCases.map(async (c: any) => {
          const movements = await storage.getCaseMovements(c.id);
          return { ...c, lastMovements: movements.slice(0, 5) };
        })
      );

      const casesSummary = casesWithMovements.map((c: any) => {
        const movs = c.lastMovements.map((m: any) => `  - ${m.date ? new Date(m.date).toLocaleDateString("pt-BR") : "?"}: ${m.description || m.content || "Sem descrição"}`).join("\n");
        return `**Processo ${c.caseNumber}**\n- Título: ${c.title}\n- Vara: ${c.vara || c.court || "Não informado"}\n- Classe: ${c.classeNome || c.caseClass || "Não informado"}\n- Valor da Causa: ${c.valorCausa ? `R$ ${Number(c.valorCausa).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Não informado"}\n- Status: ${c.status}\n- Últimas Movimentações:\n${movs || "  Nenhuma movimentação registrada."}`;
      }).join("\n\n---\n\n");

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Você é um assistente jurídico brasileiro. Gere um relatório executivo conciso sobre o estado dos processos de um devedor. Inclua: situação atual de cada processo, últimas movimentações relevantes, próximos passos recomendados, e avaliação geral da cobrança. Formate em Markdown. Seja objetivo e profissional."
          },
          {
            role: "user",
            content: `Gere um relatório do estado dos processos do devedor **${debtor.name}** (${debtor.type}, documento: ${debtor.document || "não informado"}, dívida total: ${debtor.totalDebt ? `R$ ${Number(debtor.totalDebt).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "não informada"}).\n\nDados dos processos:\n\n${casesSummary}`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const report = completion.choices[0]?.message?.content || "Não foi possível gerar o relatório.";
      res.json({ report, cases: matchedCases.map((c: any) => ({ id: c.id, caseNumber: c.caseNumber, title: c.title, status: c.status })) });
    } catch (error) {
      console.error("Error generating debtor case report:", error);
      res.status(500).json({ error: "Failed to generate case report" });
    }
  });

  app.post("/api/debtors/extract-text", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Texto é obrigatório" });
      }

      const aiService = (await import("./services/ai")).default;
      let result: any;
      try {
        result = await aiService.chat([{
          role: "user",
          content: `Extraia os dados de um devedor a partir do texto abaixo. Retorne APENAS um JSON válido com os campos:
{"type":"PF ou PJ","name":"nome completo","document":"CPF ou CNPJ","email":"email","phone":"telefone","whatsapp":"whatsapp","address":"endereço completo","city":"cidade","state":"UF","zipCode":"CEP","totalDebt":"valor da dívida se houver","notes":"informações adicionais"}
Se um campo não for encontrado, use string vazia. Para totalDebt use formato numérico (ex: "1500.00"). Retorne APENAS o JSON, sem explicações.

TEXTO:
${text}`
        }], [], { temperature: 0.1, maxTokens: 1000 });
      } catch (aiError: any) {
        console.error("AI service error in extract-text:", aiError);
        return res.status(503).json({ error: "Serviço de IA indisponível. Tente novamente em instantes." });
      }

      if (!result || !result.content) {
        return res.status(503).json({ error: "Resposta inválida da IA. Tente novamente." });
      }

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          return res.json(extracted);
        } catch (parseError) {
          console.error("JSON parse error in extract-text:", parseError, "Raw:", jsonMatch[0]);
          return res.status(422).json({ error: "Não foi possível estruturar os dados extraídos. Preencha manualmente." });
        }
      } else {
        console.error("No JSON found in AI response:", result.content);
        return res.status(422).json({ error: "A IA não retornou dados estruturados. Verifique o texto e tente novamente." });
      }
    } catch (error) {
      console.error("Error extracting debtor from text:", error);
      res.status(500).json({ error: "Erro ao processar o texto. Tente novamente." });
    }
  });

  // ==================== NEGOTIATIONS ====================
  
  // Get all negotiations for tenant
  app.get("/api/negotiations", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const negotiations = await storage.getNegotiationsByTenant(tenantId);
      res.json(negotiations);
    } catch (error) {
      console.error("Error fetching negotiations:", error);
      res.status(500).json({ error: "Failed to fetch negotiations" });
    }
  });

  // Get negotiations by client
  app.get("/api/clients/:clientId/negotiations", async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const negotiations = await storage.getNegotiationsByClient(clientId);
      res.json(negotiations);
    } catch (error) {
      console.error("Error fetching client negotiations:", error);
      res.status(500).json({ error: "Failed to fetch negotiations" });
    }
  });

  // Get single negotiation
  app.get("/api/negotiations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const negotiation = await storage.getNegotiation(id);
      if (!negotiation) {
        return res.status(404).json({ error: "Negotiation not found" });
      }
      res.json(negotiation);
    } catch (error) {
      console.error("Error fetching negotiation:", error);
      res.status(500).json({ error: "Failed to fetch negotiation" });
    }
  });

  // Create negotiation
  app.post("/api/negotiations", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = (req.session as any)?.userId;
      const data = { ...req.body, tenantId, createdBy: userId };
      if (data.deadline && typeof data.deadline === 'string') {
        data.deadline = new Date(data.deadline);
      }
      const negotiation = await storage.createNegotiation(data);
      res.status(201).json(negotiation);
    } catch (error) {
      console.error("Error creating negotiation:", error);
      res.status(500).json({ error: "Failed to create negotiation" });
    }
  });

  // Update negotiation
  app.put("/api/negotiations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = { ...req.body };
      if (data.deadline && typeof data.deadline === 'string') {
        data.deadline = new Date(data.deadline);
      }
      const negotiation = await storage.updateNegotiation(id, data);
      res.json(negotiation);
    } catch (error) {
      console.error("Error updating negotiation:", error);
      res.status(500).json({ error: "Failed to update negotiation" });
    }
  });

  // Delete negotiation
  app.delete("/api/negotiations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteNegotiation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting negotiation:", error);
      res.status(500).json({ error: "Failed to delete negotiation" });
    }
  });

  // Get negotiation contacts
  app.get("/api/negotiations/:id/contacts", async (req, res) => {
    try {
      const negotiationId = parseInt(req.params.id);
      const contacts = await storage.getNegotiationContacts(negotiationId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Add negotiation contact
  app.post("/api/negotiations/:id/contacts", async (req, res) => {
    try {
      const negotiationId = parseInt(req.params.id);
      const contact = await storage.createNegotiationContact({ ...req.body, negotiationId });
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Delete negotiation contact
  app.delete("/api/negotiations/contacts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteNegotiationContact(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // Get negotiation rounds
  app.get("/api/negotiations/:id/rounds", async (req, res) => {
    try {
      const negotiationId = parseInt(req.params.id);
      const rounds = await storage.getNegotiationRounds(negotiationId);
      res.json(rounds);
    } catch (error) {
      console.error("Error fetching rounds:", error);
      res.status(500).json({ error: "Failed to fetch rounds" });
    }
  });

  // Create negotiation round
  app.post("/api/negotiations/:id/rounds", async (req, res) => {
    try {
      const negotiationId = parseInt(req.params.id);
      const userId = (req.session as any)?.userId;
      const round = await storage.createNegotiationRound({ ...req.body, negotiationId, createdBy: userId });
      res.status(201).json(round);
    } catch (error) {
      console.error("Error creating round:", error);
      res.status(500).json({ error: "Failed to create round" });
    }
  });

  // Update negotiation round
  app.put("/api/negotiations/rounds/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const round = await storage.updateNegotiationRound(id, req.body);
      res.json(round);
    } catch (error) {
      console.error("Error updating round:", error);
      res.status(500).json({ error: "Failed to update round" });
    }
  });

  // AI: Analyze negotiation risk/benefit
  app.post("/api/negotiations/:id/ai-analyze", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const negotiation = await storage.getNegotiation(id);
      if (!negotiation) return res.status(404).json({ error: "Not found" });
      
      const caseData = negotiation.caseId ? await storage.getCase(negotiation.caseId) : null;
      const client = await storage.getClient(negotiation.clientId);
      const rounds = await storage.getNegotiationRounds(id);
      
      const { generateAIAnalysis } = await import("./services/negotiationAI");
      const analysis = await generateAIAnalysis(negotiation, caseData, client, rounds);
      
      await storage.updateNegotiation(id, { aiAnalysis: analysis.analysis, aiRiskScore: analysis.riskScore });
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing negotiation:", error);
      res.status(500).json({ error: "Failed to analyze negotiation" });
    }
  });

  // AI: Generate proposal text
  app.post("/api/negotiations/:id/ai-proposal", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const negotiation = await storage.getNegotiation(id);
      if (!negotiation) return res.status(404).json({ error: "Not found" });
      
      const caseData = negotiation.caseId ? await storage.getCase(negotiation.caseId) : null;
      const client = await storage.getClient(negotiation.clientId);
      const contacts = await storage.getNegotiationContacts(id);
      const rounds = await storage.getNegotiationRounds(id);
      
      const { generateProposal } = await import("./services/negotiationAI");
      const proposal = await generateProposal(negotiation, caseData, client, contacts, rounds, req.body);
      res.json(proposal);
    } catch (error) {
      console.error("Error generating proposal:", error);
      res.status(500).json({ error: "Failed to generate proposal" });
    }
  });

  // Send proposal via email
  app.post("/api/negotiations/rounds/:roundId/send-email", async (req, res) => {
    try {
      const roundId = parseInt(req.params.roundId);
      const { to, subject, html } = req.body;
      
      const { emailService } = await import("./services/email");
      const result = await emailService.sendEmail({ to, subject, html });
      
      if (result.success) {
        await storage.updateNegotiationRound(roundId, { sentViaEmail: true, sentAt: new Date() });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error sending proposal email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Send negotiation message via WhatsApp
  app.post("/api/negotiations/:id/send-whatsapp", async (req, res) => {
    try {
      const negotiationId = parseInt(req.params.id);
      const { contactId, message } = req.body;
      
      const contacts = await storage.getNegotiationContacts(negotiationId);
      const contact = contacts.find(c => c.id === contactId);
      
      if (!contact) {
        return res.status(404).json({ error: "Contato não encontrado" });
      }
      
      const phone = contact.whatsapp || contact.phone;
      if (!phone) {
        return res.status(400).json({ error: "Devedor não possui número de telefone cadastrado" });
      }
      
      const tenantId = getTenantId(req);
      const { whatsappService } = await import("./services/whatsapp");
      const success = await whatsappService.sendMessage(phone, message, tenantId, false);
      
      if (success) {
        const userId = (req.session as any)?.userId;
        await storage.createNegotiationRound({
          negotiationId,
          contactId,
          type: "proposta_whatsapp",
          message,
          sentViaWhatsapp: true,
          sentAt: new Date(),
          createdBy: userId,
        });
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Falha ao enviar mensagem WhatsApp" });
      }
    } catch (error) {
      console.error("Error sending WhatsApp negotiation:", error);
      res.status(500).json({ error: "Failed to send WhatsApp message" });
    }
  });

  // AI: Generate WhatsApp negotiation message
  app.post("/api/negotiations/:id/ai-whatsapp-message", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const negotiation = await storage.getNegotiation(id);
      if (!negotiation) return res.status(404).json({ error: "Not found" });
      
      const caseData = negotiation.caseId ? await storage.getCase(negotiation.caseId) : null;
      const client = await storage.getClient(negotiation.clientId);
      const contacts = await storage.getNegotiationContacts(id);
      const rounds = await storage.getNegotiationRounds(id);
      const { contactId } = req.body;
      const contact = contacts.find(c => c.id === contactId);
      
      const { generateWhatsAppMessage } = await import("./services/negotiationAI");
      const message = await generateWhatsAppMessage(negotiation, caseData, client, contact, rounds, req.body);
      res.json({ message });
    } catch (error) {
      console.error("Error generating WhatsApp message:", error);
      res.status(500).json({ error: "Failed to generate message" });
    }
  });

  app.post("/api/negotiations/:id/generate-agreement", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const negotiation = await storage.getNegotiation(id);
      if (!negotiation) return res.status(404).json({ error: "Not found" });

      const caseData = negotiation.caseId ? await storage.getCase(negotiation.caseId) : null;
      const client = await storage.getClient(negotiation.clientId);
      const contacts = await storage.getNegotiationContacts(id);
      const rounds = await storage.getNegotiationRounds(id);

      const { generateAgreement } = await import("./services/negotiationAI");
      const { value, conditions, installments } = req.body;
      const agreement = await generateAgreement(
        negotiation, caseData, client, contacts, rounds,
        { value: value || negotiation.currentProposalValue || "0", conditions, installments }
      );

      const fs = await import("fs");
      const path = await import("path");
      const agreementsDir = path.join(".", "agreements");
      if (!fs.existsSync(agreementsDir)) fs.mkdirSync(agreementsDir, { recursive: true });

      const tenantId = (req as any).session?.tenantId || 1;

      if (agreement.wordBuffer) {
        const wordFilename = agreement.filename.replace(".html", ".docx");
        const wordPath = path.join(agreementsDir, wordFilename);
        fs.writeFileSync(wordPath, agreement.wordBuffer);
        const fileSize = agreement.wordBuffer.length;
        const crypto = await import("crypto");
        const fileHash = crypto.createHash("md5").update(agreement.wordBuffer).digest("hex");
        await storage.createDocument({
          tenantId, clientId: negotiation.clientId, caseId: negotiation.caseId || null,
          title: `Termo de Acordo - ${contacts[0]?.name || "Parte Adversa"}`, type: "acordo",
          filePath: wordPath, fileHash, fileSize,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", aiGenerated: true,
        });
      } else {
        const filePath = path.join(agreementsDir, agreement.filename);
        fs.writeFileSync(filePath, agreement.html, "utf-8");
        const fileSize = Buffer.byteLength(agreement.html, "utf-8");
        const crypto = await import("crypto");
        const fileHash = crypto.createHash("md5").update(agreement.html).digest("hex");
        await storage.createDocument({
          tenantId, clientId: negotiation.clientId, caseId: negotiation.caseId || null,
          title: `Termo de Acordo - ${contacts[0]?.name || "Parte Adversa"}`, type: "acordo",
          filePath, fileHash, fileSize, mimeType: "text/html", aiGenerated: true,
        });
      }

      try {
        await storage.createGeneratedPiece({
          tenantId,
          title: `Termo de Acordo - ${contacts[0]?.name || "Parte Adversa"} - R$ ${value || negotiation.currentProposalValue || "0"}`,
          pieceType: "termo_acordo",
          contentHtml: agreement.html,
          contentText: agreement.plainText,
          caseId: negotiation.caseId || null,
        });
      } catch (pieceErr) {
        console.error("Error saving agreement as Studio piece:", pieceErr);
      }

      res.json({ html: agreement.html, filename: agreement.filename, plainText: agreement.plainText });
    } catch (error) {
      console.error("Error generating agreement:", error);
      res.status(500).json({ error: "Failed to generate agreement" });
    }
  });

  app.post("/api/negotiations/:id/send-agreement", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = (req as any).session?.tenantId || 1;
      const negotiation = await storage.getNegotiation(id);
      if (!negotiation) return res.status(404).json({ error: "Not found" });

      const contacts = await storage.getNegotiationContacts(id);
      const client = await storage.getClient(negotiation.clientId, tenantId);
      const caseData = negotiation.caseId ? await storage.getCase(negotiation.caseId, tenantId) : null;
      const { sendWhatsapp, sendEmail: doSendEmail, contactId } = req.body;
      const contact = contacts.find(c => c.id === contactId) || contacts[0];

      const fs = await import("fs");
      const path = await import("path");
      const agreementsDir = path.join(".", "agreements");
      const negIdPattern = `_${id}_`;
      const existingFiles = fs.existsSync(agreementsDir)
        ? fs.readdirSync(agreementsDir).filter(f => f.startsWith("Termo_Acordo") && f.includes(negIdPattern)).sort().reverse()
        : [];
      let html = "";
      let filename = "";
      let wordBuffer: Buffer | null = null;
      const docxFile = existingFiles.find(f => f.endsWith(".docx"));
      const htmlFile = existingFiles.find(f => f.endsWith(".html"));
      if (docxFile) {
        filename = docxFile;
        wordBuffer = fs.readFileSync(path.join(agreementsDir, docxFile));
        if (htmlFile) html = fs.readFileSync(path.join(agreementsDir, htmlFile), "utf-8");
      } else if (htmlFile) {
        filename = htmlFile;
        html = fs.readFileSync(path.join(agreementsDir, htmlFile), "utf-8");
      } else {
        const { generateAgreement } = await import("./services/negotiationAI");
        const rounds = await storage.getNegotiationRounds(id);
        const agreement = await generateAgreement(negotiation, caseData, client, contacts, rounds, { value: negotiation.currentProposalValue || "0" });
        html = agreement.html;
        wordBuffer = agreement.wordBuffer || null;
        if (wordBuffer) {
          filename = agreement.filename.replace(".html", ".docx");
        } else {
          filename = agreement.filename;
        }
        if (!fs.existsSync(agreementsDir)) fs.mkdirSync(agreementsDir, { recursive: true });
        if (wordBuffer) {
          fs.writeFileSync(path.join(agreementsDir, filename), wordBuffer);
        }
        fs.writeFileSync(path.join(agreementsDir, agreement.filename), html, "utf-8");
      }

      const results: { whatsapp?: boolean; email?: boolean } = {};

      if (sendWhatsapp && contact) {
        const whatsappPhone = contact.whatsapp || contact.phone;
        if (whatsappPhone) {
          const { whatsappService } = await import("./services/whatsapp");
          const tenantId = (req as any).session?.tenantId || 1;
          if (wordBuffer) {
            results.whatsapp = await whatsappService.sendDocument(
              whatsappPhone, wordBuffer, filename,
              `Termo de Composição Extrajudicial - ${client?.name || "Acordo"}`, tenantId, true
            );
          } else {
            const msg = `*Escritório Marques e Serra*\n\n` +
              `Prezado(a) ${contact.name},\n\n` +
              `Segue o *Termo de Composição Extrajudicial* conforme negociado.\n\n` +
              `O documento completo foi enviado ao seu e-mail para análise e assinatura.\n\n` +
              `Após assinar, pedimos que envie o documento por este WhatsApp ou por e-mail.\n\n` +
              `_Dr. Ronald Serra - OAB/DF 23.947_`;
            results.whatsapp = await whatsappService.sendMessage(whatsappPhone, msg, tenantId, true);
          }
        }
      }

      if (doSendEmail && contact?.email) {
        try {
          const { emailService } = await import("./services/email");
          const attachmentContent = wordBuffer || html;
          const attachmentFilename = wordBuffer ? filename : (filename || "Termo_de_Acordo.html");
          const attachmentContentType = wordBuffer
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/html";
          await emailService.sendEmail({
            to: contact.email,
            subject: `Termo de Composição Extrajudicial - ${client?.name || "Acordo"}${caseData?.caseNumber ? ` - Processo ${caseData.caseNumber}` : ""}`,
            html: `<p>Prezado(a) ${contact.name},</p>
              <p>Segue em anexo o <strong>Termo de Composição Extrajudicial</strong> para sua análise e assinatura.</p>
              <p>Solicitamos que, após assinar, nos envie uma cópia digitalizada por e-mail ou WhatsApp.</p>
              <p>Permanecemos à disposição.</p>
              <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd;">
              <p style="margin: 0;"><strong>Dr. Ronald Serra</strong> - OAB/DF 23.947</p>
              <p style="margin: 2px 0; font-size: 13px;">Marques &amp; Serra Sociedade de Advogados</p>
              <p style="margin: 2px 0; font-size: 12px; color: #666;">&#128222; +55 (61) 99811-2434 | &#9993; contato@marqueseserra.adv.br</p>
              <p style="margin: 2px 0; font-size: 12px; color: #666;">&#128205; SAUS Quadra 1 BL. M Sala 1301 - Edif&iacute;cio Libertas - Bras&iacute;lia-DF</p>
              </div>`,
            attachments: [{
              filename: attachmentFilename,
              content: attachmentContent,
              contentType: attachmentContentType,
            }],
          });
          results.email = true;
        } catch (emailErr) {
          console.error("Error sending agreement email:", emailErr);
          results.email = false;
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error("Error sending agreement:", error);
      res.status(500).json({ error: "Failed to send agreement" });
    }
  });

  // ==================== PROSPECTION PLANS ====================
  app.get("/api/prospection/plans", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    const plans = await storage.getProspectionPlansByTenant(tenantId);
    res.json(plans);
  });

  app.get("/api/prospection/plans/:id", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    const plan = await storage.getProspectionPlan(parseInt(req.params.id), tenantId);
    if (!plan) return res.status(404).json({ error: "Plano não encontrado" });
    res.json(plan);
  });

  app.post("/api/prospection/plans", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const data = insertProspectionPlanSchema.parse({ ...req.body, tenantId, createdBy: userId });
      const plan = await storage.createProspectionPlan(data);
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/prospection/plans/:id", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const plan = await storage.updateProspectionPlan(parseInt(req.params.id), req.body, tenantId);
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/prospection/plans/:id", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    await storage.deleteProspectionPlan(parseInt(req.params.id), tenantId);
    res.json({ success: true });
  });

  // ==================== PROSPECTION LEADS ====================
  app.get("/api/prospection/leads", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    const planId = req.query.planId ? parseInt(req.query.planId as string) : undefined;
    if (planId) {
      const leads = await storage.getProspectionLeadsByPlan(planId);
      res.json(leads);
    } else {
      const leads = await storage.getProspectionLeadsByTenant(tenantId);
      res.json(leads);
    }
  });

  app.get("/api/prospection/leads/:id", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    const lead = await storage.getProspectionLead(parseInt(req.params.id), tenantId);
    if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
    res.json(lead);
  });

  app.post("/api/prospection/leads", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const data = insertProspectionLeadSchema.parse({ ...req.body, tenantId });
      const lead = await storage.createProspectionLead(data);
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/prospection/leads/:id", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const lead = await storage.updateProspectionLead(parseInt(req.params.id), req.body, tenantId);
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/prospection/leads/:id", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    await storage.deleteProspectionLead(parseInt(req.params.id), tenantId);
    res.json({ success: true });
  });

  // ==================== PROSPECTION MESSAGES ====================
  app.get("/api/prospection/messages/:leadId", requireAuth, async (req, res) => {
    const messages = await storage.getProspectionMessagesByLead(parseInt(req.params.leadId));
    res.json(messages);
  });

  app.post("/api/prospection/messages", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const data = insertProspectionMessageSchema.parse({ ...req.body, tenantId, createdBy: userId });
      const message = await storage.createProspectionMessage(data);
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/prospection/messages/:id", requireAuth, async (req, res) => {
    try {
      const message = await storage.updateProspectionMessage(parseInt(req.params.id), req.body);
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PROSPECTION NETWORK ====================
  app.get("/api/prospection/network", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    const platform = req.query.platform as string | undefined;
    const contacts = await storage.getNetworkContactsByTenant(tenantId, platform);
    res.json(contacts);
  });

  app.get("/api/prospection/network/:id", requireAuth, async (req, res) => {
    const tenantId = getTenantId(req);
    const contact = await storage.getNetworkContact(parseInt(req.params.id), tenantId);
    if (!contact) return res.status(404).json({ error: "Contato não encontrado" });
    res.json(contact);
  });

  app.post("/api/prospection/network", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const data = insertProspectionNetworkSchema.parse({ ...req.body, tenantId, createdBy: userId });
      const contact = await storage.createNetworkContact(data);
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/prospection/network/:id", requireAuth, async (req, res) => {
    try {
      const contact = await storage.updateNetworkContact(parseInt(req.params.id), req.body);
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/prospection/network/:id", requireAuth, async (req, res) => {
    await storage.deleteNetworkContact(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ==================== PROSPECTION AI ====================
  app.post("/api/prospection/plans/:id/generate", requireAuth, async (req, res) => {
    try {
      const { prospectingService } = await import("./services/prospecting");
      const tenantId = getTenantId(req);
      const plan = await storage.getProspectionPlan(parseInt(req.params.id), tenantId);
      if (!plan) return res.status(404).json({ error: "Plano não encontrado" });
      const networkContacts = await storage.getNetworkContactsByTenant(tenantId);
      const result = await prospectingService.generatePlan(plan, networkContacts);
      console.log(`[Prospecting Route] Plan generated. Companies: ${result.companies?.length || 0}`);

      if (result.companies && Array.isArray(result.companies) && result.companies.length > 0) {
        console.log(`[Prospecting Route] Creating ${result.companies.length} leads...`);
        const newLeads: any[] = [];
        for (const company of result.companies) {
          try {
            const networkConnId = company.networkConnectionId ? parseInt(company.networkConnectionId) || null : null;
            const saved = await storage.createProspectionLead({
              tenantId,
              planId: plan.id,
              companyName: company.name || company.companyName || "Empresa",
              companySector: company.sector || plan.sector || null,
              companySize: company.size || null,
              companyLocation: company.location || plan.region || null,
              companyWebsite: company.website || null,
              companyPhone: company.phone || null,
              companyEmail: company.email || null,
              decisionMakers: company.decisionMakers ? {
                contacts: company.decisionMakers,
                connectionPaths: company.connectionPaths || []
              } : null,
              priority: typeof company.priority === 'number' ? company.priority : 3,
              pipelineStatus: "identificado",
              aiStrategy: company.strategy || null,
              aiMessages: company.messages || null,
              networkConnectionId: networkConnId,
              networkPath: company.networkPath || null,
              companyProfile: company.companyProfile || null,
              compatibilityScore: typeof company.compatibilityScore === 'number' ? company.compatibilityScore : null,
              painPoints: company.painPoints || null,
              competitors: company.competitors || null,
              partnerFirms: company.partnerFirms || null,
              competitorStrategy: company.competitorStrategy || null,
              partnerProposal: company.partnerProposal || null,
            });
            newLeads.push(saved);
          } catch (leadErr: any) {
            console.error(`[Prospecting Route] Failed to save lead "${company.name || company.companyName}":`, leadErr.message);
          }
        }
        console.log(`[Prospecting Route] Saved ${newLeads.length}/${result.companies.length} leads`);

        if (newLeads.length > 0) {
          const existingLeads = await storage.getProspectionLeadsByPlan(plan.id);
          const newLeadIds = new Set(newLeads.map(l => l.id));
          for (const lead of existingLeads) {
            if (!newLeadIds.has(lead.id)) {
              await storage.deleteProspectionLead(lead.id, tenantId);
            }
          }
        }

        const updated = await storage.updateProspectionPlan(plan.id, {
          aiPlan: result.plan,
          aiCompanies: result.companies,
          totalLeads: newLeads.length,
          status: "ativo",
        }, tenantId);
        res.json(updated);
      } else {
        console.error(`[Prospecting Route] AI returned 0 companies, preserving existing leads`);
        const updated = await storage.updateProspectionPlan(plan.id, {
          aiPlan: result.plan,
          status: "ativo",
        }, tenantId);
        res.status(200).json({ ...updated, warning: "A IA não retornou empresas nesta geração. Tente gerar novamente." });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/prospection/leads/:id/generate-messages", requireAuth, async (req, res) => {
    try {
      const { prospectingService } = await import("./services/prospecting");
      const tenantId = getTenantId(req);
      const lead = await storage.getProspectionLead(parseInt(req.params.id), tenantId);
      if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
      const plan = await storage.getProspectionPlan(lead.planId, tenantId);
      if (!plan) return res.status(404).json({ error: "Plano não encontrado" });
      const networkContacts = await storage.getNetworkContactsByTenant(tenantId);
      const messages = await prospectingService.generateOutreachMessages(lead, plan, networkContacts);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // CSV Import for network contacts
  app.post("/api/prospection/network/import", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const csvContent = req.file.buffer.toString("utf-8");
      const lines = csvContent.split("\n").filter(l => l.trim());
      if (lines.length < 2) return res.status(400).json({ error: "Arquivo vazio ou sem dados" });
      
      const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
      const imported: any[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        
        const contact = await storage.createNetworkContact({
          tenantId,
          platform: (req.body?.platform as string) || "linkedin",
          name: row.nome || row.name || row.contato || '',
          company: row.empresa || row.company || '',
          position: row.cargo || row.position || '',
          phone: row.telefone || row.phone || row.cel || '',
          email: row.email || row['e-mail'] || '',
          linkedin: row.linkedin || '',
          instagram: row.instagram || '',
          relationship: row.relacionamento || row.relationship || row['como conhece'] || '',
          notes: row.notas || row.observacao || row.notes || '',
          tags: row.tags || row.categoria || '',
          createdBy: userId,
        });
        imported.push(contact);
      }
      
      res.json({ imported: imported.length, contacts: imported });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Multi-format file import for network contacts
  app.post("/api/prospection/network/import-file", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const buffer = req.file.buffer;
      const fileName = req.file.originalname.toLowerCase();
      let contacts: Array<{ name: string; company?: string; position?: string; phone?: string; email?: string; notes?: string }> = [];

      if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
        const content = buffer.toString("utf-8");
        const lines = content.split("\n").filter(l => l.trim());
        if (lines.length >= 2) {
          const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(/[,;\t]/).map(v => v.trim().replace(/^["']|["']$/g, ''));
            const row: any = {};
            headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
            const name = row.nome || row.name || row.contato || values[0] || '';
            if (name) contacts.push({
              name, company: row.empresa || row.company || '', position: row.cargo || row.position || '',
              phone: row.telefone || row.phone || row.cel || '', email: row.email || row['e-mail'] || '',
              notes: row.notas || row.observacao || row.notes || '',
            });
          }
        } else if (lines.length === 1) {
          lines[0].split(/[,;]/).forEach(n => { if (n.trim()) contacts.push({ name: n.trim() }); });
        }
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        for (const row of rows) {
          const keys = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase()] = row[k]; return acc; }, {} as any);
          const name = keys.nome || keys.name || keys.contato || Object.values(row)[0] || '';
          if (name) contacts.push({
            name: String(name), company: String(keys.empresa || keys.company || ''),
            position: String(keys.cargo || keys.position || ''), phone: String(keys.telefone || keys.phone || keys.cel || ''),
            email: String(keys.email || keys['e-mail'] || ''), notes: String(keys.notas || keys.observacao || ''),
          });
        }
      } else if (fileName.endsWith(".pdf") || fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
        let extractedText = "";
        if (fileName.endsWith(".pdf")) {
          try {
            const { PDFParse } = await import("pdf-parse");
            const parser = new (PDFParse as any)({ data: buffer });
            const result = await parser.getText();
            extractedText = (typeof result === "string" ? result : result?.text || "") as string;
            try { await parser.destroy(); } catch {}
          } catch (pdfErr: any) {
            console.error("[Network Import] PDF parse error:", pdfErr.message);
            extractedText = "";
          }
        } else {
          const mammoth = await import("mammoth");
          const result = await mammoth.default.extractRawText({ buffer });
          extractedText = result.value;
        }
        console.log(`[Network Import] Extracted ${extractedText.length} chars from ${fileName}`);
        if (extractedText.trim()) {
          const aiRes = await aiService.chat([{
            role: "system",
            content: `Você é um assistente que extrai contatos de documentos. O texto abaixo pode ser uma exportação do LinkedIn, lista de contatos, ou documento com nomes de pessoas.

REGRAS IMPORTANTES:
1. Identifique TODAS as pessoas mencionadas no texto
2. Se o texto tem padrão de "Nome" seguido de "Cargo/Descrição" na linha seguinte, combine-os como um único contato
3. Separe claramente o nome da pessoa do seu cargo/empresa
4. NÃO crie contatos com descrições de cargo como nome
5. Se um nome parece ser um cargo ou descrição (ex: "Procurador Federal", "Advogado"), NÃO o inclua como contato separado

Retorne APENAS um JSON array válido com objetos: {"name": "Nome Completo", "position": "Cargo", "company": "Empresa/Órgão", "phone": "", "email": ""}

Exemplo de entrada:
João Silva
Diretor Jurídico na Empresa X
Maria Santos
Procuradora Federal da AGU

Exemplo de saída:
[{"name": "João Silva", "position": "Diretor Jurídico", "company": "Empresa X", "phone": "", "email": ""},
{"name": "Maria Santos", "position": "Procuradora Federal", "company": "AGU", "phone": "", "email": ""}]`
          }, { role: "user", content: extractedText.substring(0, 12000) }]);
          console.log(`[Network Import] AI response length: ${aiRes.content.length}`);
          try {
            const jsonMatch = aiRes.content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              contacts = JSON.parse(jsonMatch[0]);
              console.log(`[Network Import] AI extracted ${contacts.length} contacts`);
            }
          } catch (parseErr: any) {
            console.error("[Network Import] JSON parse error:", parseErr.message);
          }
        }
      }

      const platform = (req.body?.platform as string) || "linkedin";
      const imported: any[] = [];
      for (const c of contacts) {
        if (!c.name || !c.name.trim()) continue;
        try {
          const contact = await storage.createNetworkContact({
            tenantId, platform, name: c.name.trim(), company: c.company || '', position: c.position || '',
            phone: c.phone || '', email: c.email || '', linkedin: '', instagram: '',
            relationship: '', notes: c.notes || '', tags: '', createdBy: userId,
          });
          imported.push(contact);
        } catch {}
      }
      res.json({ imported: imported.length, total: contacts.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Batch name import for network contacts (with AI processing)
  app.post("/api/prospection/network/batch-names", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { names, platform } = req.body;
      const contactPlatform = platform || "linkedin";
      if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: "Nenhum nome fornecido" });

      const rawText = names.join("\n");
      let contacts: Array<{ name: string; company?: string; position?: string; phone?: string; email?: string }> = [];

      try {
        const aiRes = await aiService.chat([{
          role: "system",
          content: `Você é um assistente que extrai contatos de texto. O texto abaixo contém nomes de pessoas, possivelmente com cargos e empresas.

REGRAS:
1. Identifique SOMENTE nomes de PESSOAS (não cargos, não descrições)
2. Se uma linha contém um nome e a próxima contém cargo/descrição, combine-os como um único contato
3. Separe nome, cargo e empresa/órgão corretamente
4. Se a linha contém "Nome, Empresa, Cargo" separados por vírgula, parse diretamente
5. Linhas que são APENAS cargos/descrições sem nome associado devem ser IGNORADAS
6. Se não conseguir determinar se é nome ou cargo, ignore a linha

Retorne APENAS um JSON array: [{"name": "Nome", "position": "Cargo", "company": "Empresa", "phone": "", "email": ""}]`
        }, { role: "user", content: rawText.substring(0, 12000) }]);

        const jsonMatch = aiRes.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) contacts = JSON.parse(jsonMatch[0]);
        console.log(`[Batch Import] AI extracted ${contacts.length} contacts from ${names.length} lines`);
      } catch (aiErr: any) {
        console.error("[Batch Import] AI error, falling back to simple parse:", aiErr.message);
        for (const line of names) {
          const parts = line.split(",").map((p: string) => p.trim());
          if (parts[0]) contacts.push({ name: parts[0], company: parts[1] || '', position: parts[2] || '', phone: parts[3] || '', email: parts[4] || '' });
        }
      }

      const imported: any[] = [];
      for (const c of contacts) {
        if (!c.name || !c.name.trim()) continue;
        try {
          const contact = await storage.createNetworkContact({
            tenantId, platform: contactPlatform, name: c.name.trim(), company: c.company || '', position: c.position || '',
            phone: c.phone || '', email: c.email || '', linkedin: '', instagram: '',
            relationship: '', notes: '', tags: '', createdBy: userId,
          });
          imported.push(contact);
        } catch {}
      }
      res.json({ imported: imported.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PROSPECTION OUTREACH ====================
  app.post("/api/prospection/outreach/whatsapp", requireAuth, async (req, res) => {
    try {
      const { whatsappService } = await import("./services/whatsapp");
      const { phone, message, leadId } = req.body;
      if (!phone || !message) return res.status(400).json({ error: "Telefone e mensagem são obrigatórios" });
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      if (leadId) {
        const lead = await storage.getProspectionLead(leadId, tenantId);
        if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
      }
      const cleaned = phone.replace(/\D/g, "");
      const success = await whatsappService.sendMessage(cleaned, message, tenantId, true);
      if (success && leadId) {
        await storage.createProspectionMessage({
          tenantId, leadId, channel: "whatsapp", recipientContact: phone,
          content: message, status: "enviado", sentAt: new Date(), createdBy: userId,
        });
      }
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/prospection/outreach/email", requireAuth, async (req, res) => {
    try {
      const { to, subject, body, leadId } = req.body;
      if (!to || !subject || !body) return res.status(400).json({ error: "Destinatário, assunto e corpo são obrigatórios" });
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      if (leadId) {
        const lead = await storage.getProspectionLead(leadId, tenantId);
        if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
      }
      const result = await zohoMailService.sendEmail({ to, subject, htmlBody: body });
      if (result.success && leadId) {
        await storage.createProspectionMessage({
          tenantId, leadId, channel: "email", recipientContact: to,
          content: `${subject}\n\n${body}`, status: "enviado", sentAt: new Date(), createdBy: userId,
        });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PROSPECTION CHAT ====================
  app.get("/api/prospection/chat/:planId", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const planId = parseInt(req.params.planId);
      const messages = await storage.getProspectionChatMessages(planId, tenantId);
      res.json(messages);
    } catch (error: any) {
      console.error("[ProspectionChat] Error:", error.message);
      res.status(500).json({ error: "Erro ao carregar mensagens" });
    }
  });

  app.post("/api/prospection/chat/:planId", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const planId = parseInt(req.params.planId);
      const { message } = req.body;
      
      if (!message) return res.status(400).json({ error: "Mensagem é obrigatória" });
      
      const plan = await storage.getProspectionPlan(planId, tenantId);
      if (!plan) return res.status(404).json({ error: "Plano não encontrado" });
      
      await storage.createProspectionChatMessage({
        tenantId, planId, role: "user", content: message, createdBy: userId,
      });
      
      const leads = await storage.getProspectionLeadsByPlan(planId);
      const network = await storage.getNetworkContactsByTenant(tenantId);
      const chatHistory = await storage.getProspectionChatMessages(planId, tenantId);
      
      const { prospectingService } = await import("./services/prospecting");
      const result = await prospectingService.chat(message, plan, leads, network, chatHistory);
      
      const aiMsg = await storage.createProspectionChatMessage({
        tenantId, planId, role: "assistant", content: result.response, createdBy: userId,
      });
      
      res.json({ response: result.response, messageId: aiMsg.id });
    } catch (error: any) {
      console.error("[ProspectionChat] Error:", error.message);
      res.status(500).json({ error: "Erro ao processar mensagem" });
    }
  });

  app.post("/api/prospection/chat", requireAuth, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { message } = req.body;
      
      if (!message) return res.status(400).json({ error: "Mensagem é obrigatória" });
      
      const network = await storage.getNetworkContactsByTenant(tenantId);
      const allLeads = await storage.getProspectionLeadsByTenant(tenantId);
      
      const { prospectingService } = await import("./services/prospecting");
      const result = await prospectingService.chat(message, null, allLeads, network, []);
      
      res.json({ response: result.response });
    } catch (error: any) {
      console.error("[ProspectionChat] Error:", error.message);
      res.status(500).json({ error: "Erro ao processar mensagem" });
    }
  });

  app.get("/api/admin/export-data", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const allClients = await db.select().from(require("@shared/schema").clients).where(eq(require("@shared/schema").clients.tenantId, tenantId));
      const allCases = await db.select().from(cases).where(eq(cases.tenantId, tenantId));
      const caseIds = allCases.map(c => c.id);
      let allMovements: any[] = [];
      if (caseIds.length > 0) {
        allMovements = await db.select().from(caseMovements).where(inArray(caseMovements.caseId, caseIds));
      }
      const { contracts, documents, debtors, negotiations, negotiationContacts, negotiationRounds, invoices } = require("@shared/schema");
      const allContracts = await db.select().from(contracts).where(eq(contracts.tenantId, tenantId));
      const allDocuments = await db.select().from(documents).where(eq(documents.tenantId, tenantId));
      let allDebtors: any[] = [];
      const clientIds = allClients.map((c: any) => c.id);
      if (clientIds.length > 0) {
        allDebtors = await db.select().from(debtors).where(inArray(debtors.clientId, clientIds));
      }
      const allNegotiations = await db.select().from(negotiations).where(eq(negotiations.tenantId, tenantId));
      let allNegContacts: any[] = [];
      let allNegRounds: any[] = [];
      const negIds = allNegotiations.map((n: any) => n.id);
      if (negIds.length > 0) {
        allNegContacts = await db.select().from(negotiationContacts).where(inArray(negotiationContacts.negotiationId, negIds));
        allNegRounds = await db.select().from(negotiationRounds).where(inArray(negotiationRounds.negotiationId, negIds));
      }
      const allInvoices = await db.select().from(invoices).where(eq(invoices.tenantId, tenantId));

      res.json({
        exportedAt: new Date().toISOString(),
        tenantId,
        clients: allClients,
        cases: allCases,
        caseMovements: allMovements,
        contracts: allContracts,
        documents: allDocuments,
        debtors: allDebtors,
        negotiations: allNegotiations,
        negotiationContacts: allNegContacts,
        negotiationRounds: allNegRounds,
        invoices: allInvoices,
      });
    } catch (error: any) {
      console.error("[Export] Error:", error.message);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  app.post("/api/admin/import-data", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const data = req.body;
      if (!data || !data.clients) {
        return res.status(400).json({ error: "No data provided" });
      }

      const { clients: clientsTable, contracts, documents, debtors, negotiations, negotiationContacts, negotiationRounds, invoices } = require("@shared/schema");
      const { sql } = require("drizzle-orm");

      const clientIdMap = new Map<number, number>();
      const caseIdMap = new Map<number, number>();
      const contractIdMap = new Map<number, number>();
      const negIdMap = new Map<number, number>();

      let stats = { clients: 0, cases: 0, movements: 0, contracts: 0, documents: 0, debtors: 0, negotiations: 0, invoices: 0 };

      for (const client of (data.clients || [])) {
        const oldId = client.id;
        const { id, createdAt, ...clientData } = client;
        try {
          const [inserted] = await db.insert(clientsTable).values({
            ...clientData,
            tenantId,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          }).returning();
          clientIdMap.set(oldId, inserted.id);
          stats.clients++;
        } catch (e: any) {
          if (e.message?.includes("duplicate")) {
            const existing = await db.select().from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.name, client.name))).limit(1);
            if (existing.length > 0) clientIdMap.set(oldId, existing[0].id);
          } else {
            console.error(`[Import] Client error:`, e.message);
          }
        }
      }

      for (const contract of (data.contracts || [])) {
        const oldId = contract.id;
        const { id, createdAt, ...contractData } = contract;
        try {
          const [inserted] = await db.insert(contracts).values({
            ...contractData,
            tenantId,
            clientId: clientIdMap.get(contract.clientId) || contract.clientId,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          }).returning();
          contractIdMap.set(oldId, inserted.id);
          stats.contracts++;
        } catch (e: any) {
          console.error(`[Import] Contract error:`, e.message);
        }
      }

      for (const cs of (data.cases || [])) {
        const oldId = cs.id;
        const { id, createdAt, ...caseData } = cs;
        try {
          const [inserted] = await db.insert(cases).values({
            ...caseData,
            tenantId,
            clientId: cs.clientId ? (clientIdMap.get(cs.clientId) || cs.clientId) : null,
            contractId: cs.contractId ? (contractIdMap.get(cs.contractId) || cs.contractId) : null,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          }).returning();
          caseIdMap.set(oldId, inserted.id);
          stats.cases++;
        } catch (e: any) {
          if (!e.message?.includes("duplicate")) {
            console.error(`[Import] Case error:`, e.message);
          }
        }
      }

      const movBatchSize = 100;
      const movements = data.caseMovements || [];
      for (let i = 0; i < movements.length; i += movBatchSize) {
        const batch = movements.slice(i, i + movBatchSize);
        for (const mov of batch) {
          const { id, createdAt, ...movData } = mov;
          const newCaseId = caseIdMap.get(mov.caseId);
          if (!newCaseId) continue;
          try {
            await db.insert(caseMovements).values({
              ...movData,
              caseId: newCaseId,
              createdAt: createdAt ? new Date(createdAt) : new Date(),
              date: mov.date ? new Date(mov.date) : null,
              readAt: mov.readAt ? new Date(mov.readAt) : null,
              aiAnalyzedAt: mov.aiAnalyzedAt ? new Date(mov.aiAnalyzedAt) : null,
              acknowledgedAt: mov.acknowledgedAt ? new Date(mov.acknowledgedAt) : null,
            });
            stats.movements++;
          } catch (e: any) {
            if (!e.message?.includes("duplicate")) {
              console.error(`[Import] Movement error:`, e.message);
            }
          }
        }
      }

      for (const doc of (data.documents || [])) {
        const { id, createdAt, ...docData } = doc;
        try {
          await db.insert(documents).values({
            ...docData,
            tenantId,
            caseId: doc.caseId ? (caseIdMap.get(doc.caseId) || doc.caseId) : null,
            clientId: doc.clientId ? (clientIdMap.get(doc.clientId) || doc.clientId) : null,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          });
          stats.documents++;
        } catch (e: any) {
          console.error(`[Import] Document error:`, e.message);
        }
      }

      for (const debtor of (data.debtors || [])) {
        const { id, createdAt, ...debtorData } = debtor;
        try {
          await db.insert(debtors).values({
            ...debtorData,
            clientId: clientIdMap.get(debtor.clientId) || debtor.clientId,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          });
          stats.debtors++;
        } catch (e: any) {
          console.error(`[Import] Debtor error:`, e.message);
        }
      }

      for (const neg of (data.negotiations || [])) {
        const oldId = neg.id;
        const { id, createdAt, ...negData } = neg;
        try {
          const [inserted] = await db.insert(negotiations).values({
            ...negData,
            tenantId,
            clientId: neg.clientId ? (clientIdMap.get(neg.clientId) || neg.clientId) : null,
            debtorId: neg.debtorId || null,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          }).returning();
          negIdMap.set(oldId, inserted.id);
          stats.negotiations++;
        } catch (e: any) {
          console.error(`[Import] Negotiation error:`, e.message);
        }
      }

      for (const contact of (data.negotiationContacts || [])) {
        const { id, ...contactData } = contact;
        const newNegId = negIdMap.get(contact.negotiationId);
        if (!newNegId) continue;
        try {
          await db.insert(negotiationContacts).values({
            ...contactData,
            negotiationId: newNegId,
          });
        } catch (e: any) {
          console.error(`[Import] NegContact error:`, e.message);
        }
      }

      for (const round of (data.negotiationRounds || [])) {
        const { id, createdAt, ...roundData } = round;
        const newNegId = negIdMap.get(round.negotiationId);
        if (!newNegId) continue;
        try {
          await db.insert(negotiationRounds).values({
            ...roundData,
            negotiationId: newNegId,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          });
        } catch (e: any) {
          console.error(`[Import] NegRound error:`, e.message);
        }
      }

      for (const inv of (data.invoices || [])) {
        const { id, createdAt, ...invData } = inv;
        try {
          await db.insert(invoices).values({
            ...invData,
            tenantId,
            clientId: inv.clientId ? (clientIdMap.get(inv.clientId) || inv.clientId) : null,
            contractId: inv.contractId ? (contractIdMap.get(inv.contractId) || inv.contractId) : null,
            createdAt: createdAt ? new Date(createdAt) : new Date(),
          });
          stats.invoices++;
        } catch (e: any) {
          console.error(`[Import] Invoice error:`, e.message);
        }
      }

      res.json({
        success: true,
        stats,
        idMappings: {
          clients: Object.fromEntries(clientIdMap),
          cases: Object.fromEntries(caseIdMap),
        }
      });
    } catch (error: any) {
      console.error("[Import] Error:", error.message);
      res.status(500).json({ error: "Failed to import data: " + error.message });
    }
  });

  const syncRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: { error: "Sync rate limit exceeded" },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: () => "sync-global",
  });

  app.post("/api/admin/sync-receive", syncRateLimiter, async (req: Request, res: Response) => {
    try {
      const syncSecret = req.headers["x-sync-secret"];
      if (!syncSecret || !process.env.DB_SYNC_SECRET || syncSecret !== process.env.DB_SYNC_SECRET) {
        return res.status(403).json({ error: "Invalid sync secret" });
      }

      const { table, columns, rows } = req.body;
      if (!table || !columns || !rows || !Array.isArray(rows) || !Array.isArray(columns)) {
        return res.status(400).json({ error: "Invalid payload: table, columns, rows required" });
      }

      if (rows.length > 500) {
        return res.status(400).json({ error: "Batch too large, max 500 rows" });
      }

      const allowedTables = [
        "tenants", "users", "clients", "contracts", "cases", "deadlines",
        "debtors", "negotiations", "negotiation_contacts", "negotiation_rounds",
        "invoices", "documents", "agenda_events", "whatsapp_config",
        "whatsapp_messages", "whatsapp_schedule", "secretary_config",
        "secretary_actions", "email_folders", "emails", "email_attachments",
        "prospection_plans", "prospection_leads", "prospection_messages",
        "prospection_network", "prospection_chat_messages", "generated_pieces",
        "document_templates", "letterhead_configs", "auth_tokens",
        "case_movements", "conversations", "messages",
      ];
      if (!allowedTables.includes(table)) {
        return res.status(400).json({ error: `Table '${table}' not allowed for sync` });
      }

      const schemaResult = await dbPool.query(
        `SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const validColumns = new Set(schemaResult.rows.map((r: any) => r.column_name));
      const jsonColumns = new Set(schemaResult.rows.filter((r: any) => r.udt_name === 'jsonb' || r.udt_name === 'json').map((r: any) => r.column_name));
      const filteredColumns = columns.filter((c: string) => validColumns.has(c));
      if (filteredColumns.length === 0) {
        return res.status(400).json({ error: "No valid columns found for table" });
      }

      if (rows.length === 0) {
        return res.json({ inserted: 0 });
      }

      const hasId = filteredColumns.includes("id");
      const hasSid = filteredColumns.includes("sid");
      const pkCol = hasId ? "id" : hasSid ? "sid" : null;
      const updateCols = filteredColumns.filter((c: string) => c !== pkCol);

      let inserted = 0;
      for (const row of rows) {
        try {
          const values = filteredColumns.map((col: string) => {
            const v = row[col];
            if (jsonColumns.has(col) && v !== null && v !== undefined && typeof v === 'object') {
              return JSON.stringify(v);
            }
            return v;
          });
          const placeholders = values.map((_: any, i: number) => `$${i + 1}`).join(", ");
          const quotedCols = filteredColumns.map((c: string) => `"${c}"`).join(", ");

          let query: string;
          if (pkCol && updateCols.length > 0) {
            const updateSet = updateCols
              .map((c: string) => `"${c}" = EXCLUDED."${c}"`)
              .join(", ");
            query = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT ("${pkCol}") DO UPDATE SET ${updateSet}`;
          } else {
            query = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          }

          await dbPool.query(query, values);
          inserted++;
        } catch (rowErr: any) {
          if (!rowErr.message?.includes("duplicate")) {
            console.error(`[SyncReceive] ${table} row error:`, rowErr.message?.substring(0, 150));
          }
        }
      }

      if (hasId) {
        try {
          await dbPool.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`);
        } catch (_seqErr: any) {
        }
      }

      res.json({ inserted, total: rows.length });
    } catch (error: any) {
      console.error("[SyncReceive] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/trigger-sync", requireAuth, async (req: Request, res: Response) => {
    try {
      const { runSync, getSyncStatus } = require("./services/dbSync");
      const result = await runSync();
      res.json({ result, status: getSyncStatus() });
    } catch (error: any) {
      console.error("[TriggerSync] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/sync-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const { getSyncStatus } = require("./services/dbSync");
      res.json(getSyncStatus());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/consolidate-mobilar", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.user?.id || req.tokenUser?.id;
      if (userId !== 5 && userId !== 1) {
        return res.status(403).json({ error: "Admin only" });
      }

      const log: string[] = [];

      const mobilarClients = await dbPool.query("SELECT id, name FROM clients WHERE LOWER(name) LIKE '%mobilar%' ORDER BY id");
      log.push(`Found ${mobilarClients.rows.length} Mobilar clients: ${JSON.stringify(mobilarClients.rows)}`);

      const has5 = mobilarClients.rows.some((r: any) => r.id === 5);
      const has4 = mobilarClients.rows.some((r: any) => r.id === 4);

      if (has5) {
        const mvDel = await dbPool.query("DELETE FROM case_movements WHERE case_id IN (SELECT id FROM cases WHERE client_id = 5)");
        log.push(`Deleted ${mvDel.rowCount} case_movements from client_id=5`);

        const csDel = await dbPool.query("DELETE FROM cases WHERE client_id = 5");
        log.push(`Deleted ${csDel.rowCount} cases from client_id=5`);

        const clDel5 = await dbPool.query("DELETE FROM clients WHERE id = 5");
        log.push(`Deleted client id=5: ${clDel5.rowCount} rows`);
      } else {
        log.push("Client id=5 not found, skipping");
      }

      if (has4) {
        const ctUpd = await dbPool.query("UPDATE contracts SET client_id = 8 WHERE client_id = 4");
        log.push(`Moved ${ctUpd.rowCount} contracts from client_id=4 to 8`);

        const clDel4 = await dbPool.query("DELETE FROM clients WHERE id = 4");
        log.push(`Deleted client id=4: ${clDel4.rowCount} rows`);
      } else {
        log.push("Client id=4 not found, skipping");
      }

      const remaining = await dbPool.query("SELECT id, name FROM clients WHERE LOWER(name) LIKE '%mobilar%'");
      log.push(`Remaining Mobilar clients: ${JSON.stringify(remaining.rows)}`);

      res.json({ success: true, log });
    } catch (error: any) {
      console.error("[ConsolidateMobilar] Error:", error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // ==================== MEETINGS (Copiloto de Reuniões) ====================
  app.get("/api/meetings", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const meetingsList = await storage.getMeetingsByTenant(tenantId);
      res.json(meetingsList);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      res.status(500).json({ error: "Failed to fetch meetings" });
    }
  });

  app.get("/api/meetings/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseInt(req.params.id);
      const meeting = await storage.getMeeting(id, tenantId);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });

      const [participants, utterances, insights, chatMessages] = await Promise.all([
        storage.getMeetingParticipants(id),
        storage.getMeetingUtterances(id),
        storage.getMeetingInsights(id),
        storage.getMeetingChatMessages(id),
      ]);

      res.json({ ...meeting, participants, utterances, insights, chatMessages });
    } catch (error) {
      console.error("Error fetching meeting:", error);
      res.status(500).json({ error: "Failed to fetch meeting" });
    }
  });

  app.post("/api/meetings", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { participants: participantNames, ...meetingData } = req.body;
      const data = insertMeetingSchema.parse({ ...meetingData, tenantId, createdBy: userId });
      const meeting = await storage.createMeeting(data);

      if (participantNames && Array.isArray(participantNames)) {
        for (const name of participantNames) {
          if (name.trim()) {
            await storage.createMeetingParticipant({ meetingId: meeting.id, name: name.trim() });
          }
        }
      }

      res.json(meeting);
    } catch (error) {
      console.error("Error creating meeting:", error);
      res.status(500).json({ error: "Failed to create meeting" });
    }
  });

  app.put("/api/meetings/:id/start", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const existing = await storage.getMeeting(id, tenantId);
      if (!existing) return res.status(404).json({ error: "Meeting not found" });
      const meeting = await storage.updateMeeting(id, { status: "active", startedAt: new Date() });
      res.json(meeting);
    } catch (error) {
      console.error("Error starting meeting:", error);
      res.status(500).json({ error: "Failed to start meeting" });
    }
  });

  app.put("/api/meetings/:id/end", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const meeting = await storage.getMeeting(id, tenantId);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });

      const utterances = await storage.getMeetingUtterances(id);
      const participants = await storage.getMeetingParticipants(id);
      const transcriptText = utterances.map(u => `${u.speakerName || "Participante"}: ${u.text}`).join("\n");

      let summaryData: { summary: string; decisions: string[]; actions: { description: string; responsible: string; deadline: string }[]; risks: string[]; nextSteps: string[]; discProfiles: { name: string; profile: string; description: string; tip: string }[] } = { summary: "", decisions: [], actions: [], risks: [], nextSteps: [], discProfiles: [] };
      if (transcriptText.trim()) {
        summaryData = await generateExecutiveSummary(
          transcriptText,
          meeting.legalRole,
          meeting.title,
          participants.map(p => p.name)
        );
      }

      const discSection = summaryData.discProfiles.length > 0
        ? "\n\n---\n🧠 PERFIS DISC:\n" + summaryData.discProfiles.map(d => `• ${d.name} — ${d.profile}: ${d.description}\n  💡 ${d.tip}`).join("\n")
        : "";

      const updated = await storage.updateMeeting(id, {
        status: "completed",
        endedAt: new Date(),
        summary: (summaryData.summary || "") + discSection,
        decisions: summaryData.decisions,
        actions: summaryData.actions,
        risks: summaryData.risks,
        nextSteps: summaryData.nextSteps,
      });

      if (summaryData.actions.length > 0) {
        try {
          const linkLabel = meeting.caseId
            ? `processo #${meeting.caseId}`
            : meeting.clientId
              ? `cliente #${meeting.clientId}`
              : "reunião";
          for (const action of summaryData.actions) {
            await storage.createMeetingInsight({
              meetingId: id,
              type: "action_alert",
              content: `[Ação vinculada ao ${linkLabel}] ${action.description} — Responsável: ${action.responsible}, Prazo: ${action.deadline}`,
            });
          }
          console.log(`[Meeting] Created ${summaryData.actions.length} action alerts linked to ${linkLabel}`);
        } catch (alertErr) {
          console.error("[Meeting] Error creating action alerts:", alertErr);
        }
      }

      res.json({ ...updated, participants, discProfiles: summaryData.discProfiles });
    } catch (error) {
      console.error("Error ending meeting:", error);
      res.status(500).json({ error: "Failed to end meeting" });
    }
  });

  app.put("/api/meetings/:id/resume", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const existing = await storage.getMeeting(id, tenantId);
      if (!existing) return res.status(404).json({ error: "Meeting not found" });
      const meeting = await storage.updateMeeting(id, { status: "active", endedAt: null });
      const participants = await storage.getMeetingParticipants(id);
      const utterances = await storage.getMeetingUtterances(id);
      const insights = await storage.getMeetingInsights(id);
      const chatMessages = await storage.getMeetingChatMessages(id);
      res.json({ ...meeting, participants, utterances, insights, chatMessages });
    } catch (error) {
      console.error("Error resuming meeting:", error);
      res.status(500).json({ error: "Failed to resume meeting" });
    }
  });

  app.delete("/api/meetings/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const existing = await storage.getMeeting(id, tenantId);
      if (!existing) return res.status(404).json({ error: "Meeting not found" });
      await storage.deleteMeeting(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting meeting:", error);
      res.status(500).json({ error: "Failed to delete meeting" });
    }
  });

  app.post("/api/meetings/:id/transcript", async (req: Request, res: Response) => {
    try {
      const meetingId = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const existing = await storage.getMeeting(meetingId, tenantId);
      if (!existing) return res.status(404).json({ error: "Meeting not found" });

      const { text, speakerName, timestampMs } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "Text is required" });

      const utterance = await storage.createMeetingUtterance({
        meetingId,
        text: text.trim(),
        speakerName: speakerName || null,
        timestampMs: timestampMs || null,
      });
      res.json(utterance);
    } catch (error) {
      console.error("Error saving transcript:", error);
      res.status(500).json({ error: "Failed to save transcript" });
    }
  });

  app.post("/api/meetings/:id/insights", async (req: Request, res: Response) => {
    try {
      const meetingId = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const meeting = await storage.getMeeting(meetingId, tenantId);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });

      // Frontend may send recent utterances with DISC speaker attribution.
      // These take priority over DB utterances so the Conselheiro has real speaker context
      // even though the transcript is stored neutrally (all "Participante" in DB).
      const clientUtterances: { speaker: string; text: string }[] | undefined = req.body?.recentUtterances;

      let transcriptText: string;
      if (clientUtterances && clientUtterances.length > 0) {
        transcriptText = clientUtterances.map(u => `${u.speaker}: ${u.text}`).join("\n");
      } else {
        const dbUtterances = await storage.getMeetingUtterances(meetingId);
        transcriptText = dbUtterances.map(u => `${u.speakerName || "Participante"}: ${u.text}`).join("\n");
      }

      if (!transcriptText.trim()) {
        return res.json({ content: "Aguardando transcrição para gerar insights..." });
      }

      const insightContent = await generateMeetingInsights(transcriptText, meeting.legalRole, meeting.title);
      const insight = await storage.createMeetingInsight({ meetingId, type: "insight", content: insightContent });
      res.json(insight);
    } catch (error) {
      console.error("Error generating insights:", error);
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  app.post("/api/meetings/:id/chat", async (req: Request, res: Response) => {
    try {
      const meetingId = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

      const meeting = await storage.getMeeting(meetingId, tenantId);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });

      await storage.createMeetingChatMessage({ meetingId, role: "user", content: message.trim() });

      const utterances = await storage.getMeetingUtterances(meetingId);
      const chatHistory = await storage.getMeetingChatMessages(meetingId);
      const transcriptText = utterances.map(u => `${u.speakerName || "Participante"}: ${u.text}`).join("\n");

      let aiResponse: string;
      try {
        aiResponse = await meetingChat(
          message.trim(),
          transcriptText,
          chatHistory.map(m => ({ role: m.role, content: m.content })),
          meeting.title,
          meeting.legalRole
        );
      } catch (aiError) {
        console.error("Error calling AI for meeting chat:", aiError);
        aiResponse = "Desculpe, não consegui processar sua pergunta no momento. Por favor, tente novamente em alguns instantes.";
      }

      const aiMessage = await storage.createMeetingChatMessage({ meetingId, role: "assistant", content: aiResponse });
      res.json(aiMessage);
    } catch (error) {
      console.error("Error in meeting chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  app.post("/api/meetings/:id/participants", async (req: Request, res: Response) => {
    try {
      const meetingId = parseInt(req.params.id);
      const tenantId = getTenantId(req);
      const existing = await storage.getMeeting(meetingId, tenantId);
      if (!existing) return res.status(404).json({ error: "Meeting not found" });

      const { name, role } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
      const participant = await storage.createMeetingParticipant({ meetingId, name: name.trim(), role: role || null });
      res.json(participant);
    } catch (error) {
      console.error("Error adding participant:", error);
      res.status(500).json({ error: "Failed to add participant" });
    }
  });

  // ==================== DEBTOR AGREEMENTS (Acordos) ====================

  // List agreements by tenant or client
  app.get("/api/debtor-agreements", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId } = req.query;
      let agreements;
      if (clientId) {
        agreements = await storage.getDebtorAgreementsByClient(parseInt(clientId as string), tenantId);
      } else {
        agreements = await storage.getDebtorAgreementsByTenant(tenantId);
      }
      // Enrich with debtor name
      const { debtors: debtorsTable } = await import("@shared/schema");
      const debtorIds = Array.from(new Set(agreements.map((a: any) => a.debtorId)));
      let debtorMap: Record<number, string> = {};
      if (debtorIds.length > 0) {
        const rows = await db.select({ id: debtorsTable.id, name: debtorsTable.name, document: debtorsTable.document }).from(debtorsTable).where(inArray(debtorsTable.id, debtorIds as number[]));
        rows.forEach((r: any) => { debtorMap[r.id] = r.name; });
        const docMap: Record<number, string> = {};
        rows.forEach((r: any) => { docMap[r.id] = r.document || ""; });
        agreements = agreements.map((a: any) => ({ ...a, debtorName: debtorMap[a.debtorId] || "", debtorDocument: docMap[a.debtorId] || "" }));
      }
      res.json(agreements);
    } catch (error) {
      console.error("Error getting debtor agreements:", error);
      res.status(500).json({ error: "Failed to get debtor agreements" });
    }
  });

  // List agreements by debtor
  app.get("/api/debtors/:id/agreements", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const agreements = await storage.getDebtorAgreementsByDebtor(parseInt(req.params.id), tenantId);
      res.json(agreements);
    } catch (error) {
      res.status(500).json({ error: "Failed to get debtor agreements" });
    }
  });

  // Create agreement
  app.post("/api/debtor-agreements", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, debtorId } = req.body;

      // Verify clientId and debtorId belong to this tenant (cross-tenant abuse prevention)
      if (clientId) {
        const client = await storage.getClient(parseInt(clientId));
        if (!client || client.tenantId !== tenantId) return res.status(403).json({ error: "Client not found or access denied" });
      }
      if (debtorId) {
        const { debtors: debtorsTable } = await import("@shared/schema");
        const [debtor] = await db.select({ tenantId: debtorsTable.tenantId }).from(debtorsTable).where(eq(debtorsTable.id, parseInt(debtorId)));
        if (!debtor || debtor.tenantId !== tenantId) return res.status(403).json({ error: "Debtor not found or access denied" });
      }

      const data = { ...req.body, tenantId };
      const agreement = await storage.createDebtorAgreement(data);
      res.json(agreement);
    } catch (error) {
      console.error("Error creating debtor agreement:", error);
      res.status(500).json({ error: "Failed to create debtor agreement" });
    }
  });

  // Update agreement
  app.patch("/api/debtor-agreements/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const agreement = await storage.updateDebtorAgreement(parseInt(req.params.id), tenantId, req.body);
      if (!agreement) return res.status(404).json({ error: "Agreement not found" });
      res.json(agreement);
    } catch (error) {
      res.status(500).json({ error: "Failed to update debtor agreement" });
    }
  });

  // Delete agreement
  app.delete("/api/debtor-agreements/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      await storage.deleteDebtorAgreement(parseInt(req.params.id), tenantId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete debtor agreement" });
    }
  });

  // Toggle fee status (one-click: pendente ↔ recebido)
  app.patch("/api/debtor-agreements/:id/fee-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const existing = await storage.getDebtorAgreement(parseInt(req.params.id), tenantId);
      if (!existing) return res.status(404).json({ error: "Agreement not found" });
      const newStatus = req.body.feeStatus ?? (existing.feeStatus === "recebido" ? "pendente" : "recebido");
      const updated = await storage.updateDebtorAgreement(parseInt(req.params.id), tenantId, { feeStatus: newStatus });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle fee status" });
    }
  });

  // Generate Excel report for a client+month
  app.get("/api/debtor-agreements/report", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, month, year } = req.query;
      if (!clientId) return res.status(400).json({ error: "clientId is required" });

      let agreements = await storage.getDebtorAgreementsByClient(parseInt(clientId as string), tenantId);

      // Enrich with debtor info
      const { debtors: debtorsTable, clients: clientsTable } = await import("@shared/schema");
      const debtorIds = Array.from(new Set(agreements.map((a: any) => a.debtorId)));
      let debtorMap: Record<number, any> = {};
      if (debtorIds.length > 0) {
        const rows = await db.select().from(debtorsTable).where(inArray(debtorsTable.id, debtorIds as number[]));
        rows.forEach((r: any) => { debtorMap[r.id] = r; });
      }
      const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, parseInt(clientId as string)));

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Title row
      const monthYear = month && year ? `${String(month).padStart(2, "0")}/${year}` : new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }).replace("/", "/");
      const clientName = clientRow?.name || "Cliente";

      const rows: any[][] = [
        [`${clientName.toUpperCase()} – PLANILHA MENSAL DOS HONORÁRIOS – ${monthYear.toUpperCase()}`],
        [],
        ["NOME", "DATA ACORDO", "DÍVIDA ORIGINAL", "VALOR ACORDADO", "PARCELAS", "VALOR ENTRADA", "DATA ENTRADA", "VALOR PRESTAÇÕES", "VENCIMENTO", "% HONORÁRIOS", "HONORÁRIOS", "STATUS HON.", "HONORÁRIOS MÊS", "STATUS", "OBSERVAÇÕES"],
      ];

      const targetMonth = month ? parseInt(month as string) : null;
      const targetYear = year ? parseInt(year as string) : null;

      for (const a of agreements) {
        const debtor = debtorMap[a.debtorId];
        const installmentsDisplay = a.isSinglePayment ? "ÚNICA" : (a.installmentsCount?.toString() || "");
        const dueDayDisplay = a.dueDay ? `DIA ${a.dueDay}` : (a.isSinglePayment ? "XXXXXX" : "");
        const feePercent = parseFloat(a.feePercent || "10");
        const installmentValue = parseFloat(a.installmentValue || "0");
        const monthlyFee = targetMonth && targetYear
          ? (isActiveInMonth(a, targetMonth, targetYear) ? Math.round(installmentValue * feePercent / 100 * 100) / 100 : 0)
          : Math.round(installmentValue * feePercent / 100 * 100) / 100;

        rows.push([
          debtor?.name || "",
          a.agreementDate || "",
          parseFloat(a.originalDebtValue || "0") || "",
          parseFloat(a.agreedValue || "0") || "",
          installmentsDisplay,
          parseFloat(a.downPaymentValue || "0") || "",
          a.downPaymentDate || "",
          installmentValue || "",
          dueDayDisplay,
          `${feePercent}%`,
          parseFloat(a.feeAmount || "0") || "",
          a.feeStatus || "pendente",
          monthlyFee,
          a.status || "ativo",
          a.notes || "",
        ]);
      }

      // Summary row — col 12 = HONORÁRIOS MÊS (0-indexed)
      const total = rows.slice(3).reduce((sum: number, r: any[]) => sum + (parseFloat(r[12]) || 0), 0);
      rows.push([]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "TOTAL HONORÁRIOS", Math.round(total * 100) / 100]);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Style header
      ws["!cols"] = [
        { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
        { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 35 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Acordos");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="honorarios_${monthYear.replace("/", "_")}.xlsx"`);
      res.send(Buffer.from(buf));
    } catch (error) {
      console.error("Error generating agreements report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // Helper (defined outside request handler via closure)
  function isActiveInMonth(a: any, month: number, year: number): boolean {
    if (!a.agreementDate) return false;
    const agreementDate = new Date(a.agreementDate);
    const refDate = new Date(year, month - 1, 1);
    if (agreementDate > new Date(year, month - 1, 31)) return false;
    if (a.isSinglePayment) return agreementDate.getMonth() + 1 === month && agreementDate.getFullYear() === year;
    // For installments, check if still running
    if (a.installmentsCount && a.downPaymentDate) {
      const endDate = new Date(a.downPaymentDate);
      endDate.setMonth(endDate.getMonth() + (a.installmentsCount - 1));
      if (refDate > endDate) return false;
    }
    return true;
  }

  // Send report via email and/or WhatsApp
  app.post("/api/debtor-agreements/report/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { clientId, month, year } = req.body;
      if (!clientId) return res.status(400).json({ error: "clientId is required" });
      // Normalize any value (array, single string, or undefined) to a flat string array
      const toStringArray = (v: any): string[] => {
        if (!v) return [];
        const arr = Array.isArray(v) ? v : [v];
        return arr.map((x: any) => (x != null ? String(x).trim() : "")).filter(Boolean);
      };
      // Accept both singular (emailTo/whatsappTo) and plural (emailTos/whatsappTos) field names; deduplicate
      const emailList = [...new Set(toStringArray(req.body.emailTos ?? req.body.emailTo))];
      const whatsappList = [...new Set(toStringArray(req.body.whatsappTos ?? req.body.whatsappTo))];

      // Build the excel internally
      let agreements = await storage.getDebtorAgreementsByClient(parseInt(clientId), tenantId);
      const { debtors: debtorsTable, clients: clientsTable } = await import("@shared/schema");
      const debtorIds = Array.from(new Set(agreements.map((a: any) => a.debtorId)));
      let debtorMap: Record<number, any> = {};
      if (debtorIds.length > 0) {
        const rows = await db.select().from(debtorsTable).where(inArray(debtorsTable.id, debtorIds as number[]));
        rows.forEach((r: any) => { debtorMap[r.id] = r; });
      }
      const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, parseInt(clientId)));

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const monthYear = month && year ? `${String(month).padStart(2, "0")}/${year}` : new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }).replace("/", "/");
      const clientName = clientRow?.name || "Cliente";
      const targetMonth = month ? parseInt(month) : null;
      const targetYear = year ? parseInt(year) : null;

      const wsRows: any[][] = [
        [`${clientName.toUpperCase()} – PLANILHA MENSAL DOS HONORÁRIOS – ${monthYear.toUpperCase()}`],
        [],
        ["NOME", "DATA ACORDO", "DÍVIDA ORIGINAL", "VALOR ACORDADO", "PARCELAS", "VALOR ENTRADA", "DATA ENTRADA", "VALOR PRESTAÇÕES", "VENCIMENTO", "% HONORÁRIOS", "HONORÁRIOS", "STATUS HON.", "HONORÁRIOS MÊS", "STATUS", "OBSERVAÇÕES"],
      ];

      for (const a of agreements) {
        const debtor = debtorMap[a.debtorId];
        const installmentsDisplay = a.isSinglePayment ? "ÚNICA" : (a.installmentsCount?.toString() || "");
        const dueDayDisplay = a.dueDay ? `DIA ${a.dueDay}` : (a.isSinglePayment ? "XXXXXX" : "");
        const feePercent = parseFloat(a.feePercent || "10");
        const installmentValue = parseFloat(a.installmentValue || "0");
        const monthlyFee = targetMonth && targetYear
          ? (isActiveInMonth(a, targetMonth, targetYear) ? Math.round(installmentValue * feePercent / 100 * 100) / 100 : 0)
          : Math.round(installmentValue * feePercent / 100 * 100) / 100;
        wsRows.push([debtor?.name || "", a.agreementDate || "", parseFloat(a.originalDebtValue || "0") || "", parseFloat(a.agreedValue || "0") || "", installmentsDisplay, parseFloat(a.downPaymentValue || "0") || "", a.downPaymentDate || "", installmentValue || "", dueDayDisplay, `${feePercent}%`, parseFloat(a.feeAmount || "0") || "", a.feeStatus || "pendente", monthlyFee, a.status || "ativo", a.notes || ""]);
      }

      const ws = XLSX.utils.aoa_to_sheet(wsRows);
      XLSX.utils.book_append_sheet(wb, ws, "Acordos");
      const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
      const fileName = `honorarios_${monthYear.replace("/", "_")}.xlsx`;

      const results: string[] = [];
      const htmlBody = `<p>Segue em anexo a planilha de honorários de <strong>${clientName}</strong> referente a <strong>${monthYear}</strong>.</p><p>Atenciosamente,<br>Marques &amp; Serra Advogados</p>`;

      for (const to of emailList) {
        await emailService.sendEmail({ to, subject: `Honorários ${clientName} – ${monthYear}`, html: htmlBody, attachments: [{ filename: fileName, content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] });
        if (!results.includes("email")) results.push("email");
      }

      if (whatsappList.length > 0) {
        const { whatsappService } = await import("./services/whatsapp");
        for (const to of whatsappList) {
          await whatsappService.sendDocument(to.replace(/\D/g, ""), buf, fileName, `Honorários ${clientName} – ${monthYear}`, tenantId, true);
        }
        results.push("whatsapp");
      }

      res.json({ success: true, sent: results });
    } catch (error) {
      console.error("Error sending agreements report:", error);
      res.status(500).json({ error: "Failed to send report" });
    }
  });

  // Bulk create agreements (batch import)
  app.post("/api/debtor-agreements/batch", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { agreements } = req.body;
      if (!Array.isArray(agreements) || agreements.length === 0) return res.status(400).json({ error: "agreements array required" });

      // Verify all referenced clientIds and debtorIds belong to this tenant
      const { debtors: debtorsTable, clients: clientsTableBatch } = await import("@shared/schema");
      const uniqueClientIds = Array.from(new Set(agreements.map((a: any) => a.clientId).filter(Boolean)));
      const uniqueDebtorIds = Array.from(new Set(agreements.map((a: any) => a.debtorId).filter(Boolean)));

      if (uniqueClientIds.length > 0) {
        const validClients = await db.select({ id: clientsTableBatch.id }).from(clientsTableBatch).where(and(inArray(clientsTableBatch.id, uniqueClientIds as number[]), eq(clientsTableBatch.tenantId, tenantId)));
        const validClientIds = new Set(validClients.map(c => c.id));
        const unauthorized = (uniqueClientIds as number[]).find(id => !validClientIds.has(id));
        if (unauthorized) return res.status(403).json({ error: `Client ${unauthorized} not found or access denied` });
      }
      if (uniqueDebtorIds.length > 0) {
        const validDebtors = await db.select({ id: debtorsTable.id }).from(debtorsTable).where(and(inArray(debtorsTable.id, uniqueDebtorIds as number[]), eq(debtorsTable.tenantId, tenantId)));
        const validDebtorIds = new Set(validDebtors.map(d => d.id));
        const unauthorized = (uniqueDebtorIds as number[]).find(id => !validDebtorIds.has(id));
        if (unauthorized) return res.status(403).json({ error: `Debtor ${unauthorized} not found or access denied` });
      }

      const created = [];
      for (const a of agreements) {
        try {
          const record = await storage.createDebtorAgreement({ ...a, tenantId });
          created.push(record);
        } catch (err) {
          console.error("Error creating agreement:", err, a);
        }
      }
      res.json({ created: created.length, records: created });
    } catch (error) {
      console.error("Error batch creating agreements:", error);
      res.status(500).json({ error: "Failed to batch create agreements" });
    }
  });

  // Parse/import agreements from CSV, text, or PDF using AI
  app.post("/api/debtor-agreements/import/parse", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { type, text: rawText, clientId } = req.body;

      let textContent = "";

      const PARSE_PROMPT = `Você é um assistente que extrai dados de planilhas de acordos de devedores.
Analise todos os dados e retorne um JSON com a chave "acordos" contendo um array de objetos.

Cada objeto deve ter EXATAMENTE estes campos:
- debtorName: string — nome do devedor/pessoa (obrigatório)
- agreementDate: string — data do acordo no formato YYYY-MM-DD (se não encontrar, use a data de hoje)
- isSinglePayment: boolean — true se pagamento único / "ÚNICA" / parcela única
- installmentsCount: number | null — número de parcelas (null se pagamento único)
- downPaymentValue: number | null — valor da entrada em reais (número puro, sem R$)
- downPaymentDate: string | null — data da entrada no formato YYYY-MM-DD
- installmentValue: number | null — valor de cada prestação mensal em reais
- dueDay: number | null — dia do mês de vencimento (ex: 10); null se "XXXXXX", "JUDICIAL" ou não informado
- feePercent: number — percentual de honorários (padrão 10 se não informado)
- notes: string | null — observações ou notas adicionais

Regras obrigatórias:
- Converta datas DD/MM/YYYY → YYYY-MM-DD
- "ÚNICA", "UNICA", "1x", "À VISTA" → isSinglePayment: true, installmentsCount: null
- "DIA 5", "DIA 10", "DIA 15", etc. → dueDay: 5, 10, 15, etc.
- "XXXXXX", "JUDICIAL", "X", "---" em vencimento → dueDay: null
- Valores: remova "R$", pontos de milhar e substitua vírgula por ponto (ex: "R$ 1.500,00" → 1500.00)
- Ignore cabeçalhos, linhas de total/soma, linhas completamente vazias
- Inclua TODOS os devedores encontrados, mesmo que incompletos
- Retorne APENAS o JSON, sem texto antes ou depois`;

      if (type === "csv" || type === "excel") {
        if (!req.file) return res.status(400).json({ error: "File required" });
        const XLSX = await import("xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        textContent = XLSX.utils.sheet_to_csv(sheet);
      } else if (type === "pdf") {
        if (!req.file) return res.status(400).json({ error: "File required" });
        // Use Gemini to directly extract AND parse PDF into structured JSON in one call
        const { GoogleGenAI } = await import("@google/genai");
        const genAI = new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY, httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL } });
        const base64 = req.file.buffer.toString("base64");
        const result = await genAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [
            { inlineData: { mimeType: "application/pdf", data: base64 } },
            { text: PARSE_PROMPT },
          ] }],
          config: { responseMimeType: "application/json" },
        });
        const rawJson = result.text || "{}";
        console.log("[AcordosImport/PDF] Gemini raw response (first 500):", rawJson.substring(0, 500));
        let parsed: any[] = [];
        try {
          const obj = JSON.parse(rawJson);
          parsed = Array.isArray(obj) ? obj : (obj.acordos || obj.agreements || obj.data || obj.records || []);
        } catch {
          return res.status(500).json({ error: "Gemini retornou JSON inválido" });
        }
        return res.json({ records: parsed, count: parsed.length });
      } else if (type === "text") {
        textContent = rawText || "";
      } else {
        return res.status(400).json({ error: "Invalid type. Use: csv, excel, pdf, text" });
      }

      if (!textContent.trim()) return res.status(400).json({ error: "No content to parse" });
      console.log("[AcordosImport] text/csv content (first 500):", textContent.substring(0, 500));

      // Use GPT-4o to parse text/CSV into structured agreement records
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: PARSE_PROMPT },
          { role: "user", content: `Dados da planilha:\n${textContent.substring(0, 12000)}` },
        ],
        response_format: { type: "json_object" },
      });

      let parsed: any[] = [];
      try {
        const jsonStr = completion.choices[0].message.content || "{}";
        const obj = JSON.parse(jsonStr);
        parsed = Array.isArray(obj) ? obj : (obj.acordos || obj.agreements || obj.data || obj.records || []);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response" });
      }

      res.json({ records: parsed, count: parsed.length });
    } catch (error) {
      console.error("Error parsing import:", error);
      res.status(500).json({ error: "Failed to parse import data" });
    }
  });

  // ==================== CORPUS PÚBLICO JURÍDICO ====================

  // Peças do escritório semanticamente similares (para o painel lateral no Studio)
  app.post("/api/studio/similar-pieces", async (req, res) => {
    try {
      const { query, pieceType, topK = 4 } = req.body;
      if (!query || query.trim().length < 10) {
        return res.json({ results: [] });
      }
      const tenantId = getTenantId(req);
      const { embeddingService } = await import("./services/embeddingService");
      const results = await embeddingService.retrieveSimilarPieces({
        tenantId,
        queryText: query,
        pieceType: pieceType || "",
        topK: Math.min(topK, 8),
        similarityThreshold: 0.70,
      });
      res.json({ results });
    } catch (error) {
      console.error("Error finding similar pieces:", error);
      res.json({ results: [] }); // silencioso — nunca falha para o cliente
    }
  });

  // Busca semântica no corpus público
  app.post("/api/corpus/search", async (req, res) => {
    try {
      const { query, pieceType, topK = 5, minQuality = 5 } = req.body;
      if (!query) return res.status(400).json({ error: "query é obrigatório" });
      const { corpusRetrievalService } = await import("./services/corpusRetrieval");
      const results = await corpusRetrievalService.retrieveSimilarDocuments({
        queryText: query,
        pieceType,
        topK: Math.min(topK, 20),
        minQuality,
      });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error("Error in corpus search:", error);
      res.status(500).json({ error: "Falha na busca do corpus" });
    }
  });

  // Estatísticas do corpus público
  app.get("/api/admin/corpus/stats", async (req, res) => {
    try {
      const { corpusRetrievalService } = await import("./services/corpusRetrieval");
      const stats = await corpusRetrievalService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching corpus stats:", error);
      res.status(500).json({ error: "Falha ao buscar estatísticas do corpus" });
    }
  });

  // Dispara scraping manual (admin)
  app.post("/api/admin/run-scraping-job", async (req, res) => {
    try {
      const { maxQueries = 10, pieceTypes, force = true } = req.body || {};
      const { scrapingJobIsRunning, runScrapingJob } = await import("./services/scrapingJob");

      if (scrapingJobIsRunning) {
        return res.status(409).json({ error: "Scraping job já está em execução" });
      }

      // Responde imediatamente, roda em background
      res.json({ message: "Scraping job iniciado em background", maxQueries, force });

      runScrapingJob({ force, maxQueries, pieceTypes }).catch(e =>
        console.error("[ScrapingJob] Manual run failed:", e?.message)
      );
    } catch (error) {
      console.error("Error starting scraping job:", error);
      res.status(500).json({ error: "Falha ao iniciar scraping job" });
    }
  });

  return httpServer;
}
