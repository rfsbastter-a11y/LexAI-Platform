export type SecretaryConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface ConversationContext {
  messages: SecretaryConversationMessage[];
  lastActivity: number;
  clientId?: number;
  detectedTone?: string;
  lastUserRequest?: string;
  pendingAgentAction?: Record<string, unknown> | null;
  lastExecutedActionFingerprint?: string;
  lastExecutedActionAt?: number;
  lastAssistantResponseFingerprint?: string;
}

type LoadConversationDeps = {
  getWhatsAppConversation: (tenantId: number, jid: string) => Promise<{ id: number } | null | undefined>;
  getMessagesByConversation: (conversationId: number) => Promise<Array<{ role: string; content: string; createdAt: Date }>>;
};

const conversationContexts = new Map<string, ConversationContext>();
export const CONTEXT_TTL = 24 * 60 * 60 * 1000;
export const MAX_CONTEXT_MESSAGES = 30;

function getConversationContextKey(jid: string, tenantId: number): string {
  return `${tenantId}:${jid}`;
}

function parseConversationContextKey(key: string): { tenantId: number; jid: string } {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) {
    return { tenantId: 0, jid: key };
  }

  return {
    tenantId: Number(key.slice(0, separatorIndex)) || 0,
    jid: key.slice(separatorIndex + 1),
  };
}

export function createEmptyConversationContext(): ConversationContext {
  return { messages: [], lastActivity: Date.now() };
}

export function touchConversationContext(ctx: ConversationContext): ConversationContext {
  ctx.lastActivity = Date.now();
  return ctx;
}

export function setConversationLastUserRequest(ctx: ConversationContext, request: string): ConversationContext {
  ctx.lastUserRequest = request;
  ctx.lastActivity = Date.now();
  return ctx;
}

export function setConversationPendingAgentAction(
  ctx: ConversationContext,
  pendingAgentAction: Record<string, unknown> | null,
): ConversationContext {
  ctx.pendingAgentAction = pendingAgentAction;
  ctx.lastActivity = Date.now();
  return ctx;
}

export function setConversationLastExecutedAction(
  ctx: ConversationContext,
  fingerprint: string,
): ConversationContext {
  ctx.lastExecutedActionFingerprint = fingerprint;
  ctx.lastExecutedActionAt = Date.now();
  ctx.lastActivity = Date.now();
  return ctx;
}

export function setConversationLastAssistantResponse(
  ctx: ConversationContext,
  fingerprint: string,
): ConversationContext {
  ctx.lastAssistantResponseFingerprint = fingerprint;
  ctx.lastActivity = Date.now();
  return ctx;
}

export function appendMessageToConversationContext(
  ctx: ConversationContext,
  message: SecretaryConversationMessage,
  maxMessages: number = MAX_CONTEXT_MESSAGES,
): ConversationContext {
  ctx.messages.push(message);
  if (ctx.messages.length > maxMessages) {
    ctx.messages = ctx.messages.slice(-maxMessages);
  }
  ctx.lastActivity = Date.now();
  return ctx;
}

export async function loadConversationContextFromDb(
  jid: string,
  tenantId: number,
  deps: LoadConversationDeps,
): Promise<ConversationContext> {
  const key = getConversationContextKey(jid, tenantId);
  try {
    const conv = await deps.getWhatsAppConversation(tenantId, jid);
    if (conv) {
      const dbMessages = await deps.getMessagesByConversation(conv.id);
      const recent = dbMessages.slice(-MAX_CONTEXT_MESSAGES);
      const ctx: ConversationContext = {
        messages: recent.map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
        lastActivity: recent.length > 0 ? new Date(recent[recent.length - 1].createdAt).getTime() : Date.now(),
      };
      conversationContexts.set(key, ctx);
      return ctx;
    }
  } catch (error) {
    console.error("[Secretary] Error loading context from DB:", error);
  }

  const ctx = createEmptyConversationContext();
  conversationContexts.set(key, ctx);
  return ctx;
}

export async function getOrCreateConversationContext(
  jid: string,
  tenantId: number,
  deps: LoadConversationDeps,
): Promise<ConversationContext> {
  const key = getConversationContextKey(jid, tenantId);
  const existing = conversationContexts.get(key);
  if (existing && Date.now() - existing.lastActivity < CONTEXT_TTL) {
    return touchConversationContext(existing);
  }
  return loadConversationContextFromDb(jid, tenantId, deps);
}

export function clearConversationContext(jid: string, tenantId?: number): void {
  if (typeof tenantId === "number") {
    conversationContexts.delete(getConversationContextKey(jid, tenantId));
    return;
  }

  const suffix = `:${jid}`;
  for (const key of conversationContexts.keys()) {
    if (key.endsWith(suffix)) {
      conversationContexts.delete(key);
    }
  }
}

export function listActiveConversationJids(): string[] {
  const active = new Set<string>();
  const now = Date.now();
  conversationContexts.forEach((ctx, key) => {
    if (now - ctx.lastActivity < CONTEXT_TTL) {
      active.add(parseConversationContextKey(key).jid);
    }
  });
  return Array.from(active);
}
