import makeWASocket, { Browsers, DisconnectReason, WASocket, type AuthenticationCreds, type SignalDataTypeMap, initAuthCreds, proto, BufferJSON, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, isNull, isNotNull, inArray, gte, desc, sql } from "drizzle-orm";
import { caseMovements, cases, whatsappAuthState, emails, emailFolders } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
// @ts-ignore
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { SocksProxyAgent } from "socks-proxy-agent";

let sock: WASocket | null = null;
let qrCodeDataUrl: string | null = null;
let connectionStatus: "disconnected" | "connecting" | "connected" | "qr_ready" = "disconnected";
let statusMessage = "";
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let activeTenantId: number = 1;
let reconnectAttempts: number = 0;
let useProxyOnNextAttempt: boolean = false;
let directModeWorks: boolean = false;
let hardTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let isAwaitingQrScan: boolean = false;
let lastConnectedAt: number = 0;
let lastReceivedMessageAt: number | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 60000;
const COOLDOWN_DELAY = 10 * 60 * 1000;

const AUTH_DIR = "./whatsapp_auth";

const MANUAL_SILENCE_DURATION_MS = 30 * 60 * 1000;
const manualSendSilenceMap = new Map<string, number>();

function extractPhoneFromJid(jid: string): string {
  if (jid.endsWith("@s.whatsapp.net")) {
    return jid.replace("@s.whatsapp.net", "").split(":")[0];
  }
  if (jid.endsWith("@lid")) {
    return jid.replace("@lid", "");
  }
  return jid.split("@")[0].split(":")[0];
}

async function resolveJidToPhone(jid: string): Promise<string> {
  if (jid.endsWith("@g.us")) return jid;
  if (jid.endsWith("@s.whatsapp.net")) {
    return jid.replace("@s.whatsapp.net", "").split(":")[0];
  }
  if (jid.endsWith("@lid")) {
    const lid = jid.replace("@lid", "");
    const phone = await storage.getPhoneByLid(lid);
    if (phone) return phone;
    return lid;
  }
  return jid.split("@")[0];
}

async function activateManualSilence(jid: string): Promise<void> {
  const phone = await resolveJidToPhone(jid);
  const expiresAt = Date.now() + MANUAL_SILENCE_DURATION_MS;
  manualSendSilenceMap.set(phone, expiresAt);
  console.log(`[WhatsApp] Silêncio ativado para ${phone} (30 min)`);
}

async function isManualSilenced(jid: string): Promise<boolean> {
  const phone = await resolveJidToPhone(jid);
  const expiresAt = manualSendSilenceMap.get(phone);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    manualSendSilenceMap.delete(phone);
    console.log(`[WhatsApp] Silêncio expirado para ${phone}`);
    return false;
  }
  return true;
}

async function saveLidMapping(lidJid: string, phone: string): Promise<void> {
  const lid = lidJid.replace("@lid", "");
  const cleanPhone = phone.replace(/\D/g, "").replace("@s.whatsapp.net", "");
  if (!lid || !cleanPhone || lid === cleanPhone) return;
  try {
    await storage.upsertLidMapping(lid, cleanPhone);
    console.log(`[WhatsApp] LID mapping saved: ${lid} ↔ ${cleanPhone}`);
  } catch (e) {
    console.error(`[WhatsApp] Failed to save LID mapping: ${e}`);
  }
}

let lidMigrationDone = false;

