import { storage } from "../storage";
import { escavadorService } from "./escavador";
import { syncDeadlinesToAgenda } from "./agendaSync";
import { autoAnalyzeAfterSync } from "./intimacaoAnalysis";
import type { InsertCaseMovement } from "@shared/schema";

const SYNC_INTERVAL_MS = 1 * 60 * 60 * 1000;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

function normalizeDescription(desc: string): string {
  return desc.toLowerCase().replace(/\s+/g, " ").trim().substring(0, 120);
}

function buildDedupeKey(date: Date | string, description: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dateStr = d.toISOString().split("T")[0];
  return `${dateStr}|${normalizeDescription(description)}`;
}

async function syncEscavadorMovements(caseItem: { id: number; caseNumber: string }, existingKeys: Set<string>, existingCodes: Set<string>): Promise<{ newMovements: number }> {
  if (!escavadorService.isConfigured()) return { newMovements: 0 };

  let newMovements = 0;
  try {
    let page = 1;
    let totalFetched = 0;
    const maxPages = 5;

    while (page <= maxPages) {
      const { movimentacoes, total } = await escavadorService.getMovements(caseItem.caseNumber, page);
      if (!movimentacoes || movimentacoes.length === 0) break;

      const newEscavadorMovs: InsertCaseMovement[] = [];

      for (const mov of movimentacoes) {
        const movDate = new Date(mov.data);
        const description = mov.conteudo || "Movimentação sem descrição";
        const escavadorId = mov.id ? `esc_${mov.id}` : null;
        const dedupeKey = buildDedupeKey(movDate, description);

        if (existingKeys.has(dedupeKey)) {
          continue;
        }
        if (escavadorId && existingCodes.has(escavadorId)) {
          continue;
        }

        existingKeys.add(dedupeKey);
        if (escavadorId) existingCodes.add(escavadorId);

        newEscavadorMovs.push({
          caseId: caseItem.id,
          date: movDate,
          type: classifyEscavadorMovement(description),
          description,
          teor: null,
          source: "Escavador",
          datajudCode: escavadorId,
          datajudPayload: mov as any,
          requiresAction: requiresActionCheck(description),
        });
      }

      if (newEscavadorMovs.length > 0) {
        await storage.createCaseMovements(newEscavadorMovs);
        newMovements += newEscavadorMovs.length;
      }

      totalFetched += movimentacoes.length;
      if (totalFetched >= total) break;
      page++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err: any) {
    console.error(`[Escavador Sync] Error syncing case ${caseItem.caseNumber}:`, err.message);
  }

  return { newMovements };
}

function classifyEscavadorMovement(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("intimação") || lower.includes("intimacao") || lower.includes("intimado") || lower.includes("intimada")) return "Intimação";
  if (lower.includes("sentença") || lower.includes("sentenca")) return "Sentença";
  if (lower.includes("decisão") || lower.includes("decisao") || lower.includes("despacho")) return "Decisão";
  if (lower.includes("audiência") || lower.includes("audiencia")) return "Audiência";
  if (lower.includes("julgamento") || lower.includes("acórdão") || lower.includes("acordao")) return "Julgamento";
  if (lower.includes("petição") || lower.includes("peticao") || lower.includes("manifestação") || lower.includes("manifestacao")) return "Petição";
  if (lower.includes("recurso") || lower.includes("agravo") || lower.includes("apelação") || lower.includes("apelacao")) return "Recurso";
  if (lower.includes("citação") || lower.includes("citacao") || lower.includes("citado")) return "Citação";
  if (lower.includes("trânsito") || lower.includes("transito") || lower.includes("transitado")) return "Trânsito em Julgado";
  if (lower.includes("expedição") || lower.includes("expedicao") || lower.includes("expedido") || lower.includes("alvará") || lower.includes("alvara")) return "Expedição";
  return "Movimentação";
}

function requiresActionCheck(description: string): boolean {
  const lower = description.toLowerCase();
  return lower.includes("intimação") || lower.includes("intimacao") || lower.includes("intimado") || lower.includes("intimada") ||
    lower.includes("prazo") || lower.includes("citação") || lower.includes("citacao") ||
    lower.includes("audiência") || lower.includes("audiencia") ||
    lower.includes("manifestar") || lower.includes("manifestação") || lower.includes("manifestacao") ||
    lower.includes("oportunizo") || lower.includes("oportunizando");
}

