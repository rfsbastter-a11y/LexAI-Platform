import cron from "node-cron";
import { whatsappService } from "./whatsapp";
import { storage } from "../storage";
import { zohoMailService } from "./zohoMail";

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let pendingSend: { tenantId: number; retries: number; timer: ReturnType<typeof setInterval> | null } | null = null;
let emailSyncInterval: ReturnType<typeof setInterval> | null = null;
let emailSyncTimeout: ReturnType<typeof setTimeout> | null = null;

export function startDailyCron(tenantId: number = 1) {
  if (cronJob) {
    cronJob.stop();
  }

  updateCronSchedule(tenantId);
  startEmailAutoSync(tenantId);
}

export function startEmailAutoSync(tenantId: number = 1) {
  if (emailSyncInterval) {
    clearInterval(emailSyncInterval);
  }

  if (!zohoMailService.isConfigured()) {
    console.log("[EmailSync] Zoho Mail not configured - auto-sync disabled");
    return;
  }

  const EMAIL_SYNC_INTERVAL_MS = 5 * 60 * 1000;

  const doSync = async () => {
    if (zohoMailService.isSyncing()) {
      console.log("[EmailSync] Sync already in progress, skipping");
      return;
    }
    try {
      let folders = await storage.getEmailFolders(tenantId);
      let inboxFolder = folders.find(f => f.type === "inbox");
      if (!inboxFolder) {
        console.log("[EmailSync] No inbox folder found, syncing folders from Zoho first...");
        await zohoMailService.syncFolders(tenantId);
        folders = await storage.getEmailFolders(tenantId);
        inboxFolder = folders.find(f => f.type === "inbox");
        if (!inboxFolder) {
          console.log("[EmailSync] Still no inbox folder after folder sync");
          return;
        }
      }
      const synced = await zohoMailService.syncEmails(tenantId, inboxFolder.id, inboxFolder.imapPath, 50);
      if (synced > 0) {
        console.log(`[EmailSync] Auto-synced ${synced} new emails`);
      }
    } catch (error) {
      console.error("[EmailSync] Auto-sync error:", error);
    }
  };

  if (emailSyncTimeout) clearTimeout(emailSyncTimeout);
  emailSyncTimeout = setTimeout(() => doSync(), 30000);

  emailSyncInterval = setInterval(doSync, EMAIL_SYNC_INTERVAL_MS);
  console.log("[EmailSync] Auto-sync scheduled every 5 minutes");
}

async function attemptSend(tenantId: number) {
  const status = whatsappService.getStatus();
  if (status.status !== "connected") {
    return false;
  }

  try {
    const schedule = await storage.getWhatsappSchedule(tenantId);
    const today = new Date().toISOString().split("T")[0];
    const lastSent = schedule?.lastSentAt ? new Date(schedule.lastSentAt).toISOString().split("T")[0] : null;

    if (lastSent === today) {
      console.log("[Daily Cron] Already sent today, skipping");
      return true;
    }

    const result = await whatsappService.sendDailySummaryToAll(tenantId);
    console.log(`[Daily Cron] Summary sent: ${result.sent} success, ${result.failed} failed`);
    return true;
  } catch (error) {
    console.error("[Daily Cron] Error sending daily summary:", error);
    return false;
  }
}

function startRetryLoop(tenantId: number) {
  if (pendingSend?.timer) {
    clearInterval(pendingSend.timer);
  }

  pendingSend = {
    tenantId,
    retries: 0,
    timer: setInterval(async () => {
      if (!pendingSend) return;

      pendingSend.retries++;
      console.log(`[Daily Cron] Retry attempt ${pendingSend.retries}/12 (WhatsApp was offline at scheduled time)`);

      const success = await attemptSend(tenantId);
      if (success || pendingSend.retries >= 12) {
        if (!success) {
          console.log("[Daily Cron] Max retries reached, giving up for today");
        }
        if (pendingSend?.timer) {
          clearInterval(pendingSend.timer);
        }
        pendingSend = null;
      }
    }, 5 * 60 * 1000),
  };
}

export async function updateCronSchedule(tenantId: number = 1) {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }

  try {
    const schedule = await storage.getWhatsappSchedule(tenantId);
    const sendTime = schedule?.sendTime || "07:00";
    const isActive = schedule?.isActive !== false;

    if (!isActive) {
      console.log("[Daily Cron] Schedule is disabled");
      return;
    }

    const [hours, minutes] = sendTime.split(":");
    const cronExpression = `${minutes} ${hours} * * *`;

    cronJob = cron.schedule(cronExpression, async () => {
      console.log(`[Daily Cron] Triggering daily WhatsApp summary at ${sendTime}`);

      const success = await attemptSend(tenantId);
      if (!success) {
        console.log("[Daily Cron] WhatsApp not connected, starting retry loop (every 5min for 1h)");
        startRetryLoop(tenantId);
      }
    }, {
      timezone: "America/Sao_Paulo",
    });

    console.log(`[Daily Cron] Scheduled daily WhatsApp at ${sendTime} (Brasília time)`);
  } catch (error) {
    console.error("[Daily Cron] Error setting up cron:", error);
  }
}

export function stopDailyCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("[Daily Cron] Stopped");
  }
  if (pendingSend?.timer) {
    clearInterval(pendingSend.timer);
    pendingSend = null;
  }
  if (emailSyncTimeout) {
    clearTimeout(emailSyncTimeout);
    emailSyncTimeout = null;
  }
  if (emailSyncInterval) {
    clearInterval(emailSyncInterval);
    emailSyncInterval = null;
    console.log("[EmailSync] Auto-sync stopped");
  }
}
