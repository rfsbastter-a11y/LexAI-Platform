import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import {
  tenants, users, clients, contracts, cases, caseMovements,
  deadlines, documents, invoices, auditLogs, datajudSyncLogs,
  aiGenerationLogs, conversations, messages,
  type InsertTenant, type Tenant,
  type InsertUser, type User,
  type InsertClient, type Client,
  type InsertContract, type Contract,
  type InsertCase, type Case,
  type InsertCaseMovement, type CaseMovement,
  type InsertDeadline, type Deadline,
  type InsertDocument, type Document,
  type InsertInvoice, type Invoice,
  type InsertAuditLog, type AuditLog,
  type InsertDatajudSyncLog, type DatajudSyncLog,
  type InsertAiGenerationLog, type AiGenerationLog,
  type InsertConversation, type Conversation,
  type InsertMessage, type Message,
} from "@shared/schema";

export interface IStorage {
  // Tenants
  getTenant(id: number): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;

  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: number): Promise<User[]>;
  createUser(data: InsertUser): Promise<User>;

  // Clients
  getClient(id: number, tenantId?: number): Promise<Client | undefined>;
  getClientsByTenant(tenantId: number): Promise<Client[]>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<InsertClient>): Promise<Client>;

  // Contracts
  getContract(id: number, tenantId?: number): Promise<Contract | undefined>;
  getContractsByTenant(tenantId: number): Promise<Contract[]>;
  getContractsByClient(clientId: number): Promise<Contract[]>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(id: number, data: Partial<InsertContract>): Promise<Contract>;

  // Cases
  getCase(id: number, tenantId?: number): Promise<Case | undefined>;
  getCaseByNumber(caseNumber: string): Promise<Case | undefined>;
  getCasesByTenant(tenantId: number): Promise<Case[]>;
  getCasesByClient(clientId: number): Promise<Case[]>;
  createCase(data: InsertCase): Promise<Case>;
  updateCase(id: number, data: Partial<InsertCase>): Promise<Case>;

  // Case Movements
  getCaseMovements(caseId: number): Promise<CaseMovement[]>;
  createCaseMovement(data: InsertCaseMovement): Promise<CaseMovement>;
  createCaseMovements(data: InsertCaseMovement[]): Promise<CaseMovement[]>;

  // Deadlines
  getDeadline(id: number): Promise<Deadline | undefined>;
  getDeadlinesByTenant(tenantId: number): Promise<Deadline[]>;
  getUrgentDeadlines(tenantId: number, days: number): Promise<Deadline[]>;
  createDeadline(data: InsertDeadline): Promise<Deadline>;
  updateDeadline(id: number, data: Partial<InsertDeadline>): Promise<Deadline>;

  // Documents
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsByCase(caseId: number): Promise<Document[]>;
  getDocumentsByTenant(tenantId: number): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document>;

  // Invoices
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByTenant(tenantId: number): Promise<Invoice[]>;
  getInvoicesByClient(clientId: number): Promise<Invoice[]>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(tenantId: number, limit?: number): Promise<AuditLog[]>;

  // DataJud Sync Logs
  createDatajudSyncLog(data: InsertDatajudSyncLog): Promise<DatajudSyncLog>;
  getDatajudSyncLogs(caseId: number): Promise<DatajudSyncLog[]>;

  // AI Generation Logs
  createAiGenerationLog(data: InsertAiGenerationLog): Promise<AiGenerationLog>;
  getAiGenerationLogs(tenantId: number): Promise<AiGenerationLog[]>;

  // Conversations
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationsByTenant(tenantId: number): Promise<Conversation[]>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;

  // Messages
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(data: InsertMessage): Promise<Message>;

  // Dashboard Stats
  getDashboardStats(tenantId: number): Promise<{
    urgentDeadlines: number;
    activeCases: number;
    monthlyBilling: string;
    newCasesThisMonth: number;
  }>;
}

