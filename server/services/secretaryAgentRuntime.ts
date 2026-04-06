import crypto from "crypto";
import { storage } from "../storage";
import type { AgentRun } from "@shared/schema";

function shortText(value: string | undefined, max = 400) {
  return (value || "").substring(0, max);
}

export function buildSecretaryIdempotencyKey(params: {
  tenantId: number;
  jid: string;
  message: string;
  mediaType?: string | null;
  mediaFileName?: string | null;
}) {
  const hash = crypto.createHash("sha256");
  hash.update(`${params.tenantId}::${params.jid}::${params.message || ""}::${params.mediaType || ""}::${params.mediaFileName || ""}`);
  return hash.digest("hex");
}

export async function safeCreateAgentRun(params: {
  tenantId: number;
  jid: string;
  contactName: string;
  messageText: string;
  actorType: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<AgentRun | null> {
  try {
    return await storage.createAgentRun({
      tenantId: params.tenantId,
      jid: params.jid,
      contactName: params.contactName,
      messageText: params.messageText,
      actorType: params.actorType,
      intentType: "unknown",
      status: "received",
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata || {},
    });
  } catch (error) {
    console.error("[Secretary] Failed to create agent run:", error);
    return null;
  }
}

export async function safeUpdateAgentRun(runId: number | undefined, data: Record<string, unknown>) {
  if (!runId) return;
  try {
    await storage.updateAgentRun(runId, data as any);
  } catch (error) {
    console.error("[Secretary] Failed to update agent run:", error);
  }
}

export async function safeCreateAgentStep(params: {
  runId?: number;
  tenantId: number;
  stepType: string;
  status: string;
  input?: unknown;
  output?: unknown;
}) {
  if (!params.runId) return;
  try {
    await storage.createAgentStep({
      runId: params.runId,
      tenantId: params.tenantId,
      stepType: params.stepType,
      status: params.status,
      input: params.input as any,
      output: params.output as any,
      finishedAt: new Date(),
    });
  } catch (error) {
    console.error("[Secretary] Failed to create agent step:", error);
  }
}

export function buildAgentResponsePreview(text: string | undefined) {
  return shortText(text, 500);
}
