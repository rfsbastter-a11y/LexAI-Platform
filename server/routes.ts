import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { datajudService } from "./services/datajud";
import { aiService } from "./services/ai";
import { emailService } from "./services/email";
import { imapService } from "./services/imap";
import { insertClientSchema, insertContractSchema, insertCaseSchema, insertDeadlineSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ==================== DASHBOARD ====================
  app.get("/api/dashboard/stats", async (req: Request, res: Response) => {
    try {
      const tenantId = 1; // TODO: Get from auth session
      const stats = await storage.getDashboardStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // ==================== CLIENTS ====================
  app.get("/api/clients", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const clients = await storage.getClientsByTenant(tenantId);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/clients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = 1; // TODO: Get from authenticated session
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
      const tenantId = 1;
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

  // ==================== CONTRACTS ====================
  app.get("/api/contracts", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const contracts = await storage.getContractsByTenant(tenantId);
      res.json(contracts);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      res.status(500).json({ error: "Failed to fetch contracts" });
    }
  });

  app.post("/api/contracts", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const data = insertContractSchema.parse({ ...req.body, tenantId });
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

  // ==================== CASES ====================
  app.get("/api/cases", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const cases = await storage.getCasesByTenant(tenantId);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching cases:", error);
      res.status(500).json({ error: "Failed to fetch cases" });
    }
  });

  app.get("/api/cases/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = 1; // TODO: Get from authenticated session
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
      const tenantId = 1;
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

  // ==================== DATAJUD ====================
  app.get("/api/datajud/tribunais", async (req: Request, res: Response) => {
    try {
      const { segmento } = req.query;
      let tribunais;
      
      if (segmento && typeof segmento === "string") {
        tribunais = datajudService.getTribunaisBySegmento(segmento);
      } else {
        tribunais = datajudService.getAllTribunais();
      }
      
      res.json({
        total: tribunais.length,
        segmentos: ["estadual", "federal", "trabalho", "eleitoral", "militar", "militar_estadual", "superior"],
        tribunais
      });
    } catch (error) {
      console.error("Error fetching tribunais:", error);
      res.status(500).json({ error: "Failed to fetch tribunais" });
    }
  });

  app.post("/api/datajud/search", async (req: Request, res: Response) => {
    try {
      const { caseNumber, document, segmentos } = req.body;
      
      if (caseNumber) {
        const result = await datajudService.searchByProcessNumber(caseNumber);
        if (!result) {
          return res.status(404).json({ error: "Process not found in DataJud" });
        }
        res.json(result);
      } else if (document) {
        const results = await datajudService.searchByDocument(document, segmentos);
        res.json(results);
      } else {
        res.status(400).json({ error: "caseNumber or document is required" });
      }
    } catch (error) {
      console.error("Error searching DataJud:", error);
      res.status(500).json({ error: "Failed to search DataJud" });
    }
  });

  app.post("/api/datajud/search/:tribunal", async (req: Request, res: Response) => {
    try {
      const { tribunal } = req.params;
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      
      const results = await datajudService.searchByTribunal(tribunal, query);
      res.json({
        tribunal,
        total: results.length,
        results
      });
    } catch (error) {
      console.error("Error searching tribunal:", error);
      res.status(500).json({ error: "Failed to search tribunal" });
    }
  });

  app.post("/api/datajud/import/:caseId", async (req: Request, res: Response) => {
    try {
      const tenantId = 1; // TODO: Get from authenticated session
      const caseId = parseInt(req.params.caseId);
      const caseItem = await storage.getCase(caseId, tenantId);
      
      if (!caseItem) {
        return res.status(404).json({ error: "Case not found" });
      }

      const processData = await datajudService.searchByProcessNumber(caseItem.caseNumber);
      if (!processData) {
        return res.status(404).json({ error: "Process not found in DataJud" });
      }

      await datajudService.importProcess(caseId, processData);
      
      await storage.createAuditLog({
        tenantId: caseItem.tenantId,
        action: "datajud_sync",
        entityType: "case",
        entityId: caseId,
        details: { movementsImported: processData.movimentos?.length || 0 },
      });

      res.json({ success: true, movementsImported: processData.movimentos?.length || 0 });
    } catch (error) {
      console.error("Error importing from DataJud:", error);
      res.status(500).json({ error: "Failed to import from DataJud" });
    }
  });

  // ==================== DEADLINES ====================
  app.get("/api/deadlines", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const deadlines = await storage.getDeadlinesByTenant(tenantId);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching deadlines:", error);
      res.status(500).json({ error: "Failed to fetch deadlines" });
    }
  });

  app.get("/api/deadlines/urgent", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
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
      const tenantId = 1;
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
      const tenantId = 1;
      const invoices = await storage.getInvoicesByTenant(tenantId);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
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

  // ==================== CONVERSATIONS ====================
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
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
      const tenantId = 1;
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

  app.post("/api/email/send", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const { to, subject, html, text, cc, bcc } = req.body;
      
      if (!to || !subject) {
        return res.status(400).json({ error: "to and subject are required" });
      }
      
      const result = await emailService.sendEmail({
        to,
        subject,
        html,
        text,
        cc,
        bcc,
      });
      
      if (result.success) {
        await storage.createAuditLog({
          tenantId,
          action: "email_sent",
          entityType: "email",
          entityId: 0,
          details: { to, subject, messageId: result.messageId },
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

  // ==================== EMAIL INBOX (IMAP) ====================
  app.get("/api/inbox/status", async (req: Request, res: Response) => {
    try {
      const configured = imapService.isConfigured();
      if (!configured) {
        return res.json({ configured: false, message: "IMAP not configured" });
      }
      
      const test = await imapService.testConnection();
      res.json({ configured: true, connected: test.success, error: test.error });
    } catch (error) {
      console.error("Error checking IMAP status:", error);
      res.status(500).json({ error: "Failed to check IMAP status" });
    }
  });

  app.get("/api/inbox/folders", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const folders = await storage.getEmailFolders(tenantId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/inbox/sync-folders", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      if (!imapService.isConfigured()) {
        return res.status(400).json({ error: "IMAP not configured" });
      }
      await imapService.syncFolders(tenantId);
      const folders = await storage.getEmailFolders(tenantId);
      res.json({ success: true, folders });
    } catch (error) {
      console.error("Error syncing folders:", error);
      res.status(500).json({ error: "Failed to sync folders" });
    }
  });

  app.post("/api/inbox/sync", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
      const { folderId, limit = 50 } = req.body;
      
      if (!imapService.isConfigured()) {
        return res.status(400).json({ error: "IMAP not configured" });
      }

      if (folderId) {
        const folder = await storage.getEmailFolder(folderId);
        if (!folder) {
          return res.status(404).json({ error: "Folder not found" });
        }
        const synced = await imapService.syncEmails(tenantId, folderId, folder.imapPath, limit);
        res.json({ success: true, synced });
      } else {
        const results = await imapService.syncAllFolders(tenantId, limit);
        res.json({ success: true, results });
      }
    } catch (error) {
      console.error("Error syncing emails:", error);
      res.status(500).json({ error: "Failed to sync emails" });
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
      const tenantId = 1;
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
      const tenantId = 1;
      const drafts = await storage.getEmailDrafts(tenantId);
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      res.status(500).json({ error: "Failed to fetch drafts" });
    }
  });

  app.post("/api/inbox/drafts", async (req: Request, res: Response) => {
    try {
      const tenantId = 1;
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
      const tenantId = 1;
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

  return httpServer;
}
