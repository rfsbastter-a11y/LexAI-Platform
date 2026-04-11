import { queryClient } from "./queryClient";

const API_BASE = "/api";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lexai_token");
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
    credentials: "include",
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    let msg = error.error || error.message || "Request failed";
    if (Array.isArray(msg)) {
      msg = msg.map((e: any) => e.message || JSON.stringify(e)).join("; ");
    } else if (typeof msg === "object") {
      msg = JSON.stringify(msg);
    }
    throw new Error(msg);
  }

  return response.json();
}

// Dashboard
export const dashboardApi = {
  getStats: () => fetchApi<{
    urgentDeadlines: number;
    activeCases: number;
    monthlyBilling: string;
    newCasesThisMonth: number;
  }>("/dashboard/stats"),
};

// Clients
export const clientsApi = {
  getAll: () => fetchApi<any[]>("/clients"),
  getById: (id: number) => fetchApi<any>(`/clients/${id}`),
  create: (data: any) => fetchApi<any>("/clients", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => fetchApi<any>(`/clients/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  delete: (id: number) => fetchApi<any>(`/clients/${id}`, { method: "DELETE" }),
  getContracts: (id: number) => fetchApi<any[]>(`/clients/${id}/contracts`),
  getCases: (id: number) => fetchApi<any[]>(`/clients/${id}/cases`),
  getInvoices: (id: number) => fetchApi<any[]>(`/clients/${id}/invoices`),
  getDeadlines: (id: number) => fetchApi<any[]>(`/clients/${id}/deadlines`),
};

// Contracts
export const contractsApi = {
  getAll: () => fetchApi<any[]>("/contracts"),
  create: (data: any) => fetchApi<any>("/contracts", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => fetchApi<any>(`/contracts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  delete: (id: number) => fetchApi<any>(`/contracts/${id}`, {
    method: "DELETE",
  }),
};

// Cases
export const casesApi = {
  getAll: () => fetchApi<any[]>("/cases"),
  getById: (id: number) => fetchApi<any>(`/cases/${id}`),
  getMovements: (id: number) => fetchApi<any[]>(`/cases/${id}/movements`),
  create: (data: any) => fetchApi<any>("/cases", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => fetchApi<any>(`/cases/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
};

// Intimações
export const intimacoesApi = {
  getAll: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return fetchApi<any[]>(`/intimacoes${qs ? `?${qs}` : ""}`);
  },
  getUnreadCount: () => fetchApi<{ count: number }>("/intimacoes/unread-count"),
  markAsRead: (id: number) => fetchApi<any>(`/intimacoes/${id}/read`, { method: "POST" }),
  markAllAsRead: () => fetchApi<any>("/intimacoes/mark-all-read", { method: "POST" }),
  syncAll: () => fetchApi<any>("/escavador/sync-all", { method: "POST" }),
  acknowledge: (id: number) => fetchApi<any>(`/intimacoes/acknowledge/${id}`, { method: "POST" }),
  batchAnalyze: () => fetchApi<{ analyzed: number; total: number }>("/intimacoes/batch-analyze", { method: "POST" }),
  resetAnalysis: () => fetchApi<any>("/intimacoes/reset-analysis", { method: "POST" }),
};

// Deadlines
export const deadlinesApi = {
  getAll: () => fetchApi<any[]>("/deadlines"),
  getUrgent: (days = 3) => fetchApi<any[]>(`/deadlines/urgent?days=${days}`),
  create: (data: any) => fetchApi<any>("/deadlines", {
    method: "POST",
    body: JSON.stringify(data),
  }),
};

// Invoices
export const invoicesApi = {
  getAll: () => fetchApi<any[]>("/invoices"),
};

// AI
export const aiApi = {
  chat: (messages: Array<{ role: string; content: string }>, contextDocuments?: any[]) =>
    fetchApi<{ content: string; citations: any[]; tokensUsed: number }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages, contextDocuments }),
    }),
  generatePiece: (data: {
    pieceType: string;
    caseContext: any;
    intimationText: string;
    additionalInstructions?: string;
  }) =>
    fetchApi<{ content: string; citations: any[]; tokensUsed: number }>("/ai/generate-piece", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  analyzeIntimacao: (data: {
    description: string;
    teor?: string;
    type?: string;
    caseNumber?: string;
    court?: string;
    caseClass?: string;
    classeNome?: string;
    vara?: string;
    intimationDate?: string;
  }) =>
    fetchApi<{
      requiresAction: boolean;
      suggestedPieceType: string | null;
      deadlineDays: number | null;
      deadlineType: string;
      deadlineDate?: string;
      daysRemaining?: number;
      businessDaysRemaining?: number;
      countingType?: string;
      isJuizadoEspecial?: boolean;
      deadlineStatus?: string;
      legalBasis: string | null;
      justification: string;
      urgency: string;
      summary: string;
    }>("/ai/analyze-intimacao", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  summarize: (documentContent: string, documentTitle: string) =>
    fetchApi<{ content: string; citations: any[] }>("/ai/summarize", {
      method: "POST",
      body: JSON.stringify({ documentContent, documentTitle }),
    }),
  extract: (documentContent: string, extractionType: "contract" | "procuration" | "petition") =>
    fetchApi<any>("/ai/extract", {
      method: "POST",
      body: JSON.stringify({ documentContent, extractionType }),
    }),
};

// Agenda
export const agendaApi = {
  getByDate: (date: string) => fetchApi<any[]>(`/agenda?date=${date}`),
  getByRange: (startDate: string, endDate: string) => fetchApi<any[]>(`/agenda?startDate=${startDate}&endDate=${endDate}`),
  getAll: () => fetchApi<any[]>("/agenda"),
  create: (data: any) => fetchApi<any>("/agenda", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => fetchApi<any>(`/agenda/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  delete: (id: number) => fetchApi<any>(`/agenda/${id}`, {
    method: "DELETE",
  }),
};

// WhatsApp
export const whatsappApi = {
  getContacts: () => fetchApi<any[]>("/whatsapp/contacts"),
  addContact: (data: any) => fetchApi<any>("/whatsapp/contacts", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  deleteContact: (id: number) => fetchApi<any>(`/whatsapp/contacts/${id}`, {
    method: "DELETE",
  }),
  getSchedule: () => fetchApi<any>("/whatsapp/schedule"),
  updateSchedule: (data: any) => fetchApi<any>("/whatsapp/schedule", {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  sendDailySummary: () => fetchApi<any>("/whatsapp/send-daily-summary", {
    method: "POST",
  }),
  getStatus: () => fetchApi<any>("/whatsapp/status"),
  connect: (fresh?: boolean) => fetchApi<any>(`/whatsapp/connect${fresh ? "?fresh=true" : ""}`, { method: "POST" }),
  disconnect: () => fetchApi<any>("/whatsapp/disconnect", { method: "POST" }),
  previewSummary: () => fetchApi<any>("/whatsapp/preview-summary", { method: "POST" }),
  getConversations: () => fetchApi<any[]>("/whatsapp/conversations"),
  getMessages: (jid: string) => fetchApi<any[]>(`/whatsapp/messages/${encodeURIComponent(jid)}`),
  sendChatMessage: (jid: string, message: string) => fetchApi<any>("/whatsapp/messages/send", {
    method: "POST",
    body: JSON.stringify({ jid, message }),
  }),
  markRead: (jid: string) => fetchApi<any>(`/whatsapp/messages/${encodeURIComponent(jid)}/read`, {
    method: "POST",
  }),
  sendToNumber: (phoneNumber: string, message: string) => fetchApi<any>("/whatsapp/send-to-number", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, message }),
  }),
  sendFile: (jid: string, file: File, caption?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("jid", jid);
    if (caption) formData.append("caption", caption);
    return fetch(`${API_BASE}/whatsapp/messages/send-file`, {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
      body: formData,
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || err.message || "Upload failed");
      }
      return r.json();
    });
  },
  getUnreadCount: () => fetchApi<{ count: number }>("/whatsapp/unread-count"),
};

// Secretary LexAI
export const secretaryApi = {
  getConfig: () => fetchApi<any>("/secretary/config"),
  updateConfig: (data: any) => fetchApi<any>("/secretary/config", {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  getActions: (limit = 50) => fetchApi<any[]>(`/secretary/actions?limit=${limit}`),
  getPending: () => fetchApi<any[]>("/secretary/pending"),
  approve: (id: number) => fetchApi<any>(`/secretary/actions/${id}/approve`, { method: "POST" }),
  editAndSend: (id: number, message: string) => fetchApi<any>(`/secretary/actions/${id}/edit-send`, {
    method: "POST",
    body: JSON.stringify({ message }),
  }),
  reject: (id: number) => fetchApi<any>(`/secretary/actions/${id}/reject`, { method: "POST" }),
};

// Debtors
export const debtorsApi = {
  getAll: () => fetchApi<any[]>("/debtors"),
  getById: (id: number) => fetchApi<any>(`/debtors/${id}`),
  getByClient: (clientId: number) => fetchApi<any[]>(`/clients/${clientId}/debtors`),
  create: (data: any) => fetchApi<any>("/debtors", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => fetchApi<any>(`/debtors/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  delete: (id: number) => fetchApi<any>(`/debtors/${id}`, { method: "DELETE" }),
  getDocuments: (debtorId: number) => fetchApi<any[]>(`/debtors/${debtorId}/documents`),
  generateCaseReport: (debtorId: number) => fetchApi<any>(`/debtors/${debtorId}/case-report`, { method: "POST" }),
};

// Documents
export const documentsApi = {
  archive: (formData: FormData) => fetch(`${API_BASE}/documents/archive`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
    credentials: "include",
    body: formData,
  }).then(r => { if (!r.ok) throw new Error("Failed to archive"); return r.json(); }),
};

// Studio
export const studioApi = {
  generate: (data: any) => fetchApi<any>("/studio/generate", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  savePiece: (data: any) => fetchApi<any>("/studio/pieces", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  humanize: (data: { content: string; intensity: string }) => fetchApi<{ content: string; intensity: string }>("/studio/humanize", {
    method: "POST",
    body: JSON.stringify(data),
  }),
};

// Conversations
export const conversationsApi = {
  getAll: () => fetchApi<any[]>("/conversations"),
  getById: (id: number) => fetchApi<any>(`/conversations/${id}`),
  create: (title: string, caseId?: number) =>
    fetchApi<any>("/conversations", {
      method: "POST",
      body: JSON.stringify({ title, caseId }),
    }),
  sendMessage: (conversationId: number, content: string) =>
    fetchApi<{ message: any; citations: any[] }>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
};