async function syncAllCases(tenantId: number): Promise<{ synced: number; errors: number; newMovements: number }> {
  if (isSyncing) {
    console.log("[Sync] Already syncing, skipping...");
    return { synced: 0, errors: 0, newMovements: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let errors = 0;
  let escavadorNew = 0;

  try {
    const allCases = await storage.getCasesByTenant(tenantId);
    const syncCases = allCases.filter(c => c.caseNumber && c.caseNumber.length > 10);

    let escavadorAvailable = escavadorService.isConfigured();
    console.log(`[Sync] Starting sync for ${syncCases.length} cases (Escavador: ${escavadorAvailable ? "enabled" : "disabled"})...`);

    if (!escavadorAvailable) {
      console.log("[Sync] Escavador not configured, sync disabled");
      isSyncing = false;
      return { synced: 0, errors: 0, newMovements: 0 };
    }

    if (syncCases.length > 0) {
      try {
        console.log(`[Sync] Testing Escavador connection with first case...`);
        await escavadorService.requestProcessUpdate(syncCases[0].caseNumber);
        console.log(`[Sync] Escavador connection OK, requesting updates for remaining ${syncCases.length - 1} cases...`);
        let updatesSent = 1;
        for (let i = 1; i < syncCases.length; i++) {
          try {
            await escavadorService.requestProcessUpdate(syncCases[i].caseNumber);
            updatesSent++;
            await new Promise(resolve => setTimeout(resolve, 400));
          } catch (err: any) {
            console.warn(`[Sync] Escavador update request failed at case ${i + 1}/${syncCases.length}: ${err.message} - stopping further requests`);
            break;
          }
        }
        console.log(`[Sync] Escavador update requests sent: ${updatesSent}/${syncCases.length}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (err: any) {
        const msg = err.message || "";
        console.error(`[Sync] Escavador unavailable (${msg})`);
        escavadorAvailable = false;
      }
    }

    for (const caseItem of syncCases) {
      try {
        const existingMovements = await storage.getCaseMovements(caseItem.id);
        const existingCodes = new Set(existingMovements.map(m => m.datajudCode).filter((c): c is string => !!c));
        const existingKeys = new Set(existingMovements.map(m => buildDedupeKey(m.date, m.description)));

        if (escavadorAvailable) {
          const escResult = await syncEscavadorMovements(caseItem, existingKeys, existingCodes);
          escavadorNew += escResult.newMovements;
        }

        synced++;
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        errors++;
        console.error(`[Sync] Error syncing case ${caseItem.caseNumber}:`, err);
      }
    }

    console.log(`[Sync] Complete: ${synced} synced, ${errors} errors, ${escavadorNew} new movements (Escavador)`);

    if (escavadorNew > 0) {
      const agendaCreated = await syncDeadlinesToAgenda(tenantId);
      console.log(`[Sync] Synced ${agendaCreated} events to agenda`);
    }

    autoAnalyzeAfterSync(tenantId).catch(err => {
      console.error("[Sync] Auto-analysis after sync failed:", err);
    });
  } finally {
    isSyncing = false;
  }

  return { synced, errors, newMovements: escavadorNew };
}

function maskSecret(val: string | undefined): string {
  if (!val) return "NOT SET";
  if (val.length <= 8) return `SET (${val.length} chars)`;
  return `${val.substring(0, 4)}...${val.substring(val.length - 4)} (${val.length} chars)`;
}

export function startDatajudSyncService(tenantId: number = 1) {
  const hasEscavador = escavadorService.isConfigured();

  const escToken = process.env.ESCAVADOR_API_KEY;
  const escTrimmed = escToken?.trim();
  const escHasWhitespace = escToken && escToken !== escTrimmed;

  console.log(`[Sync] Secret diagnostics (env: ${process.env.NODE_ENV || "development"}):`);
  console.log(`[Sync]   ESCAVADOR_API_KEY: ${maskSecret(escTrimmed)} ${escHasWhitespace ? "[HAS WHITESPACE - trimmed]" : "[clean]"}`);
  console.log(`[Sync]   ESCAVADOR raw length: ${escToken?.length || 0}, trimmed: ${escTrimmed?.length || 0}`);
  console.log(`[Sync]   DATABASE_URL host: ${process.env.PGHOST || "unknown"}`);

  if (!hasEscavador) {
    console.log("[Sync] Escavador API key not configured, sync service disabled");
    return;
  }

  console.log(`[Sync] Service started (Escavador). Sync every ${SYNC_INTERVAL_MS / (60 * 60 * 1000)}h. Env: ${process.env.NODE_ENV || "development"}`);

  setTimeout(() => {
    console.log("[Sync] Running initial sync on startup...");
    syncAllCases(tenantId).catch(err => {
      console.error("[Sync] Initial sync failed:", err);
    });
  }, 5 * 60 * 1000);

  syncTimer = setInterval(() => {
    syncAllCases(tenantId).catch(err => {
      console.error("[Sync] Scheduled sync failed:", err);
    });
  }, SYNC_INTERVAL_MS);
}

export function stopDatajudSyncService() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[Sync] Service stopped");
  }
}

export async function triggerManualSync(tenantId: number = 1) {
  return syncAllCases(tenantId);
}

const escavadorSyncProgressMap = new Map<number, { running: boolean; total: number; current: number; synced: number; errors: number; newMovements: number; currentCase: string; completedAt?: number }>();

export function getEscavadorSyncProgress(tenantId: number = 1) {
  const progress = escavadorSyncProgressMap.get(tenantId);
  if (!progress) return { running: false, total: 0, current: 0, synced: 0, errors: 0, newMovements: 0, currentCase: "", done: false };
  const done = !progress.running && (progress.total > 0 || !!progress.completedAt);
  return { ...progress, done };
}

export async function triggerEscavadorOnlySync(tenantId: number = 1) {
  if (!escavadorService.isConfigured()) {
    return { success: false, error: "Escavador API key not configured" };
  }

  const existing = escavadorSyncProgressMap.get(tenantId);
  if (existing?.running) {
    return { success: false, error: "Sync already in progress" };
  }

  const allCases = await storage.getCasesByTenant(tenantId);
  const syncCases = allCases.filter(c => c.caseNumber && c.caseNumber.length > 10);

  const progress: {
    running: boolean;
    total: number;
    current: number;
    synced: number;
    errors: number;
    newMovements: number;
    currentCase: string;
    completedAt?: number;
  } = { running: true, total: syncCases.length, current: 0, synced: 0, errors: 0, newMovements: 0, currentCase: "" };
  escavadorSyncProgressMap.set(tenantId, progress);

  (async () => {
    try {
      for (let i = 0; i < syncCases.length; i++) {
        const caseItem = syncCases[i];
        progress.current = i + 1;
        progress.currentCase = caseItem.caseNumber;

        try {
          await escavadorService.requestProcessUpdate(caseItem.caseNumber);
          await new Promise(resolve => setTimeout(resolve, 2000));

          const existingMovements = await storage.getCaseMovements(caseItem.id);
          const existingCodes = new Set(existingMovements.map(m => m.datajudCode).filter((c): c is string => !!c));
          const existingKeys = new Set(existingMovements.map(m => buildDedupeKey(m.date, m.description)));

          const result = await syncEscavadorMovements(caseItem, existingKeys, existingCodes);
          progress.newMovements += result.newMovements;
          progress.synced++;
        } catch (err: any) {
          progress.errors++;
          console.error(`[Escavador Sync] Error for ${caseItem.caseNumber}: ${err.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (progress.newMovements > 0) {
        const agendaCreated = await syncDeadlinesToAgenda(tenantId);
        console.log(`[Escavador Sync] Synced ${agendaCreated} events to agenda`);
      }

      autoAnalyzeAfterSync(tenantId).catch(err => {
        console.error("[Escavador Sync] Auto-analysis failed:", err);
      });

      console.log(`[Escavador Sync] Complete: ${progress.synced}/${progress.total} cases, ${progress.newMovements} new movements, ${progress.errors} errors`);
    } finally {
      progress.running = false;
      progress.completedAt = Date.now();
    }
  })();

  return { success: true, totalCases: syncCases.length };
}
