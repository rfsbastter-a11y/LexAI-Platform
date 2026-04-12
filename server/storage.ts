import { db } from "./db";
import { eq, desc, and, or, gte, lte, sql, inArray, isNull, isNotNull, asc } from "drizzle-orm";
import {
  tenants, users, clients, contracts, cases, caseMovements,
  deadlines, documents, invoices, auditLogs, datajudSyncLogs,
  aiGenerationLogs, conversations, messages,
  emailFolders, emails, emailAttachments, emailDrafts,
  documentTemplates, generatedPieces, letterheadConfigs,
  agendaEvents, whatsappConfig, whatsappSchedule, whatsappMessages,
  secretaryConfig, secretaryActions, secretaryDelegatedTasks,
  agentRuns, agentSteps,
  type InsertTenant, type Tenant,
  type InsertUser, type User,
  type InsertClient, type Client,
  type InsertContract, type Contract,
  type InsertCase, type Case,
  type InsertCaseMovement, type CaseMovement,
  type InsertDeadline, type Deadline,
  type InsertDocument, type Document,
  type InsertInvoice, type Invoice,
  notasFiscais, type InsertNotaFiscal, type NotaFiscal,
  type InsertAuditLog, type AuditLog,
  type InsertDatajudSyncLog, type DatajudSyncLog,
  type InsertAiGenerationLog, type AiGenerationLog,
  type InsertConversation, type Conversation,
  type InsertMessage, type Message,
  type InsertEmailFolder, type EmailFolder,
  type InsertEmail, type Email,
  type InsertEmailAttachment, type EmailAttachment,
  type InsertEmailDraft, type EmailDraft,
  type InsertDocumentTemplate, type DocumentTemplate,
  type InsertGeneratedPiece, type GeneratedPiece,
  type InsertLetterheadConfig, type LetterheadConfig,
  type InsertAgendaEvent, type AgendaEvent,
  type InsertWhatsappConfig, type WhatsappConfig,
  type InsertWhatsappSchedule, type WhatsappSchedule,
  type InsertWhatsappMessage, type WhatsappMessage,
  type InsertSecretaryConfig, type SecretaryConfig,
  type InsertSecretaryAction, type SecretaryAction,
  type InsertSecretaryDelegatedTask, type SecretaryDelegatedTask,
  type InsertAgentRun, type AgentRun,
  type InsertAgentStep, type AgentStep,
  debtors,
  type InsertDebtor, type Debtor,
  negotiations, negotiationContacts, negotiationRounds,
  type InsertNegotiation, type Negotiation,
  type InsertNegotiationContact, type NegotiationContact,
  type InsertNegotiationRound, type NegotiationRound,
  prospectionPlans, prospectionLeads, prospectionMessages, prospectionNetwork,
  prospectionChatMessages,
  whatsappLidMap, type WhatsappLidMap,
  meetings, meetingParticipants, meetingUtterances, meetingInsights, meetingChatMessages,
  type InsertMeeting, type Meeting,
  type InsertMeetingParticipant, type MeetingParticipant,
  type InsertMeetingUtterance, type MeetingUtterance,
  type InsertMeetingInsight, type MeetingInsight,
  type InsertMeetingChatMessage, type MeetingChatMessage,
  type InsertProspectionPlan, type ProspectionPlan,
  type InsertProspectionLead, type ProspectionLead,
  type InsertProspectionMessage, type ProspectionMessage,
  type InsertProspectionNetwork, type ProspectionNetwork,
  type InsertProspectionChatMessage, type ProspectionChatMessage,
  debtorAgreements,
  type InsertDebtorAgreement, type DebtorAgreement,
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
  getFirstUserForTenant(tenantId: number): Promise<number>;
  createUser(data: InsertUser): Promise<User>;
  updateUserPhone(id: number, tenantId: number, phone: string | null): Promise<User | undefined>;

  // Clients
  getClient(id: number, tenantId?: number): Promise<Client | undefined>;
  getClientsByTenant(tenantId: number): Promise<Client[]>;
  getClientByPhone(phone: string, tenantId: number): Promise<Client | undefined>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<InsertClient>): Promise<Client>;

  deleteClient(id: number): Promise<void>;
  deleteAllClientDependencies(clientId: number): Promise<void>;

  // Contracts
  getContract(id: number, tenantId?: number): Promise<Contract | undefined>;
  getContractsByTenant(tenantId: number): Promise<Contract[]>;
  getContractsByClient(clientId: number): Promise<Contract[]>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(id: number, data: Partial<InsertContract>): Promise<Contract>;
  deleteContract(id: number): Promise<void>;

  // Cases
  getCase(id: number, tenantId?: number): Promise<Case | undefined>;
  getCaseByNumber(caseNumber: string): Promise<Case | undefined>;
  getCasesByTenant(tenantId: number): Promise<Case[]>;
  getCasesByClient(clientId: number): Promise<Case[]>;
  createCase(data: InsertCase): Promise<Case>;
  updateCase(id: number, data: Partial<InsertCase>, tenantId?: number): Promise<Case>;
  deleteCase(id: number): Promise<void>;
  deleteAllCaseDependencies(caseId: number): Promise<void>;

  // Case Movements
  getCaseMovement(id: number): Promise<CaseMovement | undefined>;
  getCaseMovements(caseId: number): Promise<CaseMovement[]>;
  getIntimacoesByTenant(tenantId: number, onlyOwnCases?: boolean, startDate?: Date, endDate?: Date): Promise<(CaseMovement & { caseNumber: string; caseTitle: string; court: string })[]>;
  getUnreadIntimacaoCount(tenantId: number, onlyOwnCases?: boolean): Promise<number>;
  markMovementAsRead(id: number): Promise<CaseMovement>;
  markAllMovementsAsRead(tenantId: number): Promise<void>;
  createCaseMovement(data: InsertCaseMovement): Promise<CaseMovement>;
  createCaseMovements(data: InsertCaseMovement[]): Promise<CaseMovement[]>;
  deleteCaseMovementsByCaseId(caseId: number): Promise<void>;
  updateMovementDeadlineAnalysis(id: number, data: { aiDeadlineDays: number | null; aiDeadlineType: string | null; aiDeadlineDate: string | null; aiPublicacaoDate?: string | null; aiInicioPrazoDate?: string | null; aiDeadlineStatus: string | null; aiLegalBasis: string | null; aiSuggestedPiece: string | null; aiDeadlineSummary: string | null; aiClassification?: string | null; aiAnalyzedAt: Date; }): Promise<CaseMovement>;
  acknowledgeMovement(id: number, userId: number): Promise<CaseMovement>;
  getUnanalyzedIntimacoes(tenantId: number): Promise<(CaseMovement & { caseNumber: string; caseTitle: string; court: string; classeNome: string | null; vara: string | null })[]>;

  // Deadlines
  getDeadline(id: number): Promise<Deadline | undefined>;
  getDeadlinesByTenant(tenantId: number): Promise<Deadline[]>;
  getUrgentDeadlines(tenantId: number, days: number): Promise<Deadline[]>;
  createDeadline(data: InsertDeadline): Promise<Deadline>;
  updateDeadline(id: number, data: Partial<InsertDeadline>): Promise<Deadline>;
  getDeadlinesByClient(clientId: number): Promise<Deadline[]>;

  // Documents
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsByCase(caseId: number): Promise<Document[]>;
  getDocumentsByClient(clientId: number): Promise<Document[]>;
  getDocumentsByDebtor(debtorId: number): Promise<Document[]>;
  getDocumentsByTenant(tenantId: number): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  // Invoices
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByTenant(tenantId: number): Promise<Invoice[]>;
  getInvoicesByClient(clientId: number): Promise<Invoice[]>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice>;

  // Notas Fiscais (standalone)
  getNotaFiscal(id: number): Promise<NotaFiscal | undefined>;
  getNotasFiscaisByTenant(tenantId: number): Promise<NotaFiscal[]>;
  createNotaFiscal(data: InsertNotaFiscal): Promise<NotaFiscal>;
  deleteNotaFiscal(id: number): Promise<void>;

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

  // Document Templates
  getDocumentTemplate(id: number): Promise<DocumentTemplate | undefined>;
  getDocumentTemplatesByTenant(tenantId: number): Promise<DocumentTemplate[]>;
  createDocumentTemplate(data: InsertDocumentTemplate): Promise<DocumentTemplate>;
  updateDocumentTemplate(id: number, data: Partial<InsertDocumentTemplate>): Promise<DocumentTemplate>;
  deleteDocumentTemplate(id: number): Promise<void>;

  // Generated Pieces
  getGeneratedPiece(id: number): Promise<GeneratedPiece | undefined>;
  getGeneratedPiecesByTenant(tenantId: number): Promise<GeneratedPiece[]>;
  getGeneratedPiecesByCase(caseId: number): Promise<GeneratedPiece[]>;
  createGeneratedPiece(data: InsertGeneratedPiece): Promise<GeneratedPiece>;
  updateGeneratedPiece(id: number, data: Partial<InsertGeneratedPiece>): Promise<GeneratedPiece>;
  deleteGeneratedPiece(id: number): Promise<void>;

  // Letterhead Config
  getLetterheadConfig(tenantId: number): Promise<LetterheadConfig | undefined>;
  createLetterheadConfig(data: InsertLetterheadConfig): Promise<LetterheadConfig>;
  updateLetterheadConfig(tenantId: number, data: Partial<InsertLetterheadConfig>): Promise<LetterheadConfig>;

  // Agenda Events
  getAgendaEventsByDate(tenantId: number, date: string): Promise<AgendaEvent[]>;
  getAgendaEventsByRange(tenantId: number, startDate: string, endDate: string): Promise<AgendaEvent[]>;
  getAgendaEventsByTenant(tenantId: number): Promise<AgendaEvent[]>;
  createAgendaEvent(data: InsertAgendaEvent): Promise<AgendaEvent>;
  updateAgendaEvent(id: number, data: Partial<InsertAgendaEvent>): Promise<AgendaEvent>;
  deleteAgendaEvent(id: number): Promise<void>;

  // WhatsApp Config
  getWhatsappContacts(tenantId: number): Promise<WhatsappConfig[]>;
  createWhatsappContact(data: InsertWhatsappConfig): Promise<WhatsappConfig>;
  deleteWhatsappContact(id: number): Promise<void>;
  getWhatsappSchedule(tenantId: number): Promise<WhatsappSchedule | undefined>;
  upsertWhatsappSchedule(tenantId: number, data: Partial<InsertWhatsappSchedule>): Promise<WhatsappSchedule>;

  // WhatsApp Messages
  getWhatsappMessages(tenantId: number, jid: string, limit?: number): Promise<WhatsappMessage[]>;
  getWhatsappMessageByMessageId(tenantId: number, messageId: string): Promise<WhatsappMessage | undefined>;
  getLastIncomingWhatsappTimestamp(tenantId: number): Promise<number | null>;
  getWhatsappConversations(tenantId: number): Promise<{ jid: string; lastMessage: string; lastTimestamp: Date; senderName: string | null; unreadCount: number; isGroup: boolean }[]>;
  createWhatsappMessage(data: InsertWhatsappMessage): Promise<WhatsappMessage>;
  updateWhatsappMessageProto(tenantId: number, messageId: string, messageProto: string): Promise<void>;
  markWhatsappMessagesRead(tenantId: number, jid: string): Promise<void>;
  getUnreadWhatsappCount(tenantId: number): Promise<number>;

  // Secretary Config
  getSecretaryConfig(tenantId: number): Promise<SecretaryConfig | undefined>;
  upsertSecretaryConfig(tenantId: number, data: Partial<InsertSecretaryConfig>): Promise<SecretaryConfig>;

  // Secretary Actions
  getSecretaryActions(tenantId: number, limit?: number): Promise<SecretaryAction[]>;
  getSecretaryActionsByJid(tenantId: number, jid: string): Promise<SecretaryAction[]>;
  getRecentPendingActionByJid(tenantId: number, jid: string, withinHours?: number): Promise<SecretaryAction | undefined>;
  getPendingSecretaryActions(tenantId: number): Promise<SecretaryAction[]>;
  createSecretaryAction(data: InsertSecretaryAction): Promise<SecretaryAction>;
  updateSecretaryAction(id: number, data: Partial<InsertSecretaryAction>): Promise<SecretaryAction>;
  createSecretaryDelegatedTask(data: InsertSecretaryDelegatedTask): Promise<SecretaryDelegatedTask>;
  updateSecretaryDelegatedTask(id: number, data: Partial<InsertSecretaryDelegatedTask>): Promise<SecretaryDelegatedTask>;
  getSecretaryDelegatedTask(tenantId: number, id: number): Promise<SecretaryDelegatedTask | undefined>;
  getSecretaryDelegatedTasks(tenantId: number, status?: string, limit?: number): Promise<SecretaryDelegatedTask[]>;
  getDueSecretaryDelegatedTasks(tenantId: number, now: Date, limit?: number): Promise<SecretaryDelegatedTask[]>;
  getOpenSecretaryDelegatedTaskByTargetJid(tenantId: number, targetJid: string): Promise<SecretaryDelegatedTask | undefined>;
  getSecretaryDelegatedTasksByRequesterJid(tenantId: number, requesterJid: string): Promise<SecretaryDelegatedTask[]>;
  createAgentRun(data: InsertAgentRun): Promise<AgentRun>;
  updateAgentRun(id: number, data: Partial<InsertAgentRun>): Promise<AgentRun>;
  getAgentRun(id: number): Promise<AgentRun | undefined>;
  createAgentStep(data: InsertAgentStep): Promise<AgentStep>;
  getAgentSteps(runId: number): Promise<AgentStep[]>;

  // Debtors
  getDebtor(id: number): Promise<Debtor | undefined>;
  getDebtorsByClient(clientId: number, tenantId: number): Promise<Debtor[]>;
  getDebtorsByTenant(tenantId: number): Promise<Debtor[]>;
  createDebtor(data: InsertDebtor): Promise<Debtor>;
  updateDebtor(id: number, data: Partial<InsertDebtor>): Promise<Debtor>;
  deleteDebtor(id: number, tenantId: number): Promise<void>;
  deleteDebtorsByClient(clientId: number, tenantId: number): Promise<number>;

  // Debtor Agreements
  getDebtorAgreement(id: number, tenantId: number): Promise<DebtorAgreement | undefined>;
  getDebtorAgreementsByDebtor(debtorId: number, tenantId: number): Promise<DebtorAgreement[]>;
  getDebtorAgreementsByClient(clientId: number, tenantId: number): Promise<DebtorAgreement[]>;
  getDebtorAgreementsByTenant(tenantId: number): Promise<DebtorAgreement[]>;
  createDebtorAgreement(data: InsertDebtorAgreement): Promise<DebtorAgreement>;
  updateDebtorAgreement(id: number, tenantId: number, data: Partial<InsertDebtorAgreement>): Promise<DebtorAgreement | undefined>;
  deleteDebtorAgreement(id: number, tenantId: number): Promise<void>;
  deleteDebtorAgreements(ids: number[], tenantId: number): Promise<number>;

  // Negotiations
  getNegotiation(id: number): Promise<Negotiation | undefined>;
  getNegotiationsByTenant(tenantId: number): Promise<Negotiation[]>;
  getNegotiationsByClient(clientId: number): Promise<Negotiation[]>;
  createNegotiation(data: InsertNegotiation): Promise<Negotiation>;
  updateNegotiation(id: number, data: Partial<InsertNegotiation>): Promise<Negotiation>;
  deleteNegotiation(id: number): Promise<void>;

  // Negotiation Contacts
  getNegotiationContacts(negotiationId: number): Promise<NegotiationContact[]>;
  createNegotiationContact(data: InsertNegotiationContact): Promise<NegotiationContact>;
  updateNegotiationContact(id: number, data: Partial<InsertNegotiationContact>): Promise<NegotiationContact>;
  deleteNegotiationContact(id: number): Promise<void>;

  // Negotiation Rounds
  getNegotiationRounds(negotiationId: number): Promise<NegotiationRound[]>;
  createNegotiationRound(data: InsertNegotiationRound): Promise<NegotiationRound>;
  updateNegotiationRound(id: number, data: Partial<InsertNegotiationRound>): Promise<NegotiationRound>;

  // Prospection Plans
  getProspectionPlan(id: number, tenantId?: number): Promise<ProspectionPlan | undefined>;
  getProspectionPlansByTenant(tenantId: number): Promise<ProspectionPlan[]>;
  createProspectionPlan(data: InsertProspectionPlan): Promise<ProspectionPlan>;
  updateProspectionPlan(id: number, data: Partial<InsertProspectionPlan>, tenantId?: number): Promise<ProspectionPlan>;
  deleteProspectionPlan(id: number, tenantId?: number): Promise<void>;

  // Prospection Leads
  getProspectionLead(id: number, tenantId?: number): Promise<ProspectionLead | undefined>;
  getProspectionLeadsByPlan(planId: number): Promise<ProspectionLead[]>;
  getProspectionLeadsByTenant(tenantId: number): Promise<ProspectionLead[]>;
  createProspectionLead(data: InsertProspectionLead): Promise<ProspectionLead>;
  updateProspectionLead(id: number, data: Partial<InsertProspectionLead>, tenantId?: number): Promise<ProspectionLead>;
  deleteProspectionLead(id: number, tenantId?: number): Promise<void>;

  // Prospection Messages
  getProspectionMessagesByLead(leadId: number): Promise<ProspectionMessage[]>;
  createProspectionMessage(data: InsertProspectionMessage): Promise<ProspectionMessage>;
  updateProspectionMessage(id: number, data: Partial<InsertProspectionMessage>): Promise<ProspectionMessage>;

  // Prospection Network
  getNetworkContact(id: number, tenantId?: number): Promise<ProspectionNetwork | undefined>;
  getNetworkContactsByTenant(tenantId: number, platform?: string): Promise<ProspectionNetwork[]>;
  createNetworkContact(data: InsertProspectionNetwork): Promise<ProspectionNetwork>;
  updateNetworkContact(id: number, data: Partial<InsertProspectionNetwork>): Promise<ProspectionNetwork>;
  deleteNetworkContact(id: number): Promise<void>;

  // Prospection Chat
  getProspectionChatMessages(planId: number, tenantId: number): Promise<ProspectionChatMessage[]>;
  createProspectionChatMessage(data: InsertProspectionChatMessage): Promise<ProspectionChatMessage>;

  // WhatsApp LID Map
  getLidByPhone(phone: string): Promise<string | null>;
  getPhoneByLid(lid: string): Promise<string | null>;
  upsertLidMapping(lid: string, phone: string): Promise<void>;
  getAllLidMappings(): Promise<WhatsappLidMap[]>;

  // Meetings
  getMeeting(id: number, tenantId?: number): Promise<Meeting | undefined>;
  getMeetingsByTenant(tenantId: number): Promise<Meeting[]>;
  createMeeting(data: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: number, data: Partial<InsertMeeting>): Promise<Meeting>;
  deleteMeeting(id: number): Promise<void>;
  getMeetingParticipants(meetingId: number): Promise<MeetingParticipant[]>;
  createMeetingParticipant(data: InsertMeetingParticipant): Promise<MeetingParticipant>;
  getMeetingUtterances(meetingId: number): Promise<MeetingUtterance[]>;
  createMeetingUtterance(data: InsertMeetingUtterance): Promise<MeetingUtterance>;
  getMeetingInsights(meetingId: number): Promise<MeetingInsight[]>;
  createMeetingInsight(data: InsertMeetingInsight): Promise<MeetingInsight>;
  getMeetingChatMessages(meetingId: number): Promise<MeetingChatMessage[]>;
  createMeetingChatMessage(data: InsertMeetingChatMessage): Promise<MeetingChatMessage>;
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

  async getFirstUserForTenant(tenantId: number): Promise<number> {
    const [row] = await db
      .select({ firstUserId: sql<number>`min(${users.id})` })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    if (!row?.firstUserId) {
      throw new Error(`No valid user found for tenant ${tenantId}`);
    }

    return Number(row.firstUserId);
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUserPhone(id: number, tenantId: number, phone: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ phone: phone || null })
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning();
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

  async getClientByPhone(phone: string, tenantId: number): Promise<Client | undefined> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const allClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    return allClients.find(c => {
      if (!c.phone) return false;
      const clientPhone = c.phone.replace(/\D/g, "");
      return normalizedPhone.includes(clientPhone) || clientPhone.includes(normalizedPhone) ||
        normalizedPhone.endsWith(clientPhone.slice(-8)) || clientPhone.endsWith(normalizedPhone.slice(-8));
    });
  }

  async createClient(data: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(data).returning();
    return client;
  }

  async updateClient(id: number, data: Partial<InsertClient>): Promise<Client> {
    const [client] = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return client;
  }

  async deleteAllClientDependencies(clientId: number): Promise<void> {
    const clientCases = await db.select({ id: cases.id }).from(cases).where(eq(cases.clientId, clientId));
    for (const c of clientCases) {
      await this.deleteAllCaseDependencies(c.id);
      await this.deleteCase(c.id);
    }
    const clientContracts = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.clientId, clientId));
    for (const ct of clientContracts) {
      await db.delete(contracts).where(eq(contracts.id, ct.id));
    }
    // Delete negotiations and their sub-records (negotiationRounds, negotiationContacts)
    const clientNegotiations = await db.select({ id: negotiations.id }).from(negotiations).where(eq(negotiations.clientId, clientId));
    for (const neg of clientNegotiations) {
      await db.delete(negotiationRounds).where(eq(negotiationRounds.negotiationId, neg.id));
      await db.delete(negotiationContacts).where(eq(negotiationContacts.negotiationId, neg.id));
      await db.delete(negotiations).where(eq(negotiations.id, neg.id));
    }
    // Delete debtors linked to this client
    await db.delete(debtors).where(eq(debtors.clientId, clientId));
    // Delete meetings linked to this client (sub-tables use onDelete: cascade)
    await db.delete(meetings).where(eq(meetings.clientId, clientId));
    await db.delete(invoices).where(eq(invoices.clientId, clientId));
    await db.delete(documents).where(eq(documents.clientId, clientId));
    await db.delete(agendaEvents).where(eq(agendaEvents.clientId, clientId));
    const clientEmails = await db.select({ id: emails.id }).from(emails).where(eq(emails.clientId, clientId));
    for (const em of clientEmails) {
      await db.delete(emailAttachments).where(eq(emailAttachments.emailId, em.id));
    }
    await db.delete(emails).where(eq(emails.clientId, clientId));
    await db.delete(emailDrafts).where(eq(emailDrafts.clientId, clientId));
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
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

  async deleteContract(id: number): Promise<void> {
    await db.delete(contracts).where(eq(contracts.id, id));
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

  async updateCase(id: number, data: Partial<InsertCase>, tenantId?: number): Promise<Case> {
    const condition = tenantId
      ? and(eq(cases.id, id), eq(cases.tenantId, tenantId))
      : eq(cases.id, id);
    const [caseItem] = await db.update(cases).set(data).where(condition!).returning();
    return caseItem;
  }

  async deleteAllCaseDependencies(caseId: number): Promise<void> {
    await db.delete(caseMovements).where(eq(caseMovements.caseId, caseId));
    await db.delete(deadlines).where(eq(deadlines.caseId, caseId));
    await db.delete(documents).where(eq(documents.caseId, caseId));
    await db.delete(datajudSyncLogs).where(eq(datajudSyncLogs.caseId, caseId));
    await db.delete(aiGenerationLogs).where(eq(aiGenerationLogs.caseId, caseId));
    await db.delete(generatedPieces).where(eq(generatedPieces.caseId, caseId));
    const caseConversations = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.caseId, caseId));
    for (const conv of caseConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.caseId, caseId));
    await db.delete(agendaEvents).where(eq(agendaEvents.caseId, caseId));
    const caseEmails = await db.select({ id: emails.id }).from(emails).where(eq(emails.caseId, caseId));
    for (const em of caseEmails) {
      await db.delete(emailAttachments).where(eq(emailAttachments.emailId, em.id));
    }
    await db.delete(emails).where(eq(emails.caseId, caseId));
    await db.delete(emailDrafts).where(eq(emailDrafts.caseId, caseId));
  }

  async deleteCase(id: number): Promise<void> {
    await db.delete(cases).where(eq(cases.id, id));
  }

  // Case Movements
  async getCaseMovement(id: number): Promise<CaseMovement | undefined> {
    const [movement] = await db.select().from(caseMovements).where(eq(caseMovements.id, id));
    return movement;
  }

  async getCaseMovements(caseId: number): Promise<CaseMovement[]> {
    return db.select().from(caseMovements).where(eq(caseMovements.caseId, caseId)).orderBy(desc(caseMovements.date));
  }

  async getIntimacoesByTenant(tenantId: number, onlyOwnCases: boolean = false, startDate?: Date, endDate?: Date): Promise<(CaseMovement & { caseNumber: string; caseTitle: string; court: string })[]> {
    const conditions = [eq(cases.tenantId, tenantId)];
    if (onlyOwnCases) {
      conditions.push(eq(cases.isOwnCase, true));
    }
    if (startDate && endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      const startStr = startDate.toISOString().substring(0, 10);
      const endStr = endOfDay.toISOString().substring(0, 10);
      conditions.push(
        or(
          and(gte(caseMovements.date, startDate), lte(caseMovements.date, endOfDay)),
          and(isNotNull(caseMovements.aiDeadlineDate), gte(caseMovements.aiDeadlineDate, startStr), lte(caseMovements.aiDeadlineDate, endStr))
        )!
      );
    } else if (startDate) {
      conditions.push(gte(caseMovements.date, startDate));
    } else if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(caseMovements.date, endOfDay));
    }
    const results = await db
      .select({
        id: caseMovements.id,
        caseId: caseMovements.caseId,
        date: caseMovements.date,
        type: caseMovements.type,
        description: caseMovements.description,
        teor: caseMovements.teor,
        source: caseMovements.source,
        datajudCode: caseMovements.datajudCode,
        datajudPayload: caseMovements.datajudPayload,
        requiresAction: caseMovements.requiresAction,
        actionDeadline: caseMovements.actionDeadline,
        isRead: caseMovements.isRead,
        readAt: caseMovements.readAt,
        aiDeadlineDays: caseMovements.aiDeadlineDays,
        aiDeadlineType: caseMovements.aiDeadlineType,
        aiDeadlineDate: caseMovements.aiDeadlineDate,
        aiPublicacaoDate: caseMovements.aiPublicacaoDate,
        aiInicioPrazoDate: caseMovements.aiInicioPrazoDate,
        aiDeadlineStatus: caseMovements.aiDeadlineStatus,
        aiLegalBasis: caseMovements.aiLegalBasis,
        aiSuggestedPiece: caseMovements.aiSuggestedPiece,
        aiDeadlineSummary: caseMovements.aiDeadlineSummary,
        aiClassification: caseMovements.aiClassification,
        aiAnalyzedAt: caseMovements.aiAnalyzedAt,
        acknowledgedAt: caseMovements.acknowledgedAt,
        acknowledgedBy: caseMovements.acknowledgedBy,
        createdAt: caseMovements.createdAt,
        caseNumber: cases.caseNumber,
        caseTitle: cases.title,
        court: cases.court,
        isStrategic: cases.isStrategic,
      })
      .from(caseMovements)
      .innerJoin(cases, eq(caseMovements.caseId, cases.id))
      .where(and(...conditions))
      .orderBy(desc(caseMovements.date));
    return results;
  }

  async getUnreadIntimacaoCount(tenantId: number, onlyOwnCases: boolean = false): Promise<number> {
    const conditions = [
      eq(cases.tenantId, tenantId),
      eq(caseMovements.requiresAction, true),
      eq(caseMovements.isRead, false),
    ];
    if (onlyOwnCases) {
      conditions.push(eq(cases.isOwnCase, true));
    }
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(caseMovements)
      .innerJoin(cases, eq(caseMovements.caseId, cases.id))
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  }

  async markMovementAsRead(id: number): Promise<CaseMovement> {
    const [movement] = await db
      .update(caseMovements)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(caseMovements.id, id))
      .returning();
    return movement;
  }

  async markAllMovementsAsRead(tenantId: number): Promise<void> {
    const caseIds = await db.select({ id: cases.id }).from(cases).where(eq(cases.tenantId, tenantId));
    if (caseIds.length > 0) {
      await db
        .update(caseMovements)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          inArray(caseMovements.caseId, caseIds.map(c => c.id)),
          eq(caseMovements.isRead, false),
        ));
    }
  }

  async createCaseMovement(data: InsertCaseMovement): Promise<CaseMovement> {
    const [movement] = await db.insert(caseMovements).values(data).returning();
    return movement;
  }

  async createCaseMovements(data: InsertCaseMovement[]): Promise<CaseMovement[]> {
    if (data.length === 0) return [];
    return db.insert(caseMovements).values(data).returning();
  }

  async deleteCaseMovementsByCaseId(caseId: number): Promise<void> {
    await db.delete(caseMovements).where(eq(caseMovements.caseId, caseId));
  }

  async updateMovementDeadlineAnalysis(id: number, data: { aiDeadlineDays: number | null; aiDeadlineType: string | null; aiDeadlineDate: string | null; aiPublicacaoDate?: string | null; aiInicioPrazoDate?: string | null; aiDeadlineStatus: string | null; aiLegalBasis: string | null; aiSuggestedPiece: string | null; aiDeadlineSummary: string | null; aiClassification?: string | null; aiAnalyzedAt: Date; }): Promise<CaseMovement> {
    const [result] = await db.update(caseMovements).set(data).where(eq(caseMovements.id, id)).returning();
    return result;
  }

  async acknowledgeMovement(id: number, userId: number): Promise<CaseMovement> {
    const [result] = await db.update(caseMovements).set({ acknowledgedAt: new Date(), acknowledgedBy: userId, isRead: true, readAt: new Date() }).where(eq(caseMovements.id, id)).returning();
    return result;
  }

  async getUnanalyzedIntimacoes(tenantId: number): Promise<(CaseMovement & { caseNumber: string; caseTitle: string; court: string; classeNome: string | null; vara: string | null })[]> {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const results = await db
      .select({
        id: caseMovements.id,
        caseId: caseMovements.caseId,
        date: caseMovements.date,
        type: caseMovements.type,
        description: caseMovements.description,
        teor: caseMovements.teor,
        source: caseMovements.source,
        datajudCode: caseMovements.datajudCode,
        datajudPayload: caseMovements.datajudPayload,
        requiresAction: caseMovements.requiresAction,
        actionDeadline: caseMovements.actionDeadline,
        isRead: caseMovements.isRead,
        readAt: caseMovements.readAt,
        aiDeadlineDays: caseMovements.aiDeadlineDays,
        aiDeadlineType: caseMovements.aiDeadlineType,
        aiDeadlineDate: caseMovements.aiDeadlineDate,
        aiPublicacaoDate: caseMovements.aiPublicacaoDate,
        aiInicioPrazoDate: caseMovements.aiInicioPrazoDate,
        aiDeadlineStatus: caseMovements.aiDeadlineStatus,
        aiLegalBasis: caseMovements.aiLegalBasis,
        aiSuggestedPiece: caseMovements.aiSuggestedPiece,
        aiDeadlineSummary: caseMovements.aiDeadlineSummary,
        aiClassification: caseMovements.aiClassification,
        aiAnalyzedAt: caseMovements.aiAnalyzedAt,
        acknowledgedAt: caseMovements.acknowledgedAt,
        acknowledgedBy: caseMovements.acknowledgedBy,
        createdAt: caseMovements.createdAt,
        caseNumber: cases.caseNumber,
        caseTitle: cases.title,
        court: cases.court,
        classeNome: cases.classeNome,
        vara: cases.vara,
      })
      .from(caseMovements)
      .innerJoin(cases, eq(caseMovements.caseId, cases.id))
      .where(and(
        eq(cases.tenantId, tenantId),
        isNull(caseMovements.aiAnalyzedAt),
        gte(caseMovements.date, sixtyDaysAgo)
      ))
      .orderBy(desc(caseMovements.date));
    return results;
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

  async getDeadlinesByClient(clientId: number): Promise<Deadline[]> {
    const clientCases = await db.select({ id: cases.id }).from(cases).where(eq(cases.clientId, clientId));
    const caseIds = clientCases.map(c => c.id);
    if (caseIds.length === 0) return [];
    return db.select().from(deadlines).where(inArray(deadlines.caseId, caseIds)).orderBy(deadlines.dueDate);
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

  async getDocumentsByClient(clientId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.clientId, clientId)).orderBy(desc(documents.createdAt));
  }

  async getDocumentsByDebtor(debtorId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.debtorId, debtorId)).orderBy(desc(documents.createdAt));
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

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
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

  // Notas Fiscais (standalone)
  async getNotaFiscal(id: number): Promise<NotaFiscal | undefined> {
    const [nf] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
    return nf;
  }

  async getNotasFiscaisByTenant(tenantId: number): Promise<NotaFiscal[]> {
    return db.select().from(notasFiscais).where(eq(notasFiscais.tenantId, tenantId)).orderBy(desc(notasFiscais.createdAt));
  }

  async createNotaFiscal(data: InsertNotaFiscal): Promise<NotaFiscal> {
    const [nf] = await db.insert(notasFiscais).values(data).returning();
    return nf;
  }

  async deleteNotaFiscal(id: number): Promise<void> {
    await db.delete(notasFiscais).where(eq(notasFiscais.id, id));
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

  async getWhatsAppConversation(tenantId: number, jid: string): Promise<Conversation | undefined> {
    const title = `whatsapp:${jid}`;
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.title, title)));
    return conv;
  }

  async getOrCreateWhatsAppConversation(tenantId: number, jid: string): Promise<Conversation> {
    const existing = await this.getWhatsAppConversation(tenantId, jid);
    if (existing) return existing;
    const [conv] = await db.insert(conversations).values({
      tenantId,
      title: `whatsapp:${jid}`,
    }).returning();
    return conv;
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

  // Email Folders
  async getEmailFolders(tenantId: number): Promise<EmailFolder[]> {
    return db.select().from(emailFolders).where(eq(emailFolders.tenantId, tenantId)).orderBy(emailFolders.name);
  }

  async getEmailFolder(id: number): Promise<EmailFolder | undefined> {
    const [folder] = await db.select().from(emailFolders).where(eq(emailFolders.id, id));
    return folder;
  }

  async getOrCreateEmailFolder(data: InsertEmailFolder): Promise<EmailFolder> {
    const [existing] = await db.select().from(emailFolders).where(
      and(
        eq(emailFolders.tenantId, data.tenantId),
        eq(emailFolders.imapPath, data.imapPath)
      )
    );
    if (existing) return existing;
    const [folder] = await db.insert(emailFolders).values(data).returning();
    return folder;
  }

  async updateEmailFolderCounts(folderId: number): Promise<void> {
    const [totalResult] = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(eq(emails.folderId, folderId));
    const [unreadResult] = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(eq(emails.folderId, folderId), eq(emails.isRead, false)));
    
    await db.update(emailFolders).set({
      totalCount: Number(totalResult?.count) || 0,
      unreadCount: Number(unreadResult?.count) || 0,
    }).where(eq(emailFolders.id, folderId));
  }

  async updateEmailFolderLastSync(folderId: number): Promise<void> {
    await db.update(emailFolders).set({ lastSync: new Date() }).where(eq(emailFolders.id, folderId));
  }

  // Emails
  async getEmails(folderId: number, limit = 50, offset = 0): Promise<Email[]> {
    return db.select().from(emails)
      .where(eq(emails.folderId, folderId))
      .orderBy(desc(emails.date))
      .limit(limit)
      .offset(offset);
  }

  async getEmail(id: number): Promise<Email | undefined> {
    const [email] = await db.select().from(emails).where(eq(emails.id, id));
    return email;
  }

  async getEmailByMessageId(tenantId: number, messageId: string): Promise<Email | undefined> {
    const [email] = await db.select().from(emails).where(
      and(eq(emails.tenantId, tenantId), eq(emails.messageId, messageId))
    );
    return email;
  }

  async createEmail(data: InsertEmail): Promise<Email> {
    const [email] = await db.insert(emails).values(data).returning();
    return email;
  }

  async updateEmail(id: number, data: Partial<InsertEmail>): Promise<Email> {
    const [email] = await db.update(emails).set(data).where(eq(emails.id, id)).returning();
    return email;
  }

  async deleteEmail(id: number): Promise<void> {
    await db.delete(emails).where(eq(emails.id, id));
  }

  async markEmailAsRead(id: number, isRead: boolean): Promise<Email> {
    const [email] = await db.update(emails).set({ isRead }).where(eq(emails.id, id)).returning();
    return email;
  }

  async toggleEmailStar(id: number): Promise<Email> {
    const existing = await this.getEmail(id);
    if (!existing) throw new Error("Email not found");
    const [email] = await db.update(emails).set({ isStarred: !existing.isStarred }).where(eq(emails.id, id)).returning();
    return email;
  }

  async searchEmails(tenantId: number, query: string, limit = 50): Promise<Email[]> {
    return db.select().from(emails)
      .where(and(
        eq(emails.tenantId, tenantId),
        sql`(${emails.subject} ILIKE ${'%' + query + '%'} OR ${emails.bodyText} ILIKE ${'%' + query + '%'} OR ${emails.fromAddress} ILIKE ${'%' + query + '%'})`
      ))
      .orderBy(desc(emails.date))
      .limit(limit);
  }

  // Email Attachments
  async getEmailAttachments(emailId: number): Promise<EmailAttachment[]> {
    return db.select().from(emailAttachments).where(eq(emailAttachments.emailId, emailId));
  }

  async createEmailAttachment(data: InsertEmailAttachment): Promise<EmailAttachment> {
    const [attachment] = await db.insert(emailAttachments).values(data).returning();
    return attachment;
  }

  // Email Drafts
  async getEmailDrafts(tenantId: number): Promise<EmailDraft[]> {
    return db.select().from(emailDrafts).where(eq(emailDrafts.tenantId, tenantId)).orderBy(desc(emailDrafts.updatedAt));
  }

  async getEmailDraft(id: number): Promise<EmailDraft | undefined> {
    const [draft] = await db.select().from(emailDrafts).where(eq(emailDrafts.id, id));
    return draft;
  }

  async createEmailDraft(data: InsertEmailDraft): Promise<EmailDraft> {
    const [draft] = await db.insert(emailDrafts).values(data).returning();
    return draft;
  }

  async updateEmailDraft(id: number, data: Partial<InsertEmailDraft>): Promise<EmailDraft> {
    const [draft] = await db.update(emailDrafts).set({ ...data, updatedAt: new Date() }).where(eq(emailDrafts.id, id)).returning();
    return draft;
  }

  async deleteEmailDraft(id: number): Promise<void> {
    await db.delete(emailDrafts).where(eq(emailDrafts.id, id));
  }

  // Document Templates
  async getDocumentTemplate(id: number): Promise<DocumentTemplate | undefined> {
    const [template] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, id));
    return template;
  }

  async getDocumentTemplatesByTenant(tenantId: number): Promise<DocumentTemplate[]> {
    return db.select().from(documentTemplates)
      .where(and(eq(documentTemplates.tenantId, tenantId), eq(documentTemplates.isActive, true)))
      .orderBy(desc(documentTemplates.createdAt));
  }

  async createDocumentTemplate(data: InsertDocumentTemplate): Promise<DocumentTemplate> {
    const [template] = await db.insert(documentTemplates).values(data).returning();
    return template;
  }

  async updateDocumentTemplate(id: number, data: Partial<InsertDocumentTemplate>): Promise<DocumentTemplate> {
    const [template] = await db.update(documentTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documentTemplates.id, id))
      .returning();
    return template;
  }

  async deleteDocumentTemplate(id: number): Promise<void> {
    await db.update(documentTemplates).set({ isActive: false }).where(eq(documentTemplates.id, id));
  }

  // Generated Pieces
  async getGeneratedPiece(id: number): Promise<GeneratedPiece | undefined> {
    const [piece] = await db.select().from(generatedPieces).where(eq(generatedPieces.id, id));
    return piece;
  }

  async getGeneratedPiecesByTenant(tenantId: number): Promise<GeneratedPiece[]> {
    return db.select().from(generatedPieces)
      .where(eq(generatedPieces.tenantId, tenantId))
      .orderBy(desc(generatedPieces.createdAt));
  }

  async getGeneratedPiecesByCase(caseId: number): Promise<GeneratedPiece[]> {
    return db.select().from(generatedPieces)
      .where(eq(generatedPieces.caseId, caseId))
      .orderBy(desc(generatedPieces.createdAt));
  }

  async createGeneratedPiece(data: InsertGeneratedPiece): Promise<GeneratedPiece> {
    const [piece] = await db.insert(generatedPieces).values(data).returning();
    return piece;
  }

  async updateGeneratedPiece(id: number, data: Partial<InsertGeneratedPiece>): Promise<GeneratedPiece> {
    const [piece] = await db.update(generatedPieces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(generatedPieces.id, id))
      .returning();
    return piece;
  }

  async deleteGeneratedPiece(id: number): Promise<void> {
    await db.delete(generatedPieces).where(eq(generatedPieces.id, id));
  }

  // Letterhead Config
  async getLetterheadConfig(tenantId: number): Promise<LetterheadConfig | undefined> {
    const [config] = await db.select().from(letterheadConfigs).where(eq(letterheadConfigs.tenantId, tenantId));
    return config;
  }

  async createLetterheadConfig(data: InsertLetterheadConfig): Promise<LetterheadConfig> {
    const [config] = await db.insert(letterheadConfigs).values(data).returning();
    return config;
  }

  async updateLetterheadConfig(tenantId: number, data: Partial<InsertLetterheadConfig>): Promise<LetterheadConfig> {
    const [config] = await db.update(letterheadConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(letterheadConfigs.tenantId, tenantId))
      .returning();
    return config;
  }
  // Agenda Events
  async getAgendaEventsByDate(tenantId: number, date: string): Promise<AgendaEvent[]> {
    return db.select().from(agendaEvents)
      .where(and(eq(agendaEvents.tenantId, tenantId), eq(agendaEvents.date, date)))
      .orderBy(agendaEvents.timeStart);
  }

  async getAgendaEventsByRange(tenantId: number, startDate: string, endDate: string): Promise<AgendaEvent[]> {
    return db.select().from(agendaEvents)
      .where(and(
        eq(agendaEvents.tenantId, tenantId),
        gte(agendaEvents.date, startDate),
        lte(agendaEvents.date, endDate)
      ))
      .orderBy(agendaEvents.date, agendaEvents.timeStart);
  }

  async getAgendaEventsByTenant(tenantId: number): Promise<AgendaEvent[]> {
    return db.select().from(agendaEvents)
      .where(eq(agendaEvents.tenantId, tenantId))
      .orderBy(desc(agendaEvents.date), agendaEvents.timeStart);
  }

  async createAgendaEvent(data: InsertAgendaEvent): Promise<AgendaEvent> {
    const [event] = await db.insert(agendaEvents).values(data).returning();
    return event;
  }

  async updateAgendaEvent(id: number, data: Partial<InsertAgendaEvent>): Promise<AgendaEvent> {
    const [event] = await db.update(agendaEvents).set(data).where(eq(agendaEvents.id, id)).returning();
    return event;
  }

  async deleteAgendaEvent(id: number): Promise<void> {
    await db.delete(agendaEvents).where(eq(agendaEvents.id, id));
  }

  // WhatsApp Config
  async getWhatsappContacts(tenantId: number): Promise<WhatsappConfig[]> {
    return db.select().from(whatsappConfig).where(eq(whatsappConfig.tenantId, tenantId));
  }

  async createWhatsappContact(data: InsertWhatsappConfig): Promise<WhatsappConfig> {
    const [contact] = await db.insert(whatsappConfig).values(data).returning();
    return contact;
  }

  async deleteWhatsappContact(id: number): Promise<void> {
    await db.delete(whatsappConfig).where(eq(whatsappConfig.id, id));
  }

  async getWhatsappSchedule(tenantId: number): Promise<WhatsappSchedule | undefined> {
    const [schedule] = await db.select().from(whatsappSchedule).where(eq(whatsappSchedule.tenantId, tenantId));
    return schedule;
  }

  async upsertWhatsappSchedule(tenantId: number, data: Partial<InsertWhatsappSchedule>): Promise<WhatsappSchedule> {
    const existing = await this.getWhatsappSchedule(tenantId);
    if (existing) {
      const [schedule] = await db.update(whatsappSchedule).set(data).where(eq(whatsappSchedule.tenantId, tenantId)).returning();
      return schedule;
    }
    const [schedule] = await db.insert(whatsappSchedule).values({ ...data, tenantId } as InsertWhatsappSchedule).returning();
    return schedule;
  }

  // WhatsApp Messages
  async getWhatsappMessages(tenantId: number, jid: string, limit: number = 100): Promise<WhatsappMessage[]> {
    return db.select().from(whatsappMessages)
      .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.jid, jid)))
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(limit);
  }

  async getWhatsappMessageByMessageId(tenantId: number, messageId: string): Promise<WhatsappMessage | undefined> {
    const [msg] = await db.select().from(whatsappMessages)
      .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.messageId, messageId)))
      .limit(1);
    return msg;
  }

  async getLastIncomingWhatsappTimestamp(tenantId: number): Promise<number | null> {
    const [row] = await db.select({ timestamp: whatsappMessages.timestamp })
      .from(whatsappMessages)
      .where(and(
        eq(whatsappMessages.tenantId, tenantId),
        eq(whatsappMessages.direction, "incoming")
      ))
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(1);
    return row ? row.timestamp.getTime() : null;
  }

  async updateWhatsappMessageProto(tenantId: number, messageId: string, messageProto: string): Promise<void> {
    await db.update(whatsappMessages)
      .set({ messageProto })
      .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.messageId, messageId)));
  }

  async getWhatsappConversations(tenantId: number): Promise<{ jid: string; lastMessage: string; lastTimestamp: Date; senderName: string | null; unreadCount: number; isGroup: boolean }[]> {
    const allMessages = await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.tenantId, tenantId))
      .orderBy(desc(whatsappMessages.timestamp));

    const convMap = new Map<string, { jid: string; lastMessage: string; lastTimestamp: Date; senderName: string | null; unreadCount: number; isGroup: boolean }>();

    for (const msg of allMessages) {
      if (!convMap.has(msg.jid)) {
        convMap.set(msg.jid, {
          jid: msg.jid,
          lastMessage: msg.content,
          lastTimestamp: msg.timestamp,
          senderName: null,
          unreadCount: 0,
          isGroup: msg.jid.endsWith("@g.us"),
        });
      }
      const conv = convMap.get(msg.jid)!;
      if (msg.direction === "incoming" && msg.senderName && !conv.senderName) {
        conv.senderName = msg.senderName;
      }
      if (!msg.isRead && msg.direction === "incoming") {
        conv.unreadCount++;
      }
    }

    return Array.from(convMap.values()).sort((a, b) => b.lastTimestamp.getTime() - a.lastTimestamp.getTime());
  }

  async createWhatsappMessage(data: InsertWhatsappMessage): Promise<WhatsappMessage> {
    const [msg] = await db.insert(whatsappMessages).values(data).returning();
    return msg;
  }

  async markWhatsappMessagesRead(tenantId: number, jid: string): Promise<void> {
    await db.update(whatsappMessages)
      .set({ isRead: true })
      .where(and(
        eq(whatsappMessages.tenantId, tenantId),
        eq(whatsappMessages.jid, jid),
        eq(whatsappMessages.isRead, false)
      ));
  }

  async getUnreadWhatsappCount(tenantId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(whatsappMessages)
      .where(and(
        eq(whatsappMessages.tenantId, tenantId),
        eq(whatsappMessages.direction, "incoming"),
        eq(whatsappMessages.isRead, false)
      ));
    return result[0]?.count ?? 0;
  }

  async getSecretaryConfig(tenantId: number): Promise<SecretaryConfig | undefined> {
    const [config] = await db.select().from(secretaryConfig).where(eq(secretaryConfig.tenantId, tenantId)).limit(1);
    return config;
  }

  async upsertSecretaryConfig(tenantId: number, data: Partial<InsertSecretaryConfig>): Promise<SecretaryConfig> {
    const existing = await this.getSecretaryConfig(tenantId);
    if (existing) {
      const [updated] = await db.update(secretaryConfig).set(data).where(eq(secretaryConfig.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(secretaryConfig).values({ ...data, tenantId } as InsertSecretaryConfig).returning();
    return created;
  }

  async getSecretaryActions(tenantId: number, limit: number = 50): Promise<SecretaryAction[]> {
    return db.select().from(secretaryActions)
      .where(eq(secretaryActions.tenantId, tenantId))
      .orderBy(desc(secretaryActions.timestamp))
      .limit(limit);
  }

  async getSecretaryActionsByJid(tenantId: number, jid: string): Promise<SecretaryAction[]> {
    return db.select().from(secretaryActions)
      .where(and(eq(secretaryActions.tenantId, tenantId), eq(secretaryActions.jid, jid)))
      .orderBy(desc(secretaryActions.timestamp))
      .limit(20);
  }

  async getRecentPendingActionByJid(tenantId: number, jid: string, withinHours: number = 48): Promise<SecretaryAction | undefined> {
    const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const [action] = await db.select().from(secretaryActions)
      .where(and(
        eq(secretaryActions.tenantId, tenantId),
        eq(secretaryActions.jid, jid),
        eq(secretaryActions.status, "promised"),
        gte(secretaryActions.timestamp, cutoff)
      ))
      .orderBy(desc(secretaryActions.timestamp))
      .limit(1);
    return action;
  }

  async getPendingSecretaryActions(tenantId: number): Promise<SecretaryAction[]> {
    return db.select().from(secretaryActions)
      .where(and(eq(secretaryActions.tenantId, tenantId), eq(secretaryActions.status, "pending_approval")))
      .orderBy(desc(secretaryActions.timestamp));
  }

  async createSecretaryAction(data: InsertSecretaryAction): Promise<SecretaryAction> {
    const [action] = await db.insert(secretaryActions).values(data).returning();
    return action;
  }

  async updateSecretaryAction(id: number, data: Partial<InsertSecretaryAction>): Promise<SecretaryAction> {
    const [updated] = await db.update(secretaryActions).set(data).where(eq(secretaryActions.id, id)).returning();
    return updated;
  }

  async createSecretaryDelegatedTask(data: InsertSecretaryDelegatedTask): Promise<SecretaryDelegatedTask> {
    const [task] = await db.insert(secretaryDelegatedTasks).values(data).returning();
    return task;
  }

  async updateSecretaryDelegatedTask(id: number, data: Partial<InsertSecretaryDelegatedTask>): Promise<SecretaryDelegatedTask> {
    const [updated] = await db.update(secretaryDelegatedTasks)
      .set({ ...data, updatedAt: new Date() } as Partial<InsertSecretaryDelegatedTask>)
      .where(eq(secretaryDelegatedTasks.id, id))
      .returning();
    return updated;
  }

  async getSecretaryDelegatedTask(tenantId: number, id: number): Promise<SecretaryDelegatedTask | undefined> {
    const [task] = await db.select().from(secretaryDelegatedTasks)
      .where(and(
        eq(secretaryDelegatedTasks.tenantId, tenantId),
        eq(secretaryDelegatedTasks.id, id)
      ))
      .limit(1);
    return task;
  }

  async getSecretaryDelegatedTasks(tenantId: number, status?: string, limit: number = 50): Promise<SecretaryDelegatedTask[]> {
    const conditions = [eq(secretaryDelegatedTasks.tenantId, tenantId)];
    if (status) conditions.push(eq(secretaryDelegatedTasks.status, status));
    return db.select().from(secretaryDelegatedTasks)
      .where(and(...conditions))
      .orderBy(desc(secretaryDelegatedTasks.updatedAt))
      .limit(limit);
  }

  async getDueSecretaryDelegatedTasks(tenantId: number, now: Date, limit: number = 25): Promise<SecretaryDelegatedTask[]> {
    return db.select().from(secretaryDelegatedTasks)
      .where(and(
        eq(secretaryDelegatedTasks.tenantId, tenantId),
        inArray(secretaryDelegatedTasks.status, ["awaiting_response", "sent"]),
        lte(secretaryDelegatedTasks.nextFollowUpAt, now)
      ))
      .orderBy(asc(secretaryDelegatedTasks.nextFollowUpAt))
      .limit(limit);
  }

  async getOpenSecretaryDelegatedTaskByTargetJid(tenantId: number, targetJid: string): Promise<SecretaryDelegatedTask | undefined> {
    const [task] = await db.select().from(secretaryDelegatedTasks)
      .where(and(
        eq(secretaryDelegatedTasks.tenantId, tenantId),
        eq(secretaryDelegatedTasks.targetJid, targetJid),
        inArray(secretaryDelegatedTasks.status, ["awaiting_response", "sent"])
      ))
      .orderBy(desc(secretaryDelegatedTasks.updatedAt))
      .limit(1);
    return task;
  }

  async getSecretaryDelegatedTasksByRequesterJid(tenantId: number, requesterJid: string): Promise<SecretaryDelegatedTask[]> {
    return db.select().from(secretaryDelegatedTasks)
      .where(and(
        eq(secretaryDelegatedTasks.tenantId, tenantId),
        eq(secretaryDelegatedTasks.requesterJid, requesterJid)
      ))
      .orderBy(desc(secretaryDelegatedTasks.updatedAt))
      .limit(20);
  }

  async createAgentRun(data: InsertAgentRun): Promise<AgentRun> {
    const [run] = await db.insert(agentRuns).values(data).returning();
    return run;
  }

  async updateAgentRun(id: number, data: Partial<InsertAgentRun>): Promise<AgentRun> {
    const [updated] = await db.update(agentRuns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentRuns.id, id))
      .returning();
    return updated;
  }

  async getAgentRun(id: number): Promise<AgentRun | undefined> {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id));
    return run;
  }

  async createAgentStep(data: InsertAgentStep): Promise<AgentStep> {
    const [step] = await db.insert(agentSteps).values(data).returning();
    return step;
  }

  async getAgentSteps(runId: number): Promise<AgentStep[]> {
    return db.select().from(agentSteps)
      .where(eq(agentSteps.runId, runId))
      .orderBy(desc(agentSteps.startedAt));
  }

  // Debtors
  async getDebtor(id: number): Promise<Debtor | undefined> {
    const [debtor] = await db.select().from(debtors).where(eq(debtors.id, id));
    return debtor;
  }

  async getDebtorsByClient(clientId: number, tenantId: number): Promise<Debtor[]> {
    return db.select().from(debtors)
      .where(and(eq(debtors.clientId, clientId), eq(debtors.tenantId, tenantId)))
      .orderBy(asc(debtors.name), desc(debtors.createdAt));
  }

  async getDebtorsByTenant(tenantId: number): Promise<Debtor[]> {
    return db.select().from(debtors)
      .where(eq(debtors.tenantId, tenantId))
      .orderBy(asc(debtors.name), desc(debtors.createdAt));
  }

  async createDebtor(data: InsertDebtor): Promise<Debtor> {
    const [debtor] = await db.insert(debtors).values(data).returning();
    return debtor;
  }

  async updateDebtor(id: number, data: Partial<InsertDebtor>): Promise<Debtor> {
    const [debtor] = await db.update(debtors).set(data).where(eq(debtors.id, id)).returning();
    return debtor;
  }

  async deleteDebtor(id: number, tenantId: number): Promise<void> {
    await db.delete(debtors).where(and(eq(debtors.id, id), eq(debtors.tenantId, tenantId)));
  }

  async deleteDebtorsByClient(clientId: number, tenantId: number): Promise<number> {
    const deleted = await db.delete(debtors)
      .where(and(eq(debtors.clientId, clientId), eq(debtors.tenantId, tenantId)))
      .returning({ id: debtors.id });
    return deleted.length;
  }

  // Debtor Agreements
  async getDebtorAgreement(id: number, tenantId: number): Promise<DebtorAgreement | undefined> {
    const [a] = await db.select().from(debtorAgreements).where(and(eq(debtorAgreements.id, id), eq(debtorAgreements.tenantId, tenantId)));
    return a;
  }

  async getDebtorAgreementsByDebtor(debtorId: number, tenantId: number): Promise<DebtorAgreement[]> {
    return db.select().from(debtorAgreements).where(and(eq(debtorAgreements.debtorId, debtorId), eq(debtorAgreements.tenantId, tenantId))).orderBy(desc(debtorAgreements.agreementDate));
  }

  async getDebtorAgreementsByClient(clientId: number, tenantId: number): Promise<DebtorAgreement[]> {
    return db.select().from(debtorAgreements).where(and(eq(debtorAgreements.clientId, clientId), eq(debtorAgreements.tenantId, tenantId))).orderBy(desc(debtorAgreements.agreementDate));
  }

  async getDebtorAgreementsByTenant(tenantId: number): Promise<DebtorAgreement[]> {
    return db.select().from(debtorAgreements).where(eq(debtorAgreements.tenantId, tenantId)).orderBy(desc(debtorAgreements.agreementDate));
  }

  async createDebtorAgreement(data: InsertDebtorAgreement): Promise<DebtorAgreement> {
    const [a] = await db.insert(debtorAgreements).values(data).returning();
    return a;
  }

  async updateDebtorAgreement(id: number, tenantId: number, data: Partial<InsertDebtorAgreement>): Promise<DebtorAgreement | undefined> {
    const [a] = await db.update(debtorAgreements).set({ ...data, updatedAt: new Date() }).where(and(eq(debtorAgreements.id, id), eq(debtorAgreements.tenantId, tenantId))).returning();
    return a;
  }

  async deleteDebtorAgreement(id: number, tenantId: number): Promise<void> {
    await db.delete(debtorAgreements).where(and(eq(debtorAgreements.id, id), eq(debtorAgreements.tenantId, tenantId)));
  }

  async deleteDebtorAgreements(ids: number[], tenantId: number): Promise<number> {
    if (!ids.length) return 0;
    const deleted = await db.delete(debtorAgreements)
      .where(and(inArray(debtorAgreements.id, ids), eq(debtorAgreements.tenantId, tenantId)))
      .returning({ id: debtorAgreements.id });
    return deleted.length;
  }

  // Negotiations
  async getNegotiation(id: number): Promise<Negotiation | undefined> {
    const [negotiation] = await db.select().from(negotiations).where(eq(negotiations.id, id));
    return negotiation;
  }

  async getNegotiationsByTenant(tenantId: number): Promise<Negotiation[]> {
    return db.select().from(negotiations).where(eq(negotiations.tenantId, tenantId)).orderBy(desc(negotiations.createdAt));
  }

  async getNegotiationsByClient(clientId: number): Promise<Negotiation[]> {
    return db.select().from(negotiations).where(eq(negotiations.clientId, clientId)).orderBy(desc(negotiations.createdAt));
  }

  async createNegotiation(data: InsertNegotiation): Promise<Negotiation> {
    const [negotiation] = await db.insert(negotiations).values(data).returning();
    return negotiation;
  }

  async updateNegotiation(id: number, data: Partial<InsertNegotiation>): Promise<Negotiation> {
    const [negotiation] = await db.update(negotiations).set(data).where(eq(negotiations.id, id)).returning();
    return negotiation;
  }

  async deleteNegotiation(id: number): Promise<void> {
    await db.delete(negotiationRounds).where(eq(negotiationRounds.negotiationId, id));
    await db.delete(negotiationContacts).where(eq(negotiationContacts.negotiationId, id));
    await db.delete(negotiations).where(eq(negotiations.id, id));
  }

  // Negotiation Contacts
  async getNegotiationContacts(negotiationId: number): Promise<NegotiationContact[]> {
    return db.select().from(negotiationContacts).where(eq(negotiationContacts.negotiationId, negotiationId));
  }

  async createNegotiationContact(data: InsertNegotiationContact): Promise<NegotiationContact> {
    const [contact] = await db.insert(negotiationContacts).values(data).returning();
    return contact;
  }

  async updateNegotiationContact(id: number, data: Partial<InsertNegotiationContact>): Promise<NegotiationContact> {
    const [updated] = await db.update(negotiationContacts).set(data).where(eq(negotiationContacts.id, id)).returning();
    return updated;
  }

  async deleteNegotiationContact(id: number): Promise<void> {
    await db.delete(negotiationContacts).where(eq(negotiationContacts.id, id));
  }

  // Negotiation Rounds
  async getNegotiationRounds(negotiationId: number): Promise<NegotiationRound[]> {
    return db.select().from(negotiationRounds).where(eq(negotiationRounds.negotiationId, negotiationId)).orderBy(desc(negotiationRounds.createdAt));
  }

  async createNegotiationRound(data: InsertNegotiationRound): Promise<NegotiationRound> {
    const [round] = await db.insert(negotiationRounds).values(data).returning();
    return round;
  }

  async updateNegotiationRound(id: number, data: Partial<InsertNegotiationRound>): Promise<NegotiationRound> {
    const [round] = await db.update(negotiationRounds).set(data).where(eq(negotiationRounds.id, id)).returning();
    return round;
  }

  // Prospection Plans
  async getProspectionPlan(id: number, tenantId?: number): Promise<ProspectionPlan | undefined> {
    if (tenantId) {
      const [plan] = await db.select().from(prospectionPlans).where(and(eq(prospectionPlans.id, id), eq(prospectionPlans.tenantId, tenantId)));
      return plan;
    }
    const [plan] = await db.select().from(prospectionPlans).where(eq(prospectionPlans.id, id));
    return plan;
  }

  async getProspectionPlansByTenant(tenantId: number): Promise<ProspectionPlan[]> {
    return db.select().from(prospectionPlans).where(eq(prospectionPlans.tenantId, tenantId)).orderBy(desc(prospectionPlans.createdAt));
  }

  async createProspectionPlan(data: InsertProspectionPlan): Promise<ProspectionPlan> {
    const [plan] = await db.insert(prospectionPlans).values(data).returning();
    return plan;
  }

  async updateProspectionPlan(id: number, data: Partial<InsertProspectionPlan>, tenantId?: number): Promise<ProspectionPlan> {
    const conditions = tenantId ? and(eq(prospectionPlans.id, id), eq(prospectionPlans.tenantId, tenantId)) : eq(prospectionPlans.id, id);
    const [plan] = await db.update(prospectionPlans).set(data).where(conditions).returning();
    return plan;
  }

  async deleteProspectionPlan(id: number, tenantId?: number): Promise<void> {
    if (tenantId) {
      const [plan] = await db.select().from(prospectionPlans).where(and(eq(prospectionPlans.id, id), eq(prospectionPlans.tenantId, tenantId)));
      if (!plan) return;
    }
    const leads = await db.select({ id: prospectionLeads.id }).from(prospectionLeads).where(eq(prospectionLeads.planId, id));
    for (const lead of leads) {
      await db.delete(prospectionMessages).where(eq(prospectionMessages.leadId, lead.id));
    }
    await db.delete(prospectionLeads).where(eq(prospectionLeads.planId, id));
    await db.delete(prospectionPlans).where(eq(prospectionPlans.id, id));
  }

  // Prospection Leads
  async getProspectionLead(id: number, tenantId?: number): Promise<ProspectionLead | undefined> {
    if (tenantId) {
      const [lead] = await db.select().from(prospectionLeads).where(and(eq(prospectionLeads.id, id), eq(prospectionLeads.tenantId, tenantId)));
      return lead;
    }
    const [lead] = await db.select().from(prospectionLeads).where(eq(prospectionLeads.id, id));
    return lead;
  }

  async getProspectionLeadsByPlan(planId: number): Promise<ProspectionLead[]> {
    return db.select().from(prospectionLeads).where(eq(prospectionLeads.planId, planId)).orderBy(desc(prospectionLeads.createdAt));
  }

  async getProspectionLeadsByTenant(tenantId: number): Promise<ProspectionLead[]> {
    return db.select().from(prospectionLeads).where(eq(prospectionLeads.tenantId, tenantId)).orderBy(desc(prospectionLeads.createdAt));
  }

  async createProspectionLead(data: InsertProspectionLead): Promise<ProspectionLead> {
    const [lead] = await db.insert(prospectionLeads).values(data).returning();
    return lead;
  }

  async updateProspectionLead(id: number, data: Partial<InsertProspectionLead>, tenantId?: number): Promise<ProspectionLead> {
    const conditions = tenantId ? and(eq(prospectionLeads.id, id), eq(prospectionLeads.tenantId, tenantId)) : eq(prospectionLeads.id, id);
    const [lead] = await db.update(prospectionLeads).set(data).where(conditions).returning();
    return lead;
  }

  async deleteProspectionLead(id: number, tenantId?: number): Promise<void> {
    if (tenantId) {
      const [lead] = await db.select().from(prospectionLeads).where(and(eq(prospectionLeads.id, id), eq(prospectionLeads.tenantId, tenantId)));
      if (!lead) return;
    }
    await db.delete(prospectionMessages).where(eq(prospectionMessages.leadId, id));
    await db.delete(prospectionLeads).where(eq(prospectionLeads.id, id));
  }

  // Prospection Messages
  async getProspectionMessagesByLead(leadId: number): Promise<ProspectionMessage[]> {
    return db.select().from(prospectionMessages).where(eq(prospectionMessages.leadId, leadId)).orderBy(desc(prospectionMessages.createdAt));
  }

  async createProspectionMessage(data: InsertProspectionMessage): Promise<ProspectionMessage> {
    const [message] = await db.insert(prospectionMessages).values(data).returning();
    return message;
  }

  async updateProspectionMessage(id: number, data: Partial<InsertProspectionMessage>): Promise<ProspectionMessage> {
    const [message] = await db.update(prospectionMessages).set(data).where(eq(prospectionMessages.id, id)).returning();
    return message;
  }

  // Prospection Network
  async getNetworkContact(id: number, tenantId?: number): Promise<ProspectionNetwork | undefined> {
    if (tenantId) {
      const [contact] = await db.select().from(prospectionNetwork).where(and(eq(prospectionNetwork.id, id), eq(prospectionNetwork.tenantId, tenantId)));
      return contact;
    }
    const [contact] = await db.select().from(prospectionNetwork).where(eq(prospectionNetwork.id, id));
    return contact;
  }

  async getNetworkContactsByTenant(tenantId: number, platform?: string): Promise<ProspectionNetwork[]> {
    const conditions = [eq(prospectionNetwork.tenantId, tenantId)];
    if (platform) conditions.push(eq(prospectionNetwork.platform, platform));
    return db.select().from(prospectionNetwork).where(and(...conditions)).orderBy(desc(prospectionNetwork.createdAt));
  }

  async createNetworkContact(data: InsertProspectionNetwork): Promise<ProspectionNetwork> {
    const [contact] = await db.insert(prospectionNetwork).values(data).returning();
    return contact;
  }

  async updateNetworkContact(id: number, data: Partial<InsertProspectionNetwork>): Promise<ProspectionNetwork> {
    const [contact] = await db.update(prospectionNetwork).set(data).where(eq(prospectionNetwork.id, id)).returning();
    return contact;
  }

  async deleteNetworkContact(id: number): Promise<void> {
    await db.delete(prospectionNetwork).where(eq(prospectionNetwork.id, id));
  }

  // Prospection Chat
  async getProspectionChatMessages(planId: number, tenantId: number): Promise<ProspectionChatMessage[]> {
    return db.select().from(prospectionChatMessages).where(and(eq(prospectionChatMessages.planId, planId), eq(prospectionChatMessages.tenantId, tenantId))).orderBy(prospectionChatMessages.createdAt);
  }

  async createProspectionChatMessage(data: InsertProspectionChatMessage): Promise<ProspectionChatMessage> {
    const [msg] = await db.insert(prospectionChatMessages).values(data).returning();
    return msg;
  }

  async getLidByPhone(phone: string): Promise<string | null> {
    const [row] = await db.select().from(whatsappLidMap).where(eq(whatsappLidMap.phone, phone));
    return row?.lid || null;
  }

  async getPhoneByLid(lid: string): Promise<string | null> {
    const [row] = await db.select().from(whatsappLidMap).where(eq(whatsappLidMap.lid, lid));
    return row?.phone || null;
  }

  async upsertLidMapping(lid: string, phone: string): Promise<void> {
    await db.insert(whatsappLidMap)
      .values({ lid, phone, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: whatsappLidMap.lid,
        set: { phone, updatedAt: new Date() },
      });
  }

  async getAllLidMappings(): Promise<WhatsappLidMap[]> {
    return db.select().from(whatsappLidMap);
  }

  async getMeeting(id: number, tenantId?: number): Promise<Meeting | undefined> {
    const conditions = tenantId ? and(eq(meetings.id, id), eq(meetings.tenantId, tenantId)) : eq(meetings.id, id);
    const [meeting] = await db.select().from(meetings).where(conditions);
    return meeting;
  }

  async getMeetingsByTenant(tenantId: number): Promise<Meeting[]> {
    return db.select().from(meetings).where(eq(meetings.tenantId, tenantId)).orderBy(desc(meetings.createdAt));
  }

  async createMeeting(data: InsertMeeting): Promise<Meeting> {
    const [meeting] = await db.insert(meetings).values(data).returning();
    return meeting;
  }

  async updateMeeting(id: number, data: Partial<InsertMeeting>): Promise<Meeting> {
    const [meeting] = await db.update(meetings).set(data).where(eq(meetings.id, id)).returning();
    return meeting;
  }

  async deleteMeeting(id: number): Promise<void> {
    await db.delete(meetings).where(eq(meetings.id, id));
  }

  async getMeetingParticipants(meetingId: number): Promise<MeetingParticipant[]> {
    return db.select().from(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId));
  }

  async createMeetingParticipant(data: InsertMeetingParticipant): Promise<MeetingParticipant> {
    const [p] = await db.insert(meetingParticipants).values(data).returning();
    return p;
  }

  async getMeetingUtterances(meetingId: number): Promise<MeetingUtterance[]> {
    return db.select().from(meetingUtterances).where(eq(meetingUtterances.meetingId, meetingId)).orderBy(meetingUtterances.createdAt);
  }

  async createMeetingUtterance(data: InsertMeetingUtterance): Promise<MeetingUtterance> {
    const [u] = await db.insert(meetingUtterances).values(data).returning();
    return u;
  }

  async getMeetingInsights(meetingId: number): Promise<MeetingInsight[]> {
    return db.select().from(meetingInsights).where(eq(meetingInsights.meetingId, meetingId)).orderBy(desc(meetingInsights.createdAt));
  }

  async createMeetingInsight(data: InsertMeetingInsight): Promise<MeetingInsight> {
    const [i] = await db.insert(meetingInsights).values(data).returning();
    return i;
  }

  async getMeetingChatMessages(meetingId: number): Promise<MeetingChatMessage[]> {
    return db.select().from(meetingChatMessages).where(eq(meetingChatMessages.meetingId, meetingId)).orderBy(meetingChatMessages.createdAt);
  }

  async createMeetingChatMessage(data: InsertMeetingChatMessage): Promise<MeetingChatMessage> {
    const [m] = await db.insert(meetingChatMessages).values(data).returning();
    return m;
  }
}

export const storage = new DatabaseStorage();
