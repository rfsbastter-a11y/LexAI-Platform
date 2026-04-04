import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, bigint, boolean, timestamp, decimal, jsonb, date } from "drizzle-orm/pg-core";
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
  phone: text("phone"),
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
  type: text("type").notNull().default("PF"),
  name: text("name").notNull().default(""),
  document: text("document").notNull().default(""),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  bindingDocumentHash: text("binding_document_hash"),
  bindingDocumentPath: text("binding_document_path"),
  status: text("status").notNull().default("ativo"),
  metadata: jsonb("metadata"),
  communicationTone: text("communication_tone").default("auto"),
  secretaryNotes: text("secretary_notes"),
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
  clientId: integer("client_id").references(() => clients.id),
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
  // Campos adicionais do DataJud
  autor: text("autor"),
  reu: text("reu"),
  vara: text("vara"),
  valorCausa: decimal("valor_causa", { precision: 15, scale: 2 }),
  classeNome: text("classe_nome"),
  assuntos: text("assuntos").array(),
  isOwnCase: boolean("is_own_case").default(true).notNull(),
  isStrategic: boolean("is_strategic").default(false).notNull(),
  adversePartyName: text("adverse_party_name"),
  adversePartyDocument: text("adverse_party_document"),
  adversePartyAddress: text("adverse_party_address"),
  adversePartyRepresentative: text("adverse_party_representative"),
  adversePartyLawyer: text("adverse_party_lawyer"),
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
  teor: text("teor"),
  source: text("source").notNull(),
  datajudCode: text("datajud_code"),
  datajudPayload: jsonb("datajud_payload"),
  requiresAction: boolean("requires_action").default(false),
  actionDeadline: timestamp("action_deadline"),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  aiDeadlineDays: integer("ai_deadline_days"),
  aiDeadlineType: text("ai_deadline_type"),
  aiDeadlineDate: text("ai_deadline_date"),
  aiPublicacaoDate: text("ai_publicacao_date"),
  aiInicioPrazoDate: text("ai_inicio_prazo_date"),
  aiDeadlineStatus: text("ai_deadline_status"),
  aiLegalBasis: text("ai_legal_basis"),
  aiSuggestedPiece: text("ai_suggested_piece"),
  aiDeadlineSummary: text("ai_deadline_summary"),
  aiClassification: text("ai_classification"),
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: integer("acknowledged_by"),
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
  debtorId: integer("debtor_id"),
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