class DatabaseStorage implements IStorage {
  // Tenants
  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsersByTenant(tenantId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  // Clients
  async getClient(id: number, tenantId?: number): Promise<Client | undefined> {
    if (tenantId) {
      const [client] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
      return client;
    }
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async getClientsByTenant(tenantId: number): Promise<Client[]> {
    return db.select().from(clients).where(eq(clients.tenantId, tenantId)).orderBy(desc(clients.createdAt));
  }

  async createClient(data: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(data).returning();
    return client;
  }

  async updateClient(id: number, data: Partial<InsertClient>): Promise<Client> {
    const [client] = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return client;
  }

  // Contracts
  async getContract(id: number, tenantId?: number): Promise<Contract | undefined> {
    if (tenantId) {
      const [contract] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)));
      return contract;
    }
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    return contract;
  }

  async getContractsByTenant(tenantId: number): Promise<Contract[]> {
    return db.select().from(contracts).where(eq(contracts.tenantId, tenantId)).orderBy(desc(contracts.createdAt));
  }

  async getContractsByClient(clientId: number): Promise<Contract[]> {
    return db.select().from(contracts).where(eq(contracts.clientId, clientId));
  }

  async createContract(data: InsertContract): Promise<Contract> {
    const [contract] = await db.insert(contracts).values(data).returning();
    return contract;
  }

  async updateContract(id: number, data: Partial<InsertContract>): Promise<Contract> {
    const [contract] = await db.update(contracts).set(data).where(eq(contracts.id, id)).returning();
    return contract;
  }

  // Cases
  async getCase(id: number, tenantId?: number): Promise<Case | undefined> {
    if (tenantId) {
      const [caseItem] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.tenantId, tenantId)));
      return caseItem;
    }
    const [caseItem] = await db.select().from(cases).where(eq(cases.id, id));
    return caseItem;
  }

  async getCaseByNumber(caseNumber: string): Promise<Case | undefined> {
    const [caseItem] = await db.select().from(cases).where(eq(cases.caseNumber, caseNumber));
    return caseItem;
  }

  async getCasesByTenant(tenantId: number): Promise<Case[]> {
    return db.select().from(cases).where(eq(cases.tenantId, tenantId)).orderBy(desc(cases.createdAt));
  }

  async getCasesByClient(clientId: number): Promise<Case[]> {
    return db.select().from(cases).where(eq(cases.clientId, clientId));
  }

  async createCase(data: InsertCase): Promise<Case> {
    const [caseItem] = await db.insert(cases).values(data).returning();
    return caseItem;
  }

  async updateCase(id: number, data: Partial<InsertCase>): Promise<Case> {
    const [caseItem] = await db.update(cases).set(data).where(eq(cases.id, id)).returning();
    return caseItem;
  }

  // Case Movements
  async getCaseMovements(caseId: number): Promise<CaseMovement[]> {
    return db.select().from(caseMovements).where(eq(caseMovements.caseId, caseId)).orderBy(desc(caseMovements.date));
  }

  async createCaseMovement(data: InsertCaseMovement): Promise<CaseMovement> {
    const [movement] = await db.insert(caseMovements).values(data).returning();
    return movement;
  }

  async createCaseMovements(data: InsertCaseMovement[]): Promise<CaseMovement[]> {
    if (data.length === 0) return [];
    return db.insert(caseMovements).values(data).returning();
  }

  // Deadlines
  async getDeadline(id: number): Promise<Deadline | undefined> {
    const [deadline] = await db.select().from(deadlines).where(eq(deadlines.id, id));
    return deadline;
  }

  async getDeadlinesByTenant(tenantId: number): Promise<Deadline[]> {
    return db.select().from(deadlines).where(eq(deadlines.tenantId, tenantId)).orderBy(deadlines.dueDate);
  }

  async getUrgentDeadlines(tenantId: number, days: number): Promise<Deadline[]> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return db.select().from(deadlines).where(
      and(
        eq(deadlines.tenantId, tenantId),
        eq(deadlines.status, "pendente"),
        gte(deadlines.dueDate, now),
        lte(deadlines.dueDate, futureDate)
      )
    ).orderBy(deadlines.dueDate);
  }

  async createDeadline(data: InsertDeadline): Promise<Deadline> {
    const [deadline] = await db.insert(deadlines).values(data).returning();
    return deadline;
  }

  async updateDeadline(id: number, data: Partial<InsertDeadline>): Promise<Deadline> {
    const [deadline] = await db.update(deadlines).set(data).where(eq(deadlines.id, id)).returning();
    return deadline;
  }

  // Documents
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async getDocumentsByCase(caseId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.createdAt));
  }

  async getDocumentsByTenant(tenantId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.tenantId, tenantId)).orderBy(desc(documents.createdAt));
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [document] = await db.insert(documents).values(data).returning();
    return document;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document> {
    const [document] = await db.update(documents).set(data).where(eq(documents.id, id)).returning();
    return document;
  }

  // Invoices
  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoicesByTenant(tenantId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByClient(clientId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.clientId, clientId));
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(data).returning();
    return invoice;
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice> {
    const [invoice] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return invoice;
  }

  // Audit Logs
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  async getAuditLogs(tenantId: number, limit = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  // DataJud Sync Logs
  async createDatajudSyncLog(data: InsertDatajudSyncLog): Promise<DatajudSyncLog> {
    const [log] = await db.insert(datajudSyncLogs).values(data).returning();
    return log;
  }

  async getDatajudSyncLogs(caseId: number): Promise<DatajudSyncLog[]> {
    return db.select().from(datajudSyncLogs).where(eq(datajudSyncLogs.caseId, caseId)).orderBy(desc(datajudSyncLogs.syncedAt));
  }

  // AI Generation Logs
  async createAiGenerationLog(data: InsertAiGenerationLog): Promise<AiGenerationLog> {
    const [log] = await db.insert(aiGenerationLogs).values(data).returning();
    return log;
  }

  async getAiGenerationLogs(tenantId: number): Promise<AiGenerationLog[]> {
    return db.select().from(aiGenerationLogs).where(eq(aiGenerationLogs.tenantId, tenantId)).orderBy(desc(aiGenerationLogs.createdAt));
  }

  // Conversations
  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationsByTenant(tenantId: number): Promise<Conversation[]> {
    return db.select().from(conversations).where(eq(conversations.tenantId, tenantId)).orderBy(desc(conversations.createdAt));
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values(data).returning();
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Messages
  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  // Dashboard Stats
  async getDashboardStats(tenantId: number): Promise<{
    urgentDeadlines: number;
    activeCases: number;
    monthlyBilling: string;
    newCasesThisMonth: number;
  }> {
    const now = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [urgentCount] = await db.select({ count: sql<number>`count(*)` })
      .from(deadlines)
      .where(and(
        eq(deadlines.tenantId, tenantId),
        eq(deadlines.status, "pendente"),
        lte(deadlines.dueDate, threeDaysLater)
      ));

    const [activeCount] = await db.select({ count: sql<number>`count(*)` })
      .from(cases)
      .where(and(
        eq(cases.tenantId, tenantId),
        eq(cases.status, "ativo")
      ));

    const [newCasesCount] = await db.select({ count: sql<number>`count(*)` })
      .from(cases)
      .where(and(
        eq(cases.tenantId, tenantId),
        gte(cases.createdAt, startOfMonth)
      ));

    const [billingSum] = await db.select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.referenceMonth, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
      ));

    return {
      urgentDeadlines: Number(urgentCount?.count) || 0,
      activeCases: Number(activeCount?.count) || 0,
      monthlyBilling: `R$ ${Number(billingSum?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      newCasesThisMonth: Number(newCasesCount?.count) || 0,
    };
  }
}

export const storage = new DatabaseStorage();
