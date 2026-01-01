import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== TENANTS (Multi-tenant) ====================
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("starter"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// ==================== USERS (RBAC) ====================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("advogado"),
  oabNumber: text("oab_number"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ==================== CLIENTS ====================
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  type: text("type").notNull(),
  name: text("name").notNull(),
  document: text("document").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  bindingDocumentHash: text("binding_document_hash"),
  bindingDocumentPath: text("binding_document_path"),
  status: text("status").notNull().default("ativo"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ==================== CONTRACTS ====================
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  type: text("type").notNull(),
  description: text("description"),
  monthlyValue: decimal("monthly_value", { precision: 12, scale: 2 }),
  successFeePercent: decimal("success_fee_percent", { precision: 5, scale: 2 }),
  adjustmentIndex: text("adjustment_index"),
  nextAdjustmentDate: timestamp("next_adjustment_date"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("ativo"),
  documentPath: text("document_path"),
  documentHash: text("document_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

// ==================== CASES (Processos) ====================
export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  contractId: integer("contract_id").references(() => contracts.id),
  caseNumber: text("case_number").notNull(),
  title: text("title").notNull(),
  caseType: text("case_type").notNull(),
  court: text("court").notNull(),
  judge: text("judge"),
  caseClass: text("case_class"),
  subject: text("subject"),
  distributionDate: timestamp("distribution_date"),
  status: text("status").notNull().default("ativo"),
  riskLevel: text("risk_level"),
  estimatedValue: decimal("estimated_value", { precision: 15, scale: 2 }),
  tags: text("tags").array(),
  responsibleUserId: integer("responsible_user_id").references(() => users.id),
  datajudId: text("datajud_id"),
  datajudLastSync: timestamp("datajud_last_sync"),
  datajudPayloadHash: text("datajud_payload_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertCaseSchema = createInsertSchema(cases).omit({ id: true, createdAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

// ==================== CASE MOVEMENTS ====================
export const caseMovements = pgTable("case_movements", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  date: timestamp("date").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  datajudCode: text("datajud_code"),
  datajudPayload: jsonb("datajud_payload"),
  requiresAction: boolean("requires_action").default(false),
  actionDeadline: timestamp("action_deadline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaseMovementSchema = createInsertSchema(caseMovements).omit({ id: true, createdAt: true });
export type InsertCaseMovement = z.infer<typeof insertCaseMovementSchema>;
export type CaseMovement = typeof caseMovements.$inferSelect;

// ==================== DEADLINES ====================
export const deadlines = pgTable("deadlines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  caseId: integer("case_id").references(() => cases.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date").notNull(),
  type: text("type").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("pendente"),
  responsibleUserId: integer("responsible_user_id").references(() => users.id),
  reminderSent: boolean("reminder_sent").default(false),
  sourceMovementId: integer("source_movement_id").references(() => caseMovements.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertDeadlineSchema = createInsertSchema(deadlines).omit({ id: true, createdAt: true });
export type InsertDeadline = z.infer<typeof insertDeadlineSchema>;
export type Deadline = typeof deadlines.$inferSelect;

// ==================== DOCUMENTS ====================
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  caseId: integer("case_id").references(() => cases.id),
  clientId: integer("client_id").references(() => clients.id),
  title: text("title").notNull(),
  type: text("type").notNull(),
  filePath: text("file_path").notNull(),
  fileHash: text("file_hash").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  version: integer("version").notNull().default(1),
  parentDocumentId: integer("parent_document_id"),
  aiGenerated: boolean("ai_generated").default(false),
  aiPromptUsed: text("ai_prompt_used"),
  aiSourceDocuments: jsonb("ai_source_documents"),
  humanValidated: boolean("human_validated").default(false),
  validatedBy: integer("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ==================== INVOICES ====================
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  contractId: integer("contract_id").notNull().references(() => contracts.id),
  invoiceNumber: text("invoice_number").notNull(),
  referenceMonth: text("reference_month").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("emitida"),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }),
  nfNumber: text("nf_number"),
  nfPath: text("nf_path"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ==================== AUDIT LOGS ====================
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ==================== DATAJUD SYNC LOG ====================
export const datajudSyncLogs = pgTable("datajud_sync_logs", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => cases.id),
  endpoint: text("endpoint").notNull(),
  tribunal: text("tribunal").notNull(),
  requestPayload: jsonb("request_payload"),
  responsePayloadHash: text("response_payload_hash"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  movementsFound: integer("movements_found"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const insertDatajudSyncLogSchema = createInsertSchema(datajudSyncLogs).omit({ id: true, syncedAt: true });
export type InsertDatajudSyncLog = z.infer<typeof insertDatajudSyncLogSchema>;
export type DatajudSyncLog = typeof datajudSyncLogs.$inferSelect;

// ==================== AI GENERATION LOG ====================
export const aiGenerationLogs = pgTable("ai_generation_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  caseId: integer("case_id").references(() => cases.id),
  documentId: integer("document_id").references(() => documents.id),
  generationType: text("generation_type").notNull(),
  prompt: text("prompt").notNull(),
  sourceDocumentIds: jsonb("source_document_ids"),
  citations: jsonb("citations"),
  modelUsed: text("model_used").notNull(),
  tokensUsed: integer("tokens_used"),
  outputPreview: text("output_preview"),
  humanApproved: boolean("human_approved"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiGenerationLogSchema = createInsertSchema(aiGenerationLogs).omit({ id: true, createdAt: true });
export type InsertAiGenerationLog = z.infer<typeof insertAiGenerationLogSchema>;
export type AiGenerationLog = typeof aiGenerationLogs.$inferSelect;

// ==================== CONVERSATIONS (for LexAI Studio) ====================
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  userId: integer("user_id").references(() => users.id),
  caseId: integer("case_id").references(() => cases.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ==================== MESSAGES ====================
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ==================== RELATIONS ====================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  clients: many(clients),
  contracts: many(contracts),
  cases: many(cases),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  tenant: one(tenants, { fields: [clients.tenantId], references: [tenants.id] }),
  contracts: many(contracts),
  cases: many(cases),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  tenant: one(tenants, { fields: [contracts.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [contracts.clientId], references: [clients.id] }),
  cases: many(cases),
  invoices: many(invoices),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  tenant: one(tenants, { fields: [cases.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [cases.clientId], references: [clients.id] }),
  contract: one(contracts, { fields: [cases.contractId], references: [contracts.id] }),
  responsibleUser: one(users, { fields: [cases.responsibleUserId], references: [users.id] }),
  movements: many(caseMovements),
  deadlines: many(deadlines),
  documents: many(documents),
}));

export const caseMovementsRelations = relations(caseMovements, ({ one }) => ({
  case: one(cases, { fields: [caseMovements.caseId], references: [cases.id] }),
}));

export const deadlinesRelations = relations(deadlines, ({ one }) => ({
  tenant: one(tenants, { fields: [deadlines.tenantId], references: [tenants.id] }),
  case: one(cases, { fields: [deadlines.caseId], references: [cases.id] }),
  responsibleUser: one(users, { fields: [deadlines.responsibleUserId], references: [users.id] }),
  sourceMovement: one(caseMovements, { fields: [deadlines.sourceMovementId], references: [caseMovements.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
  case: one(cases, { fields: [documents.caseId], references: [cases.id] }),
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  tenant: one(tenants, { fields: [invoices.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  contract: one(contracts, { fields: [invoices.contractId], references: [contracts.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  case: one(cases, { fields: [conversations.caseId], references: [cases.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));