// ==================== NOTAS FISCAIS (standalone) ====================
export const notasFiscais = pgTable("notas_fiscais", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  clientId: integer("client_id").references(() => clients.id),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  nfNumber: text("nf_number"),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  description: text("description"),
  referenceMonth: text("reference_month"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertNotaFiscalSchema = createInsertSchema(notasFiscais).omit({ id: true, createdAt: true });
export type InsertNotaFiscal = z.infer<typeof insertNotaFiscalSchema>;
export type NotaFiscal = typeof notasFiscais.$inferSelect;

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
  // Harvey-technique fields
  fullPrompt: text("full_prompt"),          // prompt completo (system + user)
  fullOutput: text("full_output"),          // output completo do LLM
  ragContext: jsonb("rag_context"),          // peças similares recuperadas
  generatedPieceId: integer("generated_piece_id").references(() => generatedPieces.id),
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

// ==================== AGENDA EVENTS ====================
export const agendaEvents = pgTable("agenda_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  caseId: integer("case_id").references(() => cases.id),
  clientId: integer("client_id").references(() => clients.id),
  title: text("title").notNull(),
  type: text("type").notNull().default("Compromisso"), // Audiência, Prazo, Compromisso, Reunião
  date: text("date").notNull(), // YYYY-MM-DD format
  timeStart: text("time_start").notNull(),
  timeEnd: text("time_end"),
  responsible: text("responsible").notNull().default("Dr. Ronald Serra"),
  description: text("description"),
  sourceType: text("source_type").notNull().default("manual"), // manual, datajud, deadline
  sourceId: text("source_id"), // ID from source (movement id, deadline id)
  status: text("status").notNull().default("agendado"), // agendado, concluido, cancelado
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgendaEventSchema = createInsertSchema(agendaEvents).omit({ id: true, createdAt: true });
export type InsertAgendaEvent = z.infer<typeof insertAgendaEventSchema>;
export type AgendaEvent = typeof agendaEvents.$inferSelect;

// ==================== WHATSAPP CONFIG ====================
export const whatsappConfig = pgTable("whatsapp_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  phoneNumber: text("phone_number").notNull(),
  contactName: text("contact_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWhatsappConfigSchema = createInsertSchema(whatsappConfig).omit({ id: true, createdAt: true });
export type InsertWhatsappConfig = z.infer<typeof insertWhatsappConfigSchema>;
export type WhatsappConfig = typeof whatsappConfig.$inferSelect;

// ==================== WHATSAPP MESSAGES ====================
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  jid: text("jid").notNull(),
  direction: text("direction").notNull().default("incoming"),
  content: text("content").notNull(),
  messageId: text("message_id"),
  senderName: text("sender_name"),
  senderNumber: text("sender_number"),
  mediaType: text("media_type"),
  isRead: boolean("is_read").notNull().default(false),
  messageProto: text("message_proto"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({ id: true, createdAt: true });
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;

// ==================== WHATSAPP LID MAP ====================
export const whatsappLidMap = pgTable("whatsapp_lid_map", {
  lid: text("lid").primaryKey(),
  phone: text("phone").notNull().unique(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type WhatsappLidMap = typeof whatsappLidMap.$inferSelect;

// ==================== WHATSAPP SCHEDULE ====================
export const whatsappSchedule = pgTable("whatsapp_schedule", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  sendTime: text("send_time").notNull().default("07:00"), // HH:MM format
  isActive: boolean("is_active").notNull().default(true),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWhatsappScheduleSchema = createInsertSchema(whatsappSchedule).omit({ id: true, createdAt: true });
export type InsertWhatsappSchedule = z.infer<typeof insertWhatsappScheduleSchema>;
export type WhatsappSchedule = typeof whatsappSchedule.$inferSelect;

// ==================== SECRETARY CONFIG ====================
export const secretaryConfig = pgTable("secretary_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  mode: text("mode").notNull().default("semi_auto"),
  systemPrompt: text("system_prompt").notNull().default(""),
  businessHoursStart: text("business_hours_start").notNull().default("08:00"),
  businessHoursEnd: text("business_hours_end").notNull().default("18:00"),
  workOnWeekends: boolean("work_on_weekends").notNull().default(false),
  offHoursMessage: text("off_hours_message").notNull().default("Obrigada pelo contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve."),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSecretaryConfigSchema = createInsertSchema(secretaryConfig).omit({ id: true, createdAt: true });
export type InsertSecretaryConfig = z.infer<typeof insertSecretaryConfigSchema>;
export type SecretaryConfig = typeof secretaryConfig.$inferSelect;

// ==================== SECRETARY ACTION LOG ====================
export const secretaryActions = pgTable("secretary_actions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  jid: text("jid").notNull(),
  contactName: text("contact_name"),
  actionType: text("action_type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("completed"),
  draftMessage: text("draft_message"),
  pendingAction: jsonb("pending_action"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertSecretaryActionSchema = createInsertSchema(secretaryActions).omit({ id: true });
export type InsertSecretaryAction = z.infer<typeof insertSecretaryActionSchema>;
export type SecretaryAction = typeof secretaryActions.$inferSelect;

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

export const agendaEventsRelations = relations(agendaEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [agendaEvents.tenantId], references: [tenants.id] }),
  case: one(cases, { fields: [agendaEvents.caseId], references: [cases.id] }),
  client: one(clients, { fields: [agendaEvents.clientId], references: [clients.id] }),
}));

// ==================== EMAIL FOLDERS ====================
export const emailFolders = pgTable("email_folders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  imapPath: text("imap_path").notNull(),
  type: text("type").notNull().default("custom"), // inbox, sent, drafts, trash, spam, custom
  unreadCount: integer("unread_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  lastSync: timestamp("last_sync"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailFolderSchema = createInsertSchema(emailFolders).omit({ id: true, createdAt: true });
export type InsertEmailFolder = z.infer<typeof insertEmailFolderSchema>;
export type EmailFolder = typeof emailFolders.$inferSelect;

// ==================== EMAILS ====================
export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  folderId: integer("folder_id").notNull().references(() => emailFolders.id),
  messageId: text("message_id").notNull(),
  uid: integer("uid"),
  subject: text("subject"),
  fromAddress: text("from_address"),
  fromName: text("from_name"),
  toAddresses: jsonb("to_addresses").$type<string[]>(),
  ccAddresses: jsonb("cc_addresses").$type<string[]>(),
  bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  date: timestamp("date").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  priority: text("priority").default("normal"), // low, normal, high
  inReplyTo: text("in_reply_to"),
  references: jsonb("references").$type<string[]>(),
  caseId: integer("case_id").references(() => cases.id),
  clientId: integer("client_id").references(() => clients.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailSchema = createInsertSchema(emails).omit({ id: true, createdAt: true });
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type Email = typeof emails.$inferSelect;

// ==================== EMAIL ATTACHMENTS ====================
export const emailAttachments = pgTable("email_attachments", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  storagePath: text("storage_path"),
  contentId: text("content_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailAttachmentSchema = createInsertSchema(emailAttachments).omit({ id: true, createdAt: true });
export type InsertEmailAttachment = z.infer<typeof insertEmailAttachmentSchema>;
export type EmailAttachment = typeof emailAttachments.$inferSelect;

// ==================== EMAIL DRAFTS ====================
export const emailDrafts = pgTable("email_drafts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  toAddresses: jsonb("to_addresses").$type<string[]>(),
  ccAddresses: jsonb("cc_addresses").$type<string[]>(),
  bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
  subject: text("subject"),
  bodyHtml: text("body_html"),
  inReplyTo: integer("in_reply_to").references(() => emails.id),
  caseId: integer("case_id").references(() => cases.id),
  clientId: integer("client_id").references(() => clients.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmailDraftSchema = createInsertSchema(emailDrafts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailDraft = z.infer<typeof insertEmailDraftSchema>;
export type EmailDraft = typeof emailDrafts.$inferSelect;

// ==================== EMAIL RELATIONS ====================
export const emailFoldersRelations = relations(emailFolders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [emailFolders.tenantId], references: [tenants.id] }),
  emails: many(emails),
}));

export const emailsRelations = relations(emails, ({ one, many }) => ({
  tenant: one(tenants, { fields: [emails.tenantId], references: [tenants.id] }),
  folder: one(emailFolders, { fields: [emails.folderId], references: [emailFolders.id] }),
  case: one(cases, { fields: [emails.caseId], references: [cases.id] }),
  client: one(clients, { fields: [emails.clientId], references: [clients.id] }),
  attachments: many(emailAttachments),
}));

export const emailAttachmentsRelations = relations(emailAttachments, ({ one }) => ({
  email: one(emails, { fields: [emailAttachments.emailId], references: [emails.id] }),
}));

export const emailDraftsRelations = relations(emailDrafts, ({ one }) => ({
  tenant: one(tenants, { fields: [emailDrafts.tenantId], references: [tenants.id] }),
  inReplyToEmail: one(emails, { fields: [emailDrafts.inReplyTo], references: [emails.id] }),
  case: one(cases, { fields: [emailDrafts.caseId], references: [cases.id] }),
  client: one(clients, { fields: [emailDrafts.clientId], references: [clients.id] }),
}));

// ==================== LEXAI STUDIO - DOCUMENT TEMPLATES ====================
export const documentTemplates = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  contentHtml: text("content_html").notNull(),
  variables: jsonb("variables"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;

// ==================== LEXAI STUDIO - GENERATED PIECES ====================
export const generatedPieces = pgTable("generated_pieces", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  caseId: integer("case_id").references(() => cases.id),
  templateId: integer("template_id").references(() => documentTemplates.id),
  title: text("title").notNull(),
  pieceType: text("piece_type").notNull(),
  prompt: text("prompt"),
  contentHtml: text("content_html").notNull(),
  contentText: text("content_text"),
  jurisprudences: jsonb("jurisprudences"),
  doctrines: jsonb("doctrines"),
  createdBy: integer("created_by").references(() => users.id),
  // Harvey-technique fields
  humanApproved: boolean("human_approved").default(false),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  ragPiecesUsed: jsonb("rag_pieces_used"), // IDs das peças similares usadas como contexto
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGeneratedPieceSchema = createInsertSchema(generatedPieces).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGeneratedPiece = z.infer<typeof insertGeneratedPieceSchema>;
export type GeneratedPiece = typeof generatedPieces.$inferSelect;

// ==================== LEXAI STUDIO - LETTERHEAD CONFIG ====================
export const letterheadConfigs = pgTable("letterhead_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id).unique(),
  firmName: text("firm_name").notNull(),
  logoUrl: text("logo_url"),
  headerHtml: text("header_html"),
  footerHtml: text("footer_html"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  oabInfo: text("oab_info"),
  primaryColor: text("primary_color").default("#1e3a5f"),
  secondaryColor: text("secondary_color").default("#c9a227"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLetterheadConfigSchema = createInsertSchema(letterheadConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLetterheadConfig = z.infer<typeof insertLetterheadConfigSchema>;
export type LetterheadConfig = typeof letterheadConfigs.$inferSelect;

// ==================== LEXAI STUDIO RELATIONS ====================
export const documentTemplatesRelations = relations(documentTemplates, ({ one, many }) => ({
  tenant: one(tenants, { fields: [documentTemplates.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [documentTemplates.createdBy], references: [users.id] }),
  generatedPieces: many(generatedPieces),
}));

export const generatedPiecesRelations = relations(generatedPieces, ({ one }) => ({
  tenant: one(tenants, { fields: [generatedPieces.tenantId], references: [tenants.id] }),
  case: one(cases, { fields: [generatedPieces.caseId], references: [cases.id] }),
  template: one(documentTemplates, { fields: [generatedPieces.templateId], references: [documentTemplates.id] }),
  createdByUser: one(users, { fields: [generatedPieces.createdBy], references: [users.id] }),
}));

export const letterheadConfigsRelations = relations(letterheadConfigs, ({ one }) => ({
  tenant: one(tenants, { fields: [letterheadConfigs.tenantId], references: [tenants.id] }),
}));

// ==================== DEBTORS (Devedores) ====================
export const debtors = pgTable("debtors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  type: text("type").notNull().default("PF"),
  name: text("name").notNull(),
  document: text("document"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  notes: text("notes"),
  totalDebt: decimal("total_debt", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("ativo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDebtorSchema = createInsertSchema(debtors).omit({ id: true, createdAt: true });
export type InsertDebtor = z.infer<typeof insertDebtorSchema>;
export type Debtor = typeof debtors.$inferSelect;

export const debtorsRelations = relations(debtors, ({ one, many }) => ({
  tenant: one(tenants, { fields: [debtors.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [debtors.clientId], references: [clients.id] }),
  agreements: many(debtorAgreements),
}));

// ==================== DEBTOR AGREEMENTS (Acordos) ====================
export const debtorAgreements = pgTable("debtor_agreements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  debtorId: integer("debtor_id").notNull().references(() => debtors.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  agreementDate: date("agreement_date").notNull(),
  originalDebtValue: decimal("original_debt_value", { precision: 12, scale: 2 }),
  agreedValue: decimal("agreed_value", { precision: 12, scale: 2 }),
  isSinglePayment: boolean("is_single_payment").notNull().default(false),
  installmentsCount: integer("installments_count"),
  downPaymentValue: decimal("down_payment_value", { precision: 12, scale: 2 }),
  downPaymentDate: date("down_payment_date"),
  installmentValue: decimal("installment_value", { precision: 12, scale: 2 }),
  dueDay: integer("due_day"),
  feePercent: decimal("fee_percent", { precision: 5, scale: 2 }).default("10"),
  feeAmount: decimal("fee_amount", { precision: 12, scale: 2 }),
  feeStatus: text("fee_status").notNull().default("pendente"),
  status: text("status").notNull().default("ativo"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDebtorAgreementSchema = createInsertSchema(debtorAgreements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDebtorAgreement = z.infer<typeof insertDebtorAgreementSchema>;
export type DebtorAgreement = typeof debtorAgreements.$inferSelect;

export const debtorAgreementsRelations = relations(debtorAgreements, ({ one }) => ({
  tenant: one(tenants, { fields: [debtorAgreements.tenantId], references: [tenants.id] }),
  debtor: one(debtors, { fields: [debtorAgreements.debtorId], references: [debtors.id] }),
  client: one(clients, { fields: [debtorAgreements.clientId], references: [clients.id] }),
}));

// ==================== NEGOTIATIONS ====================
export const negotiations = pgTable("negotiations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  caseId: integer("case_id").references(() => cases.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  debtorId: integer("debtor_id").references(() => debtors.id),
  status: text("status").notNull().default("rascunho"),
  negotiationMode: text("negotiation_mode").notNull().default("semi_automatico"),
  minValue: decimal("min_value", { precision: 12, scale: 2 }),
  maxValue: decimal("max_value", { precision: 12, scale: 2 }),
  currentProposalValue: decimal("current_proposal_value", { precision: 12, scale: 2 }),
  minDownPaymentPercent: integer("min_down_payment_percent"),
  maxInstallments: integer("max_installments"),
  maxInstallmentMonths: integer("max_installment_months"),
  mandatoryConditions: text("mandatory_conditions"),
  strategy: text("strategy").default("moderada"),
  conditions: text("conditions"),
  deadline: timestamp("deadline"),
  aiAnalysis: text("ai_analysis"),
  aiRiskScore: text("ai_risk_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertNegotiationSchema = createInsertSchema(negotiations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNegotiation = z.infer<typeof insertNegotiationSchema>;
export type Negotiation = typeof negotiations.$inferSelect;

// ==================== NEGOTIATION CONTACTS ====================
export const negotiationContacts = pgTable("negotiation_contacts", {
  id: serial("id").primaryKey(),
  negotiationId: integer("negotiation_id").notNull().references(() => negotiations.id),
  name: text("name").notNull(),
  role: text("role").notNull().default("devedor"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  phone: text("phone"),
  document: text("document"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNegotiationContactSchema = createInsertSchema(negotiationContacts).omit({ id: true, createdAt: true });
export type InsertNegotiationContact = z.infer<typeof insertNegotiationContactSchema>;
export type NegotiationContact = typeof negotiationContacts.$inferSelect;

// ==================== NEGOTIATION ROUNDS ====================
export const negotiationRounds = pgTable("negotiation_rounds", {
  id: serial("id").primaryKey(),
  negotiationId: integer("negotiation_id").notNull().references(() => negotiations.id),
  contactId: integer("contact_id").references(() => negotiationContacts.id),
  type: text("type").notNull().default("proposta"),
  value: decimal("value", { precision: 12, scale: 2 }),
  conditions: text("conditions"),
  message: text("message"),
  proposalHtml: text("proposal_html"),
  sentViaEmail: boolean("sent_via_email").default(false),
  sentViaWhatsapp: boolean("sent_via_whatsapp").default(false),
  sentAt: timestamp("sent_at"),
  response: text("response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertNegotiationRoundSchema = createInsertSchema(negotiationRounds).omit({ id: true, createdAt: true });
export type InsertNegotiationRound = z.infer<typeof insertNegotiationRoundSchema>;
export type NegotiationRound = typeof negotiationRounds.$inferSelect;

// ==================== NEGOTIATION RELATIONS ====================
export const negotiationsRelations = relations(negotiations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [negotiations.tenantId], references: [tenants.id] }),
  case: one(cases, { fields: [negotiations.caseId], references: [cases.id] }),
  client: one(clients, { fields: [negotiations.clientId], references: [clients.id] }),
  debtor: one(debtors, { fields: [negotiations.debtorId], references: [debtors.id] }),
  createdByUser: one(users, { fields: [negotiations.createdBy], references: [users.id] }),
  contacts: many(negotiationContacts),
  rounds: many(negotiationRounds),
}));

export const negotiationContactsRelations = relations(negotiationContacts, ({ one }) => ({
  negotiation: one(negotiations, { fields: [negotiationContacts.negotiationId], references: [negotiations.id] }),
}));

export const negotiationRoundsRelations = relations(negotiationRounds, ({ one }) => ({
  negotiation: one(negotiations, { fields: [negotiationRounds.negotiationId], references: [negotiations.id] }),
  contact: one(negotiationContacts, { fields: [negotiationRounds.contactId], references: [negotiationContacts.id] }),
  createdByUser: one(users, { fields: [negotiationRounds.createdBy], references: [users.id] }),
}));

// ==================== PROSPECTION PLANS ====================
export const prospectionPlans = pgTable("prospection_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  thesis: text("thesis").notNull(),
  sector: text("sector"),
  region: text("region"),
  serviceType: text("service_type"),
  targetCompanies: text("target_companies"),
  status: text("status").notNull().default("rascunho"),
  aiPlan: text("ai_plan"),
  aiCompanies: jsonb("ai_companies"),
  totalLeads: integer("total_leads").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProspectionPlanSchema = createInsertSchema(prospectionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProspectionPlan = z.infer<typeof insertProspectionPlanSchema>;
export type ProspectionPlan = typeof prospectionPlans.$inferSelect;

// ==================== PROSPECTION LEADS ====================
export const prospectionLeads = pgTable("prospection_leads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planId: integer("plan_id").notNull().references(() => prospectionPlans.id),
  companyName: text("company_name").notNull(),
  companySector: text("company_sector"),
  companySize: text("company_size"),
  companyLocation: text("company_location"),
  companyWebsite: text("company_website"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  decisionMakers: jsonb("decision_makers"),
  companyProfile: text("company_profile"),
  compatibilityScore: integer("compatibility_score"),
  painPoints: jsonb("pain_points"),
  competitors: jsonb("competitors"),
  partnerFirms: jsonb("partner_firms"),
  competitorStrategy: text("competitor_strategy"),
  partnerProposal: text("partner_proposal"),
  priority: integer("priority").notNull().default(3),
  pipelineStatus: text("pipeline_status").notNull().default("identificado"),
  notes: text("notes"),
  aiStrategy: text("ai_strategy"),
  aiMessages: jsonb("ai_messages"),
  networkConnectionId: integer("network_connection_id").references(() => prospectionNetwork.id),
  networkPath: text("network_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProspectionLeadSchema = createInsertSchema(prospectionLeads).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProspectionLead = z.infer<typeof insertProspectionLeadSchema>;
export type ProspectionLead = typeof prospectionLeads.$inferSelect;

// ==================== PROSPECTION MESSAGES ====================
export const prospectionMessages = pgTable("prospection_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  leadId: integer("lead_id").notNull().references(() => prospectionLeads.id),
  channel: text("channel").notNull(),
  recipientName: text("recipient_name"),
  recipientContact: text("recipient_contact"),
  content: text("content").notNull(),
  status: text("status").notNull().default("rascunho"),
  sentAt: timestamp("sent_at"),
  response: text("response"),
  respondedAt: timestamp("responded_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProspectionMessageSchema = createInsertSchema(prospectionMessages).omit({ id: true, createdAt: true });
export type InsertProspectionMessage = z.infer<typeof insertProspectionMessageSchema>;
export type ProspectionMessage = typeof prospectionMessages.$inferSelect;

// ==================== PROSPECTION NETWORK (Rede de Contatos) ====================
export const prospectionNetwork = pgTable("prospection_network", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  platform: text("platform").notNull().default("linkedin"),
  name: text("name").notNull(),
  company: text("company"),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  linkedin: text("linkedin"),
  instagram: text("instagram"),
  relationship: text("relationship"),
  notes: text("notes"),
  tags: text("tags"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProspectionNetworkSchema = createInsertSchema(prospectionNetwork).omit({ id: true, createdAt: true });
export type InsertProspectionNetwork = z.infer<typeof insertProspectionNetworkSchema>;
export type ProspectionNetwork = typeof prospectionNetwork.$inferSelect;

// ==================== PROSPECTION CHAT MESSAGES ====================
export const prospectionChatMessages = pgTable("prospection_chat_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  planId: integer("plan_id").references(() => prospectionPlans.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProspectionChatMessageSchema = createInsertSchema(prospectionChatMessages).omit({ id: true, createdAt: true });
export type InsertProspectionChatMessage = z.infer<typeof insertProspectionChatMessageSchema>;
export type ProspectionChatMessage = typeof prospectionChatMessages.$inferSelect;

// ==================== PROSPECTION RELATIONS ====================
export const prospectionPlansRelations = relations(prospectionPlans, ({ one, many }) => ({
  tenant: one(tenants, { fields: [prospectionPlans.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [prospectionPlans.createdBy], references: [users.id] }),
  leads: many(prospectionLeads),
}));

export const prospectionLeadsRelations = relations(prospectionLeads, ({ one, many }) => ({
  tenant: one(tenants, { fields: [prospectionLeads.tenantId], references: [tenants.id] }),
  plan: one(prospectionPlans, { fields: [prospectionLeads.planId], references: [prospectionPlans.id] }),
  networkConnection: one(prospectionNetwork, { fields: [prospectionLeads.networkConnectionId], references: [prospectionNetwork.id] }),
  messages: many(prospectionMessages),
}));

export const prospectionMessagesRelations = relations(prospectionMessages, ({ one }) => ({
  tenant: one(tenants, { fields: [prospectionMessages.tenantId], references: [tenants.id] }),
  lead: one(prospectionLeads, { fields: [prospectionMessages.leadId], references: [prospectionLeads.id] }),
  createdByUser: one(users, { fields: [prospectionMessages.createdBy], references: [users.id] }),
}));

export const prospectionNetworkRelations = relations(prospectionNetwork, ({ one }) => ({
  tenant: one(tenants, { fields: [prospectionNetwork.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [prospectionNetwork.createdBy], references: [users.id] }),
}));

export const prospectionChatMessagesRelations = relations(prospectionChatMessages, ({ one }) => ({
  tenant: one(tenants, { fields: [prospectionChatMessages.tenantId], references: [tenants.id] }),
  plan: one(prospectionPlans, { fields: [prospectionChatMessages.planId], references: [prospectionPlans.id] }),
  createdByUser: one(users, { fields: [prospectionChatMessages.createdBy], references: [users.id] }),
}));

// ==================== MEETINGS (Copiloto de Reuniões) ====================
export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  platform: text("platform").notNull().default("google_meet"),
  legalRole: text("legal_role").notNull().default("consultoria"),
  status: text("status").notNull().default("setup"),
  clientId: integer("client_id").references(() => clients.id),
  caseId: integer("case_id").references(() => cases.id),
  summary: text("summary"),
  decisions: jsonb("decisions"),
  actions: jsonb("actions"),
  risks: jsonb("risks"),
  nextSteps: jsonb("next_steps"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({ id: true, createdAt: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

export const meetingParticipants = pgTable("meeting_participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingParticipantSchema = createInsertSchema(meetingParticipants).omit({ id: true, createdAt: true });
export type InsertMeetingParticipant = z.infer<typeof insertMeetingParticipantSchema>;
export type MeetingParticipant = typeof meetingParticipants.$inferSelect;

export const meetingUtterances = pgTable("meeting_utterances", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  speakerName: text("speaker_name"),
  text: text("text").notNull(),
  timestampMs: bigint("timestamp_ms", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingUtteranceSchema = createInsertSchema(meetingUtterances).omit({ id: true, createdAt: true });
export type InsertMeetingUtterance = z.infer<typeof insertMeetingUtteranceSchema>;
export type MeetingUtterance = typeof meetingUtterances.$inferSelect;

export const meetingInsights = pgTable("meeting_insights", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("insight"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingInsightSchema = createInsertSchema(meetingInsights).omit({ id: true, createdAt: true });
export type InsertMeetingInsight = z.infer<typeof insertMeetingInsightSchema>;
export type MeetingInsight = typeof meetingInsights.$inferSelect;

export const meetingChatMessages = pgTable("meeting_chat_messages", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingChatMessageSchema = createInsertSchema(meetingChatMessages).omit({ id: true, createdAt: true });
export type InsertMeetingChatMessage = z.infer<typeof insertMeetingChatMessageSchema>;
export type MeetingChatMessage = typeof meetingChatMessages.$inferSelect;

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  tenant: one(tenants, { fields: [meetings.tenantId], references: [tenants.id] }),
  client: one(clients, { fields: [meetings.clientId], references: [clients.id] }),
  case: one(cases, { fields: [meetings.caseId], references: [cases.id] }),
  createdByUser: one(users, { fields: [meetings.createdBy], references: [users.id] }),
  participants: many(meetingParticipants),
  utterances: many(meetingUtterances),
  insights: many(meetingInsights),
  chatMessages: many(meetingChatMessages),
}));

export const meetingParticipantsRelations = relations(meetingParticipants, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingParticipants.meetingId], references: [meetings.id] }),
}));

export const meetingUtterancesRelations = relations(meetingUtterances, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingUtterances.meetingId], references: [meetings.id] }),
}));

export const meetingInsightsRelations = relations(meetingInsights, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingInsights.meetingId], references: [meetings.id] }),
}));

export const meetingChatMessagesRelations = relations(meetingChatMessages, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingChatMessages.meetingId], references: [meetings.id] }),
}));

// ==================== WHATSAPP AUTH STATE (Persistent credentials) ====================
export const whatsappAuthState = pgTable("whatsapp_auth_state", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  key: text("key").notNull(),
  value: jsonb("value"),
});

// ==================== HARVEY TECHNIQUES: CORPUS PÚBLICO JURÍDICO ====================
// Documentos públicos da AGU (4 carreiras) e outras fontes para RAG e fine-tuning
export const legalCorpusDocuments = pgTable("legal_corpus_documents", {
  id: serial("id").primaryKey(),
  // SHA-256 do texto extraído — deduplicação
  hash: text("hash").unique(),
  // Carreira AGU: 'advogado_uniao' | 'procurador_federal' | 'pgfn' | 'pgbc'
  career: text("career").notNull(),
  // Entidade específica para Procurador Federal: 'CADE' | 'ANEEL' | 'ANP' | 'INSS' etc.
  entity: text("entity"),
  // Fonte: 'agu_decor' | 'agu_conuni' | 'agu_legis' | 'pgfn_dadosabertos' | 'pgbc_revista' | 'pfe_cade' etc.
  source: text("source").notNull(),
  // Tipo: 'parecer' | 'nota_tecnica' | 'orientacao_normativa' | 'parecer_referencial'
  docType: text("doc_type").notNull(),
  docNumber: text("doc_number"),
  title: text("title"),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  publishedAt: timestamp("published_at"),
  // Campos adicionados pela ingestão via SerpAPI
  institution: text("institution"),
  tribunal: text("tribunal"),
  legalArea: text("legal_area"),
  qualityScore: integer("quality_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLegalCorpusDocumentSchema = createInsertSchema(legalCorpusDocuments).omit({ id: true, createdAt: true });
export type InsertLegalCorpusDocument = z.infer<typeof insertLegalCorpusDocumentSchema>;
export type LegalCorpusDocument = typeof legalCorpusDocuments.$inferSelect;

export type WhatsappAuthState = typeof whatsappAuthState.$inferSelect;