async function populateLidMappingsFromKnownPhones(): Promise<number> {
  if (!sock || connectionStatus !== "connected") return 0;

  const allUsers = await storage.getUsersByTenant(activeTenantId);
  const contacts = await storage.getWhatsappContacts(activeTenantId);
  const allClients = await storage.getClientsByTenant(activeTenantId);

  const phoneSet = new Set<string>();
  for (const u of allUsers) {
    if (u.phone) phoneSet.add(normalizeBrazilianPhone(u.phone));
  }
  for (const c of contacts) {
    if (c.phoneNumber) phoneSet.add(normalizeBrazilianPhone(c.phoneNumber));
  }
  for (const cl of allClients) {
    if (cl.phone) phoneSet.add(normalizeBrazilianPhone(cl.phone));
  }

  let resolved = 0;

  try {
    const lidMapping = (sock as any)?.authState?.creds?.lidMapping ||
                       (sock as any)?.signalRepository?.lidMapping;
    if (lidMapping) {
      console.log(`[WhatsApp] LID mapping store available, checking...`);
      if (typeof lidMapping.getLIDForPN === "function") {
        for (const phone of phoneSet) {
          if (!phone || phone.length < 10) continue;
          try {
            const lid = await lidMapping.getLIDForPN(`${phone}@s.whatsapp.net`);
            if (lid && typeof lid === "string" && lid.includes("@lid")) {
              const lidId = lid.replace("@lid", "");
              await storage.upsertLidMapping(lidId, phone);
              resolved++;
              console.log(`[WhatsApp] LID from signalRepo: ${phone} → ${lidId}`);
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn(`[WhatsApp] signalRepository lidMapping access failed: ${e}`);
  }

  for (const phone of phoneSet) {
    if (!phone || phone.length < 10) continue;
    const existing = await storage.getLidByPhone(phone);
    if (existing) { resolved++; continue; }

    try {
      const results = await sock!.onWhatsApp(`+${phone}`);
      if (results && results.length > 0) {
        const result = results[0];
        if (result?.exists && result?.jid) {
          if (result.jid.endsWith("@lid")) {
            const lid = result.jid.replace("@lid", "");
            await storage.upsertLidMapping(lid, phone);
            resolved++;
            console.log(`[WhatsApp] LID populate (onWhatsApp): ${phone} → ${lid}`);
          } else {
            console.log(`[WhatsApp] onWhatsApp for ${phone} returned non-LID: ${result.jid}`);
          }
        }
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`[WhatsApp] LID populate failed for ${phone}: ${e}`);
    }
  }
  console.log(`[WhatsApp] LID populate complete: ${resolved} mappings`);
  return resolved;
}

async function populateLidMappingsFromAuthState(): Promise<number> {
  const rows = await db.execute(
    sql`SELECT key, value FROM whatsapp_auth_state WHERE key LIKE 'lid-mapping-%_reverse' AND tenant_id = ${activeTenantId}`
  );

  let resolved = 0;
  for (const row of rows.rows as any[]) {
    const key = row.key as string;
    const phoneRaw = (row.value as string).replace(/"/g, "");
    const lid = key.replace("lid-mapping-", "").replace("_reverse", "");
    if (!lid || !phoneRaw || !/^\d{10,15}$/.test(phoneRaw)) continue;

    try {
      await storage.upsertLidMapping(lid, phoneRaw);
      resolved++;
      console.log(`[WhatsApp] LID from authState: ${lid} ↔ ${phoneRaw}`);
    } catch (e) {
      console.warn(`[WhatsApp] Failed to save authState LID mapping ${lid}: ${e}`);
    }
  }
  console.log(`[WhatsApp] LID authState populate: ${resolved} mappings`);
  return resolved;
}

async function migrateLidMessagesInDb(): Promise<number> {
  const lidJids = await db.execute(
    sql`SELECT DISTINCT jid FROM whatsapp_messages WHERE jid LIKE '%@lid' AND tenant_id = ${activeTenantId}`
  );

  let migrated = 0;
  for (const row of lidJids.rows as any[]) {
    const lidJid = row.jid as string;
    const lid = lidJid.replace("@lid", "");
    const phone = await storage.getPhoneByLid(lid);
    if (!phone) {
      console.log(`[WhatsApp] LID migration: no phone mapping for ${lid}, skipping`);
      continue;
    }

    const newJid = `${phone}@s.whatsapp.net`;

    await db.execute(sql`
      UPDATE whatsapp_messages 
      SET jid = ${newJid},
          sender_number = CASE 
            WHEN sender_number LIKE '%@lid' OR sender_number = ${lid} OR sender_number = ${lidJid}
            THEN ${phone}
            ELSE sender_number
          END
      WHERE jid = ${lidJid} AND tenant_id = ${activeTenantId}
    `);

    const count = await db.execute(sql`SELECT COUNT(*) as cnt FROM whatsapp_messages WHERE jid = ${newJid} AND tenant_id = ${activeTenantId}`);
    console.log(`[WhatsApp] LID migration: ${lidJid} → ${newJid} (total msgs now: ${(count.rows[0] as any).cnt})`);
    migrated++;
  }

  console.log(`[WhatsApp] LID migration complete: ${migrated} JIDs converted`);
  return migrated;
}

async function runLidMigration(): Promise<{ populated: number; migrated: number }> {
  if (lidMigrationDone) return { populated: 0, migrated: 0 };

  console.log("[WhatsApp] Starting LID→phone migration...");
  const fromAuthState = await populateLidMappingsFromAuthState();
  let fromPhones = 0;
  if (sock && connectionStatus === "connected") {
    fromPhones = await populateLidMappingsFromKnownPhones();
  }
  const migrated = await migrateLidMessagesInDb();
  lidMigrationDone = true;
  return { populated: fromAuthState + fromPhones, migrated };
}

async function resolvePhoneToLidJid(phoneNumber: string): Promise<string | null> {
  const cleaned = phoneNumber.replace(/\D/g, "");

  const lid = await storage.getLidByPhone(cleaned);
  if (lid) {
    console.log(`[WhatsApp] DB resolved ${cleaned} → LID ${lid}`);
    return `${lid}@lid`;
  }

  const variants: string[] = [cleaned];
  if (cleaned.startsWith("55") && cleaned.length === 13) {
    variants.push(cleaned.substring(0, 4) + cleaned.substring(5));
  }
  if (cleaned.startsWith("55") && cleaned.length === 12) {
    variants.push(cleaned.substring(0, 4) + "9" + cleaned.substring(4));
  }
  for (const variant of variants) {
    if (variant === cleaned) continue;
    const variantLid = await storage.getLidByPhone(variant);
    if (variantLid) {
      console.log(`[WhatsApp] DB resolved variant ${variant} → LID ${variantLid}`);
      await storage.upsertLidMapping(variantLid, cleaned);
      return `${variantLid}@lid`;
    }
  }

  if (sock && connectionStatus === "connected") {
    try {
      const [result] = await sock.onWhatsApp(`+${cleaned}`);
      if (result?.exists && result?.jid) {
        console.log(`[WhatsApp] onWhatsApp resolved ${cleaned} → ${result.jid}`);
        if (result.jid.endsWith("@lid")) {
          const resolvedLid = result.jid.replace("@lid", "");
          await storage.upsertLidMapping(resolvedLid, cleaned);
          return result.jid;
        }
        return result.jid;
      }
    } catch (e) {
      console.warn(`[WhatsApp] onWhatsApp lookup failed for ${cleaned}: ${e}`);
    }
  }

  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [jid, expiresAt] of manualSendSilenceMap) {
    if (now >= expiresAt) {
      manualSendSilenceMap.delete(jid);
    }
  }
}, 5 * 60 * 1000);

async function usePostgresAuthState(tenantId: number) {
  const writeData = async (key: string, data: any) => {
    const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
    await db.insert(whatsappAuthState)
      .values({ tenantId, key, value: serialized })
      .onConflictDoUpdate({
        target: [whatsappAuthState.tenantId, whatsappAuthState.key],
        set: { value: serialized },
        setWhere: and(eq(whatsappAuthState.tenantId, tenantId), eq(whatsappAuthState.key, key)),
      })
      .catch(async () => {
        const existing = await db.select().from(whatsappAuthState)
          .where(and(eq(whatsappAuthState.tenantId, tenantId), eq(whatsappAuthState.key, key)));
        if (existing.length > 0) {
          await db.update(whatsappAuthState).set({ value: serialized })
            .where(and(eq(whatsappAuthState.tenantId, tenantId), eq(whatsappAuthState.key, key)));
        } else {
          await db.insert(whatsappAuthState).values({ tenantId, key, value: serialized });
        }
      });
  };

  const readData = async (key: string) => {
    const rows = await db.select().from(whatsappAuthState)
      .where(and(eq(whatsappAuthState.tenantId, tenantId), eq(whatsappAuthState.key, key)));
    if (rows.length === 0) return null;
    return JSON.parse(JSON.stringify(rows[0].value), BufferJSON.reviver);
  };

  const removeData = async (key: string) => {
    await db.delete(whatsappAuthState)
      .where(and(eq(whatsappAuthState.tenantId, tenantId), eq(whatsappAuthState.key, key)));
  };

  const creds: AuthenticationCreds = (await readData("creds")) || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
        const data: { [id: string]: any } = {};
        for (const id of ids) {
          const value = await readData(`${type}-${id}`);
          if (value) {
            if (type === "app-state-sync-key" && value) {
              data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
            } else {
              data[id] = value;
            }
          }
        }
        return data;
      },
      set: async (data: any) => {
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            if (value) {
              await writeData(`${category}-${id}`, value);
            } else {
              await removeData(`${category}-${id}`);
            }
          }
        }
      },
    },
  };

  const saveCreds = async () => {
    await writeData("creds", state.creds);
  };

  return { state, saveCreds };
}

async function hasPostgresCredentials(tenantId: number): Promise<boolean> {
  try {
    const rows = await db.select().from(whatsappAuthState)
      .where(and(eq(whatsappAuthState.tenantId, tenantId), eq(whatsappAuthState.key, "creds")));
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function clearPostgresCredentials(tenantId: number): Promise<void> {
  try {
    await db.delete(whatsappAuthState).where(eq(whatsappAuthState.tenantId, tenantId));
    console.log("[WhatsApp] PostgreSQL credentials cleared");
  } catch (e) {
    console.error("[WhatsApp] Error clearing PG credentials:", e);
  }
}

function getReconnectDelay(attempt: number): number {
  return Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
}

if (process.env.WHATSAPP_PROXY_URL) {
  console.log("[WhatsApp] Proxy disponível: DataImpulse. Estratégia: direto primeiro, proxy como fallback.");
} else {
  console.log("[WhatsApp] Sem proxy configurado — conexão direta apenas");
}

function getProxyAgent(): SocksProxyAgent | undefined {
  const proxyUrl = process.env.WHATSAPP_PROXY_URL;
  if (proxyUrl) {
    return new SocksProxyAgent(proxyUrl);
  }
  return undefined;
}

function hasAuthCredentials(): boolean {
  try {
    if (!fs.existsSync(AUTH_DIR)) return false;
    const files = fs.readdirSync(AUTH_DIR);
    return files.length > 0;
  } catch {
    return false;
  }
}

let _cachedHasDbCreds: boolean | null = null;
let _cachedHasDbCredsTime: number = 0;

function clearHardTimeout() {
  if (hardTimeoutHandle) {
    clearTimeout(hardTimeoutHandle);
    hardTimeoutHandle = null;
  }
}


function normalizeBrazilianPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Already has international code that is NOT Brazil → return as-is
  if (cleaned.length >= 12 && !cleaned.startsWith("55")) {
    console.log(`[WhatsApp] Phone appears international, no normalization: ${cleaned}`);
    return cleaned;
  }

  // Local BR number (10 or 11 digits, no country code)
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }

  // 55 + DDD(2) + number(8) = 12 digits → check if mobile missing 9th digit
  if (cleaned.length === 12 && cleaned.startsWith("55")) {
    const ddd = parseInt(cleaned.substring(2, 4));
    const number = cleaned.substring(4);
    const firstDigit = parseInt(number.charAt(0));
    // Mobile numbers in Brazil: first digit after DDD is 6-9 range
    // Landlines start with 2-5. Only add 9 for mobile-range numbers.
    if (firstDigit >= 6 && firstDigit <= 9) {
      cleaned = "55" + cleaned.substring(2, 4) + "9" + number;
      console.log(`[WhatsApp] Added 9th digit for mobile: ${phone} → ${cleaned}`);
    }
  }

  console.log(`[WhatsApp] Normalized phone: ${phone} → ${cleaned}`);
  return cleaned;
}

