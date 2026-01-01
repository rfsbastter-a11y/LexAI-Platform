import { queryClient } from "./queryClient";

const API_BASE = "/api";

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || "Request failed");
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
};

// Contracts
export const contractsApi = {
  getAll: () => fetchApi<any[]>("/contracts"),
  create: (data: any) => fetchApi<any>("/contracts", {
    method: "POST",
    body: JSON.stringify(data),
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
};

// DataJud
export const datajudApi = {
  search: (data: { caseNumber?: string; document?: string }) => 
    fetchApi<any>("/datajud/search", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  import: (caseId: number) => 
    fetchApi<{ success: boolean; movementsImported: number }>(`/datajud/import/${caseId}`, {
      method: "POST",
    }),
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
