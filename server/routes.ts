import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { datajudService } from "./services/datajud";
import { aiService } from "./services/ai";
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
  app.post("/api/datajud/search", async (req: Request, res: Response) => {
    try {
      const { caseNumber, document } = req.body;
      
      if (caseNumber) {
        const result = await datajudService.searchByProcessNumber(caseNumber);
        if (!result) {
          return res.status(404).json({ error: "Process not found in DataJud" });
        }
        res.json(result);
      } else if (document) {
        const results = await datajudService.searchByDocument(document);
        res.json(results);
      } else {
        res.status(400).json({ error: "caseNumber or document is required" });
      }
    } catch (error) {
      console.error("Error searching DataJud:", error);
      res.status(500).json({ error: "Failed to search DataJud" });
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

  return httpServer;
}