async function scheduleReconnect(reason: string) {
  const hasCreds = await hasPostgresCredentials(activeTenantId);
  if (!hasCreds && !isAwaitingQrScan) {
    connectionStatus = "disconnected";
    statusMessage = "Sem credenciais. Conecte manualmente via Configurações.";
    console.log(`[WhatsApp] No credentials in DB — skipping auto-reconnect (${reason}). Manual QR scan required.`);
    reconnectAttempts = 0;
    return;
  }

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    useProxyOnNextAttempt = !useProxyOnNextAttempt;
    const delay = getReconnectDelay(reconnectAttempts);
    connectionStatus = "disconnected";
    statusMessage = `Reconectando (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
    console.log(`[WhatsApp] Reconnect scheduled: ${reason}. Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}, delay ${delay/1000}s`);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => {
      whatsappService.initialize(activeTenantId, false);
    }, delay);
  } else {
    connectionStatus = "disconnected";
    isAwaitingQrScan = false;
    statusMessage = `Cooldown 10min após ${MAX_RECONNECT_ATTEMPTS} tentativas...`;
    console.log(`[WhatsApp] All ${MAX_RECONNECT_ATTEMPTS} attempts exhausted (${reason}). Cooldown ${COOLDOWN_DELAY/60000}min, then reset.`);
    reconnectAttempts = 0;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(async () => {
      console.log("[WhatsApp] Cooldown finished. Checking credentials before restart.");
      const hasCreds = await hasPostgresCredentials(activeTenantId);
      if (hasCreds) {
        whatsappService.initialize(activeTenantId, false);
      } else {
        console.log("[WhatsApp] No credentials after cooldown. Waiting for manual connect.");
        statusMessage = "";
      }
    }, COOLDOWN_DELAY);
  }
}

export const whatsappService = {
  getStatus() {
    return {
      status: connectionStatus,
      qrCode: qrCodeDataUrl,
      message: statusMessage,
    };
  },

  getSocket() {
    return sock;
  },

  async runLidMigration() {
    lidMigrationDone = false;
    return runLidMigration();
  },

  async hasCredentials(tenantId: number = 1): Promise<boolean> {
    return hasPostgresCredentials(tenantId);
  },

  async initialize(tenantId: number = 1, isManualConnect: boolean = true) {
    if (isManualConnect) {
      console.log("[WhatsApp] ========== MANUAL CONNECT REQUESTED ==========");
      clearHardTimeout();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (sock) {
        try { sock.end(undefined); } catch {}
        sock = null;
      }
      reconnectAttempts = 0;
      useProxyOnNextAttempt = false;
      directModeWorks = false;
      isAwaitingQrScan = true;
    } else {
      if (connectionStatus === "connected") {
        return;
      }
    }

    clearHardTimeout();
    activeTenantId = tenantId;
    connectionStatus = "connecting";
    qrCodeDataUrl = null;
    statusMessage = "Conectando ao WhatsApp...";

    try {
      if (isManualConnect) {
        await clearPostgresCredentials(tenantId);
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        console.log("[WhatsApp] Auth credentials cleared for fresh QR code");
      }
      const { state, saveCreds } = await usePostgresAuthState(tenantId);

      const silentLogger = {
        level: "silent" as const,
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        child: () => silentLogger,
      };

      const hasCreds = await hasPostgresCredentials(tenantId);
      const forceDirectMode = directModeWorks || hasCreds;
      const useProxy = !forceDirectMode && useProxyOnNextAttempt && !!process.env.WHATSAPP_PROXY_URL;
      const mode = useProxy ? "proxy" : "direct";
      console.log(`[WhatsApp] Attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} — mode: ${mode} (directWorks=${directModeWorks}, hasCreds=${hasCreds}, forceDirectMode=${forceDirectMode})`);

      let waVersion: [number, number, number] | undefined;
      try {
        const { version, isLatest } = await fetchLatestBaileysVersion();
        waVersion = version as [number, number, number];
        console.log(`[WhatsApp] Using WA version: ${waVersion.join(".")} (latest: ${isLatest})`);
      } catch (e) {
        console.log("[WhatsApp] Could not fetch latest version, using default");
      }

      const initSocketOpts: any = {
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 250,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        logger: silentLogger as any,
        ...(waVersion && { version: waVersion }),
        getMessage: async (key: { remoteJid?: string | null; id?: string | null }) => {
          if (!key.id || !activeTenantId) return undefined;
          try {
            const msg = await storage.getWhatsappMessageByMessageId(activeTenantId, key.id);
            if (msg?.messageProto) {
              return proto.Message.fromObject(JSON.parse(msg.messageProto));
            }
          } catch (e) {
            console.log(`[WhatsApp] getMessage error for key=${key.id}: ${e}`);
          }
          return undefined;
        },
      };

      if (useProxy) {
        const proxyAgent = getProxyAgent();
        if (proxyAgent) {
          initSocketOpts.agent = proxyAgent;
          console.log("[WhatsApp] Using SOCKS5 proxy agent");
        }
      } else {
        console.log("[WhatsApp] Connecting DIRECTLY (no proxy)");
      }

      try {
        lastReceivedMessageAt = await storage.getLastIncomingWhatsappTimestamp(tenantId);
        if (lastReceivedMessageAt) {
          const lagSec = Math.round((Date.now() - lastReceivedMessageAt) / 1000);
          console.log(`[WhatsApp] Last incoming message was ${lagSec}s ago — will use dynamic maxAge during warmup`);
        } else {
          console.log("[WhatsApp] No previous incoming messages found — warmup will use default 10 min maxAge");
        }
      } catch (e) {
        console.log("[WhatsApp] Could not fetch last incoming message timestamp:", e);
        lastReceivedMessageAt = null;
      }

      sock = makeWASocket(initSocketOpts);
      console.log("[WhatsApp] Socket created, awaiting connection events...");

      const HARD_TIMEOUT_MS = 75000;
      hardTimeoutHandle = setTimeout(async () => {
        console.error(`[WA-ERROR] Hard timeout (${HARD_TIMEOUT_MS/1000}s) — no connection event received. Killing socket. Mode: ${mode}`);
        if (sock) {
          try { sock.end(undefined); } catch {}
          sock = null;
        }
        qrCodeDataUrl = null;
        reconnectAttempts++;
        await scheduleReconnect(`hard timeout`);
      }, HARD_TIMEOUT_MS);

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        clearHardTimeout();

        if (qr) {
          try {
            qrCodeDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            connectionStatus = "qr_ready";
            directModeWorks = true;
            statusMessage = "Escaneie o QR Code com seu WhatsApp";
            console.log("[WhatsApp] ✓ QR Code generated! Waiting for scan...");
          } catch (err) {
            console.error("[WA-ERROR] Error generating QR image:", err);
          }
        }

        if (connection === "close") {
          const errorObj = lastDisconnect?.error as any;
          const statusCode = errorObj?.output?.statusCode;
          const errorMessage = errorObj?.message || "unknown";
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.error(`[WA-ERROR] Connection closed. Mode: ${mode}. Status: ${statusCode}. Error: ${errorMessage}. LoggedOut: ${isLoggedOut}. Attempt: ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);

          if (sock) {
            try { sock.end(undefined); } catch {}
          }
          sock = null;
          qrCodeDataUrl = null;

          if (isLoggedOut) {
            connectionStatus = "disconnected";
            statusMessage = "Desconectado (logout). Reconecte manualmente.";
            isAwaitingQrScan = false;
            console.log("[WhatsApp] Logged out by user. Not retrying.");
            await clearPostgresCredentials(activeTenantId);
            try {
              if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
              }
            } catch {}
          } else {
            reconnectAttempts++;
            await scheduleReconnect(`connection closed (${errorMessage})`);
          }
        } else if (connection === "open") {
          connectionStatus = "connected";
          reconnectAttempts = 0;
          useProxyOnNextAttempt = false;
          isAwaitingQrScan = false;
          qrCodeDataUrl = null;
          statusMessage = "Conectado ao WhatsApp";
          lastConnectedAt = Date.now();
          console.log("[WhatsApp] ✓ Connected successfully!");

          setTimeout(() => {
            if (lastReceivedMessageAt !== null) {
              console.log("[WhatsApp] Warmup window expired — resetting lastReceivedMessageAt");
              lastReceivedMessageAt = null;
            }
          }, 30000);

          setTimeout(async () => {
            try {
              const result = await runLidMigration();
              if (result.populated > 0 || result.migrated > 0) {
                console.log(`[WhatsApp] LID auto-migration: ${result.populated} mapped, ${result.migrated} JIDs converted`);
              }
            } catch (e) {
              console.error("[WhatsApp] LID auto-migration error:", e);
            }
          }, 10000);
        }
      });

      const processedMessageIds = new Set<string>();
      const secretaryDebounce = new Map<string, ReturnType<typeof setTimeout>>();
      const secretaryBuffer = new Map<string, { texts: string[], mediaItems: { msg: any, type: string }[], senderName: string }>();
      const DEBOUNCE_MS = 2500;

      const groupDocDebounce = new Map<string, ReturnType<typeof setTimeout>>();
      const groupDocBuffer = new Map<string, { docs: { msg: any, mediaType: string, senderName: string }[], texts: string[], senderName: string }>();
      const GROUP_DOC_DEBOUNCE_MS = 8000;
      const groupAuthCache = new Map<string, { allowed: boolean, expires: number }>();

      const isStandaloneShortMessage = (text?: string | null) => {
        const value = (text || "").trim().toLowerCase();
        if (!value) return false;
        if (value.length > 24) return false;
        return /^(oi|olá|ola|bom dia|boa tarde|boa noite|ok|certo|entendi|obrigado|obg|valeu|sim|não|nao)[!?.\s]*$/i.test(value);
      };

      const flushSecretaryBatch = async (jid: string, batch: { texts: string[], mediaItems: { msg: any, type: string }[], senderName: string }) => {
        if (await isManualSilenced(jid)) {
          const { findActiveNegotiationForJid } = await import("./secretary");
          const hasActiveNeg = await findActiveNegotiationForJid(jid, tenantId);
          if (hasActiveNeg) {
            console.log(`[WhatsApp] Silêncio ativo para ${jid}, mas negociação ativa encontrada — permitindo resposta do negociador`);
          } else {
            console.log(`[WhatsApp] Silêncio ativo para ${jid} — ignorando resposta automática`);
            return;
          }
        }

        try {
          const { secretaryService } = await import("./secretary");
          const mergedText = batch.texts.join("\n");

          if (batch.mediaItems.length > 0 && sock) {
            const { downloadMediaMessage, downloadContentFromMessage } = await import("@whiskeysockets/baileys");

            const downloadOneMedia = async (mMsg: any, mType: string): Promise<{ buffer: Buffer | null, mInner: any, mType: string, mMsg: any }> => {
              const mInner = mMsg.message?.ephemeralMessage?.message
                || mMsg.message?.viewOnceMessage?.message
                || mMsg.message?.viewOnceMessageV2?.message
                || mMsg.message?.documentWithCaptionMessage?.message
                || mMsg.message;
              let buffer: Buffer | null = null;

              if (mType === "audio") {
                const audioMsg = mInner?.audioMessage
                  || (mInner as any)?.ptvMessage
                  || mMsg.message?.ephemeralMessage?.message?.audioMessage
                  || mMsg.message?.viewOnceMessage?.message?.audioMessage
                  || mMsg.message?.viewOnceMessageV2?.message?.audioMessage
                  || (mMsg.message as any)?.ptvMessage;
                const isForwardedAudio = audioMsg?.contextInfo?.isForwarded || (audioMsg?.contextInfo?.forwardingScore || 0) > 0;
                console.log(`[WhatsApp] Audio detected - audioMsg found: ${!!audioMsg}, mimetype: ${audioMsg?.mimetype || "unknown"}, seconds: ${audioMsg?.seconds || "?"}, isPtv: ${!!(mInner as any)?.ptvMessage || !!(mMsg.message as any)?.ptvMessage}, isForwarded: ${isForwardedAudio}`);

                try {
                  const dlOptions: any = {};
                  if (sock?.updateMediaMessage) dlOptions.reuploadRequest = sock.updateMediaMessage;
                  buffer = await downloadMediaMessage(mMsg, "buffer", {}, dlOptions) as Buffer;
                  console.log(`[WhatsApp] Audio downloadMediaMessage: ${buffer?.length || 0} bytes`);
                } catch (dlErr1) {
                  console.warn(`[WhatsApp] Audio downloadMediaMessage failed: ${(dlErr1 as Error).message}`);
                }

                if ((!buffer || buffer.length === 0) && audioMsg) {
                  try {
                    const stream = await downloadContentFromMessage(audioMsg, "audio");
                    const chunks: Buffer[] = [];
                    for await (const chunk of stream) chunks.push(chunk as Buffer);
                    buffer = Buffer.concat(chunks);
                    console.log(`[WhatsApp] Audio stream download: ${buffer.length} bytes`);
                  } catch (streamErr) {
                    console.warn(`[WhatsApp] Audio stream also failed: ${(streamErr as Error).message}`);
                  }
                }

                if ((!buffer || buffer.length === 0) && isForwardedAudio && sock?.updateMediaMessage) {
                  try {
                    console.log(`[WhatsApp] Forwarded audio - trying updateMediaMessage + re-download...`);
                    const updatedMsg = await sock.updateMediaMessage(mMsg);
                    buffer = await downloadMediaMessage(updatedMsg || mMsg, "buffer", {}) as Buffer;
                    console.log(`[WhatsApp] Audio re-upload download: ${buffer?.length || 0} bytes`);
                  } catch (reupErr) {
                    console.error(`[WhatsApp] Audio re-upload fallback failed: ${(reupErr as Error).message}`);
                  }
                }
              } else {
                try {
                  const dlOptions: any = {};
                  if (sock?.updateMediaMessage) dlOptions.reuploadRequest = sock.updateMediaMessage;
                  buffer = await downloadMediaMessage(mMsg, "buffer", {}, dlOptions) as Buffer;
                  console.log(`[WhatsApp] downloadMediaMessage: ${buffer?.length || 0} bytes for ${mType}`);
                } catch (dlErr1) {
                  console.warn(`[WhatsApp] downloadMediaMessage failed for ${mType}: ${(dlErr1 as Error).message}`);
                }

                if (!buffer || buffer.length === 0) {
                  try {
                    const mediaMsg = mInner?.imageMessage || mInner?.documentMessage;
                    if (mediaMsg) {
                      const contentType = mType === "image" ? "image" : "document";
                      const stream = await downloadContentFromMessage(mediaMsg, contentType as any);
                      const chunks: Buffer[] = [];
                      for await (const chunk of stream) chunks.push(chunk as Buffer);
                      buffer = Buffer.concat(chunks);
                      console.log(`[WhatsApp] Stream fallback got ${buffer.length} bytes for ${mType}`);
                    }
                  } catch (dlErr2) {
                    console.error(`[WhatsApp] Stream fallback also failed: ${(dlErr2 as Error).message}`);
                  }
                }
              }
              return { buffer, mInner, mType, mMsg };
            };

            try {
              console.log(`[WhatsApp] Processing batch: ${batch.mediaItems.length} media item(s), texts: ${batch.texts.length}`);

              if (batch.mediaItems.length === 1) {
                const { buffer, mInner, mType, mMsg } = await downloadOneMedia(batch.mediaItems[0].msg, batch.mediaItems[0].type);
                if (buffer && buffer.length > 0) {
                  const base64 = buffer.toString("base64");
                  console.log(`[WhatsApp] Media downloaded: ${mType}, ${buffer.length} bytes`);
                  if (mType === "image") {
                    const caption = mInner?.imageMessage?.caption || "";
                    await secretaryService.processIncomingMessage(activeTenantId, jid, mergedText || caption || "[Imagem recebida]", batch.senderName, mType, base64);
                    return;
                  }
                  if (mType === "audio") {
                    const audioMime = mInner?.audioMessage?.mimetype || (mInner as any)?.ptvMessage?.mimetype || mMsg.message?.audioMessage?.mimetype || (mMsg.message as any)?.ptvMessage?.mimetype || "audio/ogg; codecs=opus";
                    console.log(`[WhatsApp] Audio: ${buffer.length} bytes, mime: ${audioMime}`);
                    await secretaryService.processIncomingMessage(activeTenantId, jid, mergedText || "[Áudio recebido]", batch.senderName, mType, base64, undefined, audioMime);
                    return;
                  }
                  if (mType === "document") {
                    const fileName = mInner?.documentMessage?.fileName || "documento";
                    const mimetype = mInner?.documentMessage?.mimetype || "";
                    await secretaryService.processIncomingMessage(activeTenantId, jid, mergedText || `[Documento: ${fileName}]`, batch.senderName, mType, base64, fileName, mimetype);
                    return;
                  }
                } else {
                  console.error(`[WhatsApp] Failed to download ${mType} media`);
                  if (mType === "audio") {
                    const failMsg = `${mergedText ? mergedText + "\n" : ""}[O áudio não pôde ser baixado para transcrição. Por favor, tente enviar novamente.]`;
                    await secretaryService.processIncomingMessage(activeTenantId, jid, failMsg, batch.senderName);
                    return;
                  }
                }
              } else {
                const docResults: { fileName: string, base64: string, mimetype: string }[] = [];
                let audioResult: { base64: string, mime: string } | null = null;
                let imageResult: { base64: string, caption: string } | null = null;

                for (const item of batch.mediaItems) {
                  try {
                    const { buffer, mInner, mType, mMsg } = await downloadOneMedia(item.msg, item.type);
                    if (!buffer || buffer.length === 0) {
                      console.warn(`[WhatsApp] Skipping failed download for ${mType}`);
                      continue;
                    }
                    const base64 = buffer.toString("base64");
                    console.log(`[WhatsApp] Multi-media downloaded: ${mType}, ${buffer.length} bytes`);

                    if (mType === "document") {
                      const fileName = mInner?.documentMessage?.fileName || "documento";
                      const mimetype = mInner?.documentMessage?.mimetype || "";
                      docResults.push({ fileName, base64, mimetype });
                    } else if (mType === "audio") {
                      const audioMime = mInner?.audioMessage?.mimetype || (mInner as any)?.ptvMessage?.mimetype || "audio/ogg; codecs=opus";
                      audioResult = { base64, mime: audioMime };
                    } else if (mType === "image") {
                      const caption = mInner?.imageMessage?.caption || "";
                      imageResult = { base64, caption };
                    }
                  } catch (itemErr) {
                    console.error(`[WhatsApp] Error downloading media item: ${(itemErr as Error).message}`);
                  }
                }

                if (audioResult) {
                  console.log(`[WhatsApp] Processing audio from multi-media batch`);
                  await secretaryService.processIncomingMessage(activeTenantId, jid, mergedText || "[Áudio recebido]", batch.senderName, "audio", audioResult.base64, undefined, audioResult.mime);
                  return;
                }

                if (docResults.length > 0) {
                  console.log(`[WhatsApp] Processing ${docResults.length} documents in batch`);
                  for (let i = 0; i < docResults.length; i++) {
                    const doc = docResults[i];
                    const isLast = i === docResults.length - 1;
                    const textForDoc = isLast ? (mergedText || `[Documento: ${doc.fileName}]`) : `[Documento: ${doc.fileName}]`;
                    await secretaryService.processIncomingMessage(activeTenantId, jid, textForDoc, batch.senderName, "document", doc.base64, doc.fileName, doc.mimetype);
                  }
                  return;
                }

                if (imageResult) {
                  await secretaryService.processIncomingMessage(activeTenantId, jid, mergedText || imageResult.caption || "[Imagem recebida]", batch.senderName, "image", imageResult.base64);
                  return;
                }
              }
            } catch (dlErr) {
              console.error("[WhatsApp] Error downloading media:", (dlErr as Error).message);
              if (mergedText) {
                await secretaryService.processIncomingMessage(activeTenantId, jid, mergedText + "\n[Nota: erro ao baixar mídia anexada]", batch.senderName);
                return;
              }
            }
          }

          if (mergedText) {
            await secretaryService.processIncomingMessage(
              activeTenantId, jid, mergedText, batch.senderName
            );
          }
        } catch (secErr) {
          console.error("[WhatsApp] Secretary processing error:", secErr);
        }
      };

      sock.ev.on("messages.upsert", async (m) => {
        console.log(`[WhatsApp] messages.upsert event: ${m.messages.length} message(s), type=${m.type}`);
        for (const msg of m.messages) {
          if (!msg.message) continue;
          if (msg.key.fromMe) continue;

          const jid = msg.key.remoteJid;
          if (!jid || jid === "status@broadcast") continue;

          if (jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) continue;

          const msgId = msg.key.id;
          if (msgId && processedMessageIds.has(msgId)) continue;
          if (msgId) {
            const existingMessage = await storage.getWhatsappMessageByMessageId(activeTenantId, msgId);
            if (existingMessage) {
              console.log(`[WhatsApp] Skipping duplicate upsert for messageId=${msgId}, type=${m.type}`);
              continue;
            }
          }
          if (msgId) {
            processedMessageIds.add(msgId);
            if (processedMessageIds.size > 500) {
              const arr = Array.from(processedMessageIds);
              arr.splice(0, 200).forEach(id => processedMessageIds.delete(id));
            }
          }

          const innerMsg = msg.message.ephemeralMessage?.message
            || msg.message.viewOnceMessage?.message
            || msg.message.viewOnceMessageV2?.message
            || msg.message.documentWithCaptionMessage?.message
            || msg.message;

          const checkForwarded = (m: any) => {
            if (!m) return false;
            for (const key of ['extendedTextMessage','audioMessage','imageMessage','videoMessage','documentMessage','ptvMessage']) {
              if (m[key]?.contextInfo?.isForwarded) return true;
            }
            return false;
          };
          const isForwarded = checkForwarded(msg.message) || checkForwarded(innerMsg);

          const msgTimestamp = (msg.messageTimestamp as number) * 1000;
          const now = Date.now();
          const ageMs = now - msgTimestamp;
          const timeSinceConnect = now - lastConnectedAt;
          const isWarmup = timeSinceConnect < 30000;
          let maxAge: number;
          if (isWarmup) {
            const MAX_RECOVERY_MS = 24 * 60 * 60 * 1000;
            const dynamicAge = lastReceivedMessageAt != null ? (now - lastReceivedMessageAt) : 600000;
            maxAge = Math.min(Math.max(dynamicAge, 600000), MAX_RECOVERY_MS);
          } else {
            maxAge = isForwarded ? 600000 : 300000;
          }
          if (ageMs > maxAge) {
            console.log(`[WhatsApp] ⚠️ Dropping old message id=${msgId} age=${Math.round(ageMs/1000)}s forwarded=${isForwarded} warmup=${isWarmup} maxAge=${maxAge/1000}s from=${jid}`);
            continue;
          }

          if (innerMsg.reactionMessage || innerMsg.protocolMessage || innerMsg.senderKeyDistributionMessage || innerMsg.messageContextInfo) {
            if (!innerMsg.conversation && !innerMsg.extendedTextMessage && !innerMsg.imageMessage && !innerMsg.videoMessage && !innerMsg.audioMessage && !innerMsg.documentMessage && !innerMsg.stickerMessage && !innerMsg.contactMessage && !innerMsg.locationMessage && !innerMsg.ptvMessage) {
              continue;
            }
          }

          const ptvAudio = (innerMsg as any).ptvMessage;

          const content =
            innerMsg.conversation ||
            innerMsg.extendedTextMessage?.text ||
            innerMsg.imageMessage?.caption ||
            innerMsg.videoMessage?.caption ||
            innerMsg.documentMessage?.fileName ||
            (innerMsg.audioMessage ? "[Áudio]" : null) ||
            (ptvAudio ? "[Áudio]" : null) ||
            (innerMsg.stickerMessage ? "[Sticker]" : null) ||
            (innerMsg.contactMessage ? "[Contato]" : null) ||
            (innerMsg.locationMessage ? "[Localização]" : null) ||
            (innerMsg.pollCreationMessage ? "[Enquete]" : null) ||
            (innerMsg.liveLocationMessage ? "[Localização ao vivo]" : null) ||
            (innerMsg.contactsArrayMessage ? "[Contatos]" : null) ||
            (innerMsg.listMessage ? innerMsg.listMessage?.title || "[Lista]" : null) ||
            (innerMsg.buttonsMessage ? innerMsg.buttonsMessage?.contentText || "[Botões]" : null) ||
            (innerMsg.templateMessage ? "[Template]" : null) ||
            null;

          if (!content) {
            const msgKeys = Object.keys(innerMsg).filter(k => k !== "messageContextInfo" && k !== "senderKeyDistributionMessage");
            console.log(`[WhatsApp] ⚠️ Unrecognized message type from ${jid}: keys=[${msgKeys.join(",")}]`);
            continue;
          }

          console.log(`[WhatsApp] Incoming message id=${msgId} from=${jid} content="${content?.substring(0,40)}" forwarded=${isForwarded} age=${Math.round(ageMs/1000)}s`);

          const mediaType = innerMsg.imageMessage ? "image" :
                           innerMsg.videoMessage ? "video" :
                           innerMsg.audioMessage ? "audio" :
                           ptvAudio ? "audio" :
                           innerMsg.documentMessage ? "document" :
                           innerMsg.stickerMessage ? "sticker" : null;

          const isGroup = jid.endsWith("@g.us");
          const participantJid = isGroup ? (msg.key.participant || "") : "";
          let senderNumber: string;
          if (isGroup) {
            senderNumber = participantJid.split("@")[0].split(":")[0] || "unknown";
          } else {
            senderNumber = await resolveJidToPhone(jid);
          }

          if (!isGroup && jid.endsWith("@lid")) {
            const participant = msg.key.participant || "";
            if (participant && participant.includes("@s.whatsapp.net")) {
              const phoneFromParticipant = participant.replace("@s.whatsapp.net", "").split(":")[0];
              if (phoneFromParticipant && /^\d{10,15}$/.test(phoneFromParticipant)) {
                senderNumber = phoneFromParticipant;
                await saveLidMapping(jid, phoneFromParticipant);
              }
            }
          }

          const senderName = msg.pushName || senderNumber;

          const normalizedJid = isGroup ? jid : `${senderNumber}@s.whatsapp.net`;

          let messageProtoJson: string | null = null;
          try {
            if (msg.message) {
              messageProtoJson = JSON.stringify(proto.Message.toObject(proto.Message.fromObject(msg.message)));
            }
          } catch (e) {
            console.log(`[WhatsApp] Failed to serialize message proto: ${e}`);
          }

          try {
            await storage.createWhatsappMessage({
              tenantId: activeTenantId,
              jid: normalizedJid,
              direction: "incoming",
              content,
              messageId: msgId || null,
              senderName,
              senderNumber,
              mediaType,
              messageProto: messageProtoJson,
              isRead: false,
              timestamp: new Date(msgTimestamp),
            });
            console.log(`[WhatsApp] Incoming message from ${senderName}: ${content?.substring(0, 50)}${mediaType ? ` [mediaType=${mediaType}]` : ""}`);

            const skipTypes = ["[Sticker]", "[Contato]", "[Localização]"];
            const hasProcessableMedia = mediaType && ["image", "audio", "document"].includes(mediaType);
            const hasText = content && !skipTypes.includes(content) && content !== "[Mídia]";

            if (isGroup) {
              const isArchivableMedia = hasProcessableMedia && (mediaType === "document" || mediaType === "image") && sock;
              if (isArchivableMedia) {
                let groupAllowed = false;
                const cached = groupAuthCache.get(jid);
                if (cached && Date.now() < cached.expires) {
                  groupAllowed = cached.allowed;
                } else {
                  try {
                    const metadata = await sock.groupMetadata(jid);
                    const groupSubject = (metadata?.subject || "").toLowerCase();
                    groupAllowed = groupSubject.includes("jurídico") || groupSubject.includes("juridico") || groupSubject.includes("mobilar");
                    groupAuthCache.set(jid, { allowed: groupAllowed, expires: Date.now() + 3600000 });
                    if (groupAllowed) console.log(`[WhatsApp-Group] Group "${metadata?.subject}" authorized for auto-archive`);
                  } catch (metaErr) {
                    console.warn(`[WhatsApp-Group] Could not fetch group metadata for ${jid}: ${(metaErr as Error).message}`);
                    if (cached) groupAllowed = cached.allowed;
                  }
                }

                if (!groupAllowed) {
                  console.log(`[WhatsApp-Group] Group ${jid} not authorized for auto-archive, skipping`);
                } else {
                  const groupDocExisting = groupDocDebounce.get(jid);
                  if (groupDocExisting) clearTimeout(groupDocExisting);

                  let gbuf = groupDocBuffer.get(jid);
                  if (!gbuf) {
                    gbuf = { docs: [], texts: [], senderName };
                    groupDocBuffer.set(jid, gbuf);
                  }
                  gbuf.senderName = senderName;
                  gbuf.docs.push({ msg, mediaType: mediaType!, senderName });
                  if (hasText) gbuf.texts.push(content);

                  groupDocDebounce.set(jid, setTimeout(async () => {
                    groupDocDebounce.delete(jid);
                    const batch = groupDocBuffer.get(jid);
                    groupDocBuffer.delete(jid);
                    if (!batch || batch.docs.length === 0) return;

                    try {
                      const { downloadMediaMessage, downloadContentFromMessage } = await import("@whiskeysockets/baileys");
                      const { secretaryService } = await import("./secretary");

                      for (const entry of batch.docs) {
                        const { msg: docMsg, mediaType: mType, senderName: docSender } = entry;
                        const mInner = docMsg.message?.ephemeralMessage?.message
                          || docMsg.message?.viewOnceMessage?.message
                          || docMsg.message?.viewOnceMessageV2?.message
                          || docMsg.message?.documentWithCaptionMessage?.message
                          || docMsg.message;

                        const isImage = mType === "image";
                        let buffer: Buffer | null = null;
                        try {
                          const dlOptions: any = {};
                          if (sock?.updateMediaMessage) dlOptions.reuploadRequest = sock.updateMediaMessage;
                          buffer = await downloadMediaMessage(docMsg, "buffer", {}, dlOptions) as Buffer;
                        } catch (dlErr) {
                          console.warn(`[WhatsApp-Group] downloadMediaMessage failed: ${(dlErr as Error).message}`);
                        }
                        if (!buffer || buffer.length === 0) {
                          try {
                            const mediaMsg = isImage ? mInner?.imageMessage : mInner?.documentMessage;
                            if (mediaMsg) {
                              const stream = await downloadContentFromMessage(mediaMsg, (isImage ? "image" : "document") as any);
                              const chunks: Buffer[] = [];
                              for await (const chunk of stream) chunks.push(chunk as Buffer);
                              buffer = Buffer.concat(chunks);
                            }
                          } catch (dlErr2) {
                            console.error(`[WhatsApp-Group] Stream fallback failed: ${(dlErr2 as Error).message}`);
                          }
                        }

                        if (buffer && buffer.length > 0) {
                          const fileName = isImage
                            ? (mInner?.imageMessage?.caption || `imagem_${Date.now()}.jpg`)
                            : (mInner?.documentMessage?.fileName || "documento");
                          const mimetype = isImage
                            ? (mInner?.imageMessage?.mimetype || "image/jpeg")
                            : (mInner?.documentMessage?.mimetype || "");
                          const base64 = buffer.toString("base64");
                          console.log(`[WhatsApp-Group] Auto-archiving ${isImage ? "image" : "document"}: ${fileName} (${buffer.length} bytes) from group ${jid}`);
                          await secretaryService.processGroupDocument(
                            activeTenantId, jid, base64, fileName, mimetype, docSender
                          );
                        } else {
                          console.warn(`[WhatsApp-Group] Failed to download ${isImage ? "image" : "document"} from group ${jid}`);
                        }
                      }
                    } catch (err) {
                      console.error("[WhatsApp-Group] Error processing group documents:", err);
                    }
                  }, GROUP_DOC_DEBOUNCE_MS));
                }
              } else if (hasText) {
                console.log(`[WhatsApp-Group] Silent mode: storing text from ${senderName} in group ${jid} (no AI response)`);
              }
              continue;
            }

            if (hasText || hasProcessableMedia) {
              const existing = secretaryDebounce.get(jid);
              const existingBuffer = secretaryBuffer.get(jid);
              const shouldFlushExisting =
                Boolean(
                  existing &&
                  existingBuffer &&
                  (existingBuffer.texts.length > 0 || existingBuffer.mediaItems.length > 0) &&
                  !hasProcessableMedia &&
                  hasText &&
                  isStandaloneShortMessage(content)
                );

              if (existing) clearTimeout(existing);

              if (shouldFlushExisting && existingBuffer) {
                secretaryDebounce.delete(jid);
                secretaryBuffer.delete(jid);
                await flushSecretaryBatch(jid, existingBuffer);
              }

              let buf = secretaryBuffer.get(jid);
              if (!buf) {
                buf = { texts: [], mediaItems: [], senderName };
                secretaryBuffer.set(jid, buf);
              }
              buf.senderName = senderName;

              if (hasProcessableMedia) {
                buf.mediaItems.push({ msg, type: mediaType! });
                if (hasText) buf.texts.push(content);
              } else if (hasText) {
                buf.texts.push(content);
              }

              secretaryDebounce.set(jid, setTimeout(async () => {
                secretaryDebounce.delete(jid);
                const batch = secretaryBuffer.get(jid);
                secretaryBuffer.delete(jid);
                if (!batch) return;
                await flushSecretaryBatch(jid, batch);
              }, DEBOUNCE_MS));
            }
          } catch (err) {
            console.error("[WhatsApp] Error saving incoming message:", err);
          }
        }
      });

      sock.ev.on("messages.update", async (updates) => {
        for (const update of updates) {
          if (!update.update?.message || !update.key?.id || !activeTenantId) continue;
          try {
            const protoJson = JSON.stringify(proto.Message.toObject(proto.Message.fromObject(update.update.message)));
            await storage.updateWhatsappMessageProto(activeTenantId, update.key.id, protoJson);
          } catch (e) {
            console.log(`[WhatsApp] messages.update proto save error: ${e}`);
          }
        }
      });
    } catch (error) {
      connectionStatus = "disconnected";
      statusMessage = `Erro na conexão: ${(error as Error).message}`;
      console.error("[WhatsApp] Connection error:", error);
    }
  },

  async disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.error("[WhatsApp] Error during logout:", e);
        try {
          sock.end(undefined);
        } catch (e2) {
          console.error("[WhatsApp] Error ending socket:", e2);
        }
      }
      sock = null;
    }
    connectionStatus = "disconnected";
    isAwaitingQrScan = false;
    qrCodeDataUrl = null;
    statusMessage = "Desconectado";
  },

  async sendMessage(phoneNumber: string, message: string, tenantId: number = 1, isManual: boolean = false): Promise<boolean> {
    if (!sock || connectionStatus !== "connected") {
      console.error("[WhatsApp] Not connected, cannot send message");
      return false;
    }

    try {
      const formattedNumber = normalizeBrazilianPhone(phoneNumber);

      const lidJid = await resolvePhoneToLidJid(formattedNumber);
      const targetJid = lidJid || `${formattedNumber}@s.whatsapp.net`;

      console.log(`[WhatsApp] Sending to ${formattedNumber} via ${targetJid}`);
      const result = await sock.sendMessage(targetJid, { text: message });

      await storage.createWhatsappMessage({
        tenantId,
        jid: `${formattedNumber}@s.whatsapp.net`,
        direction: "outgoing",
        content: message,
        messageId: result?.key?.id || null,
        senderName: "LexAI",
        senderNumber: formattedNumber,
        mediaType: null,
        isRead: true,
        timestamp: new Date(),
      });

      if (isManual) {
        await activateManualSilence(`${formattedNumber}@s.whatsapp.net`);
      }

      console.log(`[WhatsApp] Message sent to ${formattedNumber}`);
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Error sending to ${phoneNumber}:`, error);
      return false;
    }
  },

  async sendToJid(jid: string, message: string, tenantId: number = 1, isManual: boolean = false): Promise<boolean> {
    if (!sock || connectionStatus !== "connected") {
      console.error("[WhatsApp] Not connected, cannot send message");
      return false;
    }

    try {
      const phoneNumber = await resolveJidToPhone(jid);
      const result = await sock.sendMessage(jid, { text: message });

      await storage.createWhatsappMessage({
        tenantId,
        jid: `${phoneNumber}@s.whatsapp.net`,
        direction: "outgoing",
        content: message,
        messageId: result?.key?.id || null,
        senderName: "LexAI",
        senderNumber: phoneNumber,
        mediaType: null,
        isRead: true,
        timestamp: new Date(),
      });

      if (isManual) {
        await activateManualSilence(jid);
      }

      console.log(`[WhatsApp] Message sent to ${jid}`);
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Error sending to ${jid}:`, error);
      return false;
    }
  },

  async sendDocument(phoneNumber: string, document: Buffer, fileName: string, caption: string, tenantId: number = 1, isManual: boolean = false): Promise<boolean> {
    if (!sock || connectionStatus !== "connected") {
      console.error("[WhatsApp] Not connected, cannot send document");
      return false;
    }

    try {
      const formattedNumber = normalizeBrazilianPhone(phoneNumber);
      const lidJid = await resolvePhoneToLidJid(formattedNumber);
      const targetJid = lidJid || `${formattedNumber}@s.whatsapp.net`;

      console.log(`[WhatsApp] Sending document "${fileName}" to ${formattedNumber} via ${targetJid}`);
      const result = await sock.sendMessage(targetJid, {
        document,
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName,
        caption,
      });

      await storage.createWhatsappMessage({
        tenantId,
        jid: `${formattedNumber}@s.whatsapp.net`,
        direction: "outgoing",
        content: `📄 ${fileName}\n${caption}`,
        messageId: result?.key?.id || null,
        senderName: "LexAI",
        senderNumber: formattedNumber,
        mediaType: "document",
        isRead: true,
        timestamp: new Date(),
      });

      if (isManual) {
        await activateManualSilence(`${formattedNumber}@s.whatsapp.net`);
      }

      console.log(`[WhatsApp] Document "${fileName}" sent to ${formattedNumber}`);
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Error sending document to ${phoneNumber}:`, error);
      return false;
    }
  },

  async sendDocumentToJid(jid: string, document: Buffer, fileName: string, mimetype: string, caption: string, tenantId: number = 1, isManual: boolean = false): Promise<boolean> {
    if (!sock || connectionStatus !== "connected") {
      console.error("[WhatsApp] Not connected, cannot send document");
      return false;
    }

    try {
      const phoneNumber = await resolveJidToPhone(jid);
      console.log(`[WhatsApp] Sending document "${fileName}" to JID ${jid}`);
      const result = await sock.sendMessage(jid, {
        document,
        mimetype,
        fileName,
        caption,
      });

      await storage.createWhatsappMessage({
        tenantId,
        jid: `${phoneNumber}@s.whatsapp.net`,
        direction: "outgoing",
        content: `📄 ${fileName}\n${caption}`,
        messageId: result?.key?.id || null,
        senderName: "LexAI",
        senderNumber: phoneNumber,
        mediaType: "document",
        isRead: true,
        timestamp: new Date(),
      });

      if (isManual) {
        await activateManualSilence(jid);
      }

      console.log(`[WhatsApp] Document "${fileName}" sent to JID ${jid}`);
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Error sending document to JID ${jid}:`, error);
      return false;
    }
  },

  async sendImageToJid(jid: string, image: Buffer, mimetype: string, caption: string, tenantId: number = 1, isManual: boolean = false): Promise<boolean> {
    if (!sock || connectionStatus !== "connected") {
      console.error("[WhatsApp] Not connected, cannot send image");
      return false;
    }

    try {
      const phoneNumber = await resolveJidToPhone(jid);
      console.log(`[WhatsApp] Sending image to JID ${jid}`);
      const result = await sock.sendMessage(jid, {
        image,
        mimetype,
        caption,
      });

      await storage.createWhatsappMessage({
        tenantId,
        jid: `${phoneNumber}@s.whatsapp.net`,
        direction: "outgoing",
        content: `📷 Imagem${caption ? `\n${caption}` : ""}`,
        messageId: result?.key?.id || null,
        senderName: "LexAI",
        senderNumber: phoneNumber,
        mediaType: "image",
        isRead: true,
        timestamp: new Date(),
      });

      if (isManual) {
        await activateManualSilence(jid);
      }

      console.log(`[WhatsApp] Image sent to JID ${jid}`);
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Error sending image to JID ${jid}:`, error);
      return false;
    }
  },

  async generateDailySummary(tenantId: number): Promise<string> {
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");
    const events = await storage.getAgendaEventsByDate(tenantId, todayStr);

    let summary = `📋 *Agenda Jurídica - ${format(today, "dd/MM/yyyy (EEEE)", { locale: ptBR })}*\n\n`;

    if (events.length === 0) {
      summary += `✅ Sem compromissos agendados para hoje.\n`;
    } else {
      const sortedEvents = [...events].sort((a, b) => a.timeStart.localeCompare(b.timeStart));
      summary += `📌 *${events.length} compromisso(s) hoje:*\n\n`;

    for (const event of sortedEvents) {
      const icon = event.type === "Audiência" ? "⚖️" :
                   event.type === "Prazo" ? "⏰" :
                   event.type === "Reunião" ? "👥" : "📅";
      summary += `${icon} *${event.timeStart}${event.timeEnd ? ` - ${event.timeEnd}` : ""}*\n`;
      summary += `${event.title}\n`;
      if (event.description) summary += `_${event.description}_\n`;
      summary += `Responsável: ${event.responsible}\n\n`;
    }
    }

    const intimacaoDeadlines = await db.select({
      movementId: caseMovements.id,
      aiDeadlineDate: caseMovements.aiDeadlineDate,
      aiDeadlineStatus: caseMovements.aiDeadlineStatus,
      aiDeadlineSummary: caseMovements.aiDeadlineSummary,
      caseNumber: cases.caseNumber,
    }).from(caseMovements)
      .innerJoin(cases, eq(caseMovements.caseId, cases.id))
      .where(and(
        eq(cases.tenantId, tenantId),
        eq(cases.isStrategic, true),
        isNotNull(caseMovements.aiDeadlineDate),
        isNull(caseMovements.acknowledgedAt),
        inArray(caseMovements.aiDeadlineStatus, ["vencido", "critico", "urgente"])
      ));

    if (intimacaoDeadlines.length > 0) {
      summary += `\n⚠️ *Prazos de Intimações:*\n\n`;
      for (const item of intimacaoDeadlines) {
        summary += `🔴 ${item.caseNumber} - ${item.aiDeadlineSummary || "Prazo de intimação"} - Vence: ${item.aiDeadlineDate} (${item.aiDeadlineStatus})\n`;
      }
      summary += `\n`;
    }

    try {
      const schedule = await storage.getWhatsappSchedule(tenantId);
      const sinceDate = schedule?.lastSentAt
        ? new Date(schedule.lastSentAt)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentEmails = await db.select({
        subject: emails.subject,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
      }).from(emails)
        .innerJoin(emailFolders, eq(emails.folderId, emailFolders.id))
        .where(and(
          eq(emails.tenantId, tenantId),
          eq(emailFolders.type, "inbox"),
          gte(emails.date, sinceDate)
        ))
        .orderBy(desc(emails.date))
        .limit(10);

      if (recentEmails.length > 0) {
        summary += `\n📧 *Emails Recebidos (${recentEmails.length}${recentEmails.length === 10 ? "+" : ""}):*\n`;
        for (const email of recentEmails) {
          const sender = email.fromName || email.fromAddress || "Desconhecido";
          const subject = email.subject || "(Sem assunto)";
          summary += `• ${sender} — ${subject}\n`;
        }
        summary += `\n`;
      }
    } catch (emailError) {
      console.error("[WhatsApp] Error fetching recent emails for daily summary:", emailError);
    }

    summary += `🏛️ _Enviado automaticamente pelo LexAI_`;

    return summary;
  },

  async sendDailySummaryToAll(tenantId: number): Promise<{ sent: number; failed: number; summary: string }> {
    // Skip on weekends (0=Sunday, 6=Saturday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`[Daily Cron] Weekend (${dayOfWeek === 0 ? "domingo" : "sábado"}), skipping daily summary`);
      return { sent: 0, failed: 0, summary: "" };
    }

    // Check if there's anything to report before sending
    const todayStr = format(today, "yyyy-MM-dd");
    const events = await storage.getAgendaEventsByDate(tenantId, todayStr);
    const urgentDeadlines = await db.select({ id: caseMovements.id })
      .from(caseMovements)
      .innerJoin(cases, eq(caseMovements.caseId, cases.id))
      .where(and(
        eq(cases.tenantId, tenantId),
        eq(cases.isStrategic, true),
        isNotNull(caseMovements.aiDeadlineDate),
        isNull(caseMovements.acknowledgedAt),
        inArray(caseMovements.aiDeadlineStatus, ["vencido", "critico", "urgente"])
      ))
      .limit(1);
    const preCheckSchedule = await storage.getWhatsappSchedule(tenantId);
    const sinceDate = preCheckSchedule?.lastSentAt
      ? new Date(preCheckSchedule.lastSentAt)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEmailCount = await db.select({ id: emails.id })
      .from(emails)
      .innerJoin(emailFolders, eq(emails.folderId, emailFolders.id))
      .where(and(
        eq(emails.tenantId, tenantId),
        eq(emailFolders.type, "inbox"),
        gte(emails.date, sinceDate)
      ))
      .limit(1);

    if (events.length === 0 && urgentDeadlines.length === 0 && recentEmailCount.length === 0) {
      console.log("[Daily Cron] Nothing to report today, skipping daily summary");
      return { sent: 0, failed: 0, summary: "" };
    }

    const contacts = await storage.getWhatsappContacts(tenantId);
    const activeContacts = contacts.filter(c => c.isActive);

    const allUsers = await storage.getUsersByTenant(tenantId);
    const socios = allUsers.filter(u => u.role === "socio" && u.isActive && u.phone);

    const normalizedSet = new Set(activeContacts.map(c => normalizeBrazilianPhone(c.phoneNumber)));
    for (const socio of socios) {
      const normalized = normalizeBrazilianPhone(socio.phone!);
      if (normalized && !normalizedSet.has(normalized)) {
        activeContacts.push({ phoneNumber: normalized, contactName: socio.name, isActive: true } as any);
        normalizedSet.add(normalized);
      }
    }

    if (activeContacts.length === 0) {
      return { sent: 0, failed: 0, summary: "" };
    }

    const summary = await this.generateDailySummary(tenantId);
    let sent = 0;
    let failed = 0;

    for (const contact of activeContacts) {
      const success = await this.sendMessage(contact.phoneNumber, summary, tenantId);
      if (success) sent++;
      else failed++;
      await new Promise(r => setTimeout(r, 2000));
    }

    const schedule = await storage.getWhatsappSchedule(tenantId);
    if (schedule) {
      await storage.upsertWhatsappSchedule(tenantId, {
        ...schedule,
        lastSentAt: new Date(),
      });
    }

    console.log(`[WhatsApp] Daily summary sent: ${sent} success, ${failed} failed`);
    return { sent, failed, summary };
  },
};
