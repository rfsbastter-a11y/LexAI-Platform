import { storage } from "../storage";
import type { InsertEmail, InsertEmailFolder } from "@shared/schema";

const ZOHO_BASE_URL = "https://mail.zoho.com/api";
const ZOHO_AUTH_URL = "https://accounts.zoho.com/oauth/v2/token";

class ZohoMailService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private accountId: string | null = null;
  private configured = false;
  private syncLock = false;

  initialize(): void {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.log("[ZohoMail] OAuth credentials not configured - email sync disabled");
      return;
    }

    this.configured = true;
    console.log("[ZohoMail] Initialized with OAuth 2.0");
  }

  isConfigured(): boolean {
    return this.configured;
  }

  private async refreshAccessToken(): Promise<string> {
    const clientId = process.env.ZOHO_CLIENT_ID!;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET!;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN!;

    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    console.log("[ZohoMail] Refreshing access token...");

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(ZOHO_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Token refresh error: ${data.error}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    console.log("[ZohoMail] Access token refreshed successfully");
    return this.accessToken!;
  }

  private async getAccountId(): Promise<string> {
    if (this.accountId) {
      return this.accountId;
    }

    const token = await this.refreshAccessToken();
    const response = await fetch(`${ZOHO_BASE_URL}/accounts`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get accounts: ${response.status} ${text}`);
    }

    const result = await response.json();
    const accounts = result.data;
    if (!accounts || accounts.length === 0) {
      throw new Error("No Zoho Mail accounts found");
    }

    this.accountId = accounts[0].accountId;
    console.log(`[ZohoMail] Account ID: ${this.accountId}`);
    return this.accountId!;
  }

  private async apiRequest(path: string, preserveLargeIds = false): Promise<any> {
    const token = await this.refreshAccessToken();
    const accountId = await this.getAccountId();
    const url = `${ZOHO_BASE_URL}/accounts/${accountId}${path}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zoho API error ${response.status}: ${text}`);
    }

    if (preserveLargeIds) {
      const text = await response.text();
      const fixed = text.replace(/"(messageId|msgId|folderId)"\s*:\s*(\d{15,})/g, '"$1":"$2"');
      return JSON.parse(fixed);
    }

    return response.json();
  }

  private extractBodyFromResponse(contentResult: any): string {
    if (!contentResult) return "";
    const d = contentResult.data;
    if (!d) return "";

    if (typeof d === "string") return d;
    if (d.content && typeof d.content === "string") return d.content;
    if (d.bodyContent && typeof d.bodyContent === "string") return d.bodyContent;
    if (d.htmlContent && typeof d.htmlContent === "string") return d.htmlContent;
    if (d.textContent && typeof d.textContent === "string") return `<pre>${d.textContent}</pre>`;

    if (d.blockContent && Array.isArray(d.blockContent)) {
      return d.blockContent
        .map((block: any) => block.content || block.htmlContent || "")
        .filter(Boolean)
        .join("\n");
    }

    if (d.content && typeof d.content === "object" && d.content.htmlContent) {
      return d.content.htmlContent;
    }

    return "";
  }

  private normalizeCharset(charset: string): string {
    const normalized = (charset || "").toLowerCase().trim();
    if (!normalized) return "utf-8";
    if (normalized === "utf8") return "utf-8";
    if (normalized === "latin1") return "iso-8859-1";
    if (normalized === "cp1252") return "windows-1252";
    return normalized;
  }

  private decodeBytesWithCharset(bytes: Uint8Array, charset: string): string {
    const normalizedCharset = this.normalizeCharset(charset);
    try {
      return new TextDecoder(normalizedCharset as any, { fatal: false }).decode(bytes);
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  }

  private decodeQEncodedHeader(value: string): Uint8Array {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === "_") {
        bytes.push(0x20);
        continue;
      }
      if (ch === "=" && i + 2 < value.length) {
        const hex = value.slice(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
    return Uint8Array.from(bytes);
  }

  private countGarbledChars(text: string): number {
    const matches = text.match(/[\u00c3\u00c2]|[\u00e2][\u0080-\u00bf]/g);
    return matches ? matches.length : 0;
  }

  private fixMojibake(value: string): string {
    if (!value || !/[\u00c3\u00c2]|[\u00e2][\u0080-\u00bf]/.test(value)) return value;
    try {
      const repaired = Buffer.from(value, "latin1").toString("utf8");
      return this.countGarbledChars(repaired) < this.countGarbledChars(value) ? repaired : value;
    } catch {
      return value;
    }
  }

  private decodeMimeHeader(value: string): string {
    if (!value) return "";
    const decoded = value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_full, charset, encoding, encodedText) => {
      try {
        if (String(encoding).toUpperCase() === "B") {
          const bytes = Buffer.from(String(encodedText), "base64");
          return this.decodeBytesWithCharset(bytes, String(charset));
        }
        const bytes = this.decodeQEncodedHeader(String(encodedText));
        return this.decodeBytesWithCharset(bytes, String(charset));
      } catch {
        return String(encodedText);
      }
    });

    return this.fixMojibake(decoded).trim();
  }

  private parseAttachmentSize(rawSize: unknown): number | undefined {
    if (rawSize === undefined || rawSize === null) return undefined;
    const num = Number(rawSize);
    if (!Number.isFinite(num) || num <= 0) return undefined;
    return Math.round(num);
  }

  private extractZohoAttachments(messageData: any): Array<{
    filename: string;
    contentType?: string;
    size?: number;
    storagePath?: string;
    contentId?: string;
  }> {
    const attachmentsRaw = Array.isArray(messageData?.attachments) ? messageData.attachments : [];

    return attachmentsRaw
      .map((att: any, index: number) => {
        const rawFilename =
          att?.attachmentName ||
          att?.fileName ||
          att?.filename ||
          att?.name ||
          att?.contentName ||
          `anexo-${index + 1}`;

        const filename = this.decodeMimeHeader(String(rawFilename || "")).trim() || `anexo-${index + 1}`;
        const contentType = att?.contentType || att?.mimeType || att?.type || undefined;
        const size = this.parseAttachmentSize(att?.size ?? att?.attachmentSize ?? att?.fileSize);
        const storagePathRaw = att?.attachmentId || att?.partId || att?.storeName || att?.attachmentPath;
        const contentIdRaw = att?.contentId || att?.cid;

        return {
          filename,
          contentType: contentType ? String(contentType) : undefined,
          size,
          storagePath: storagePathRaw ? String(storagePathRaw) : undefined,
          contentId: contentIdRaw ? String(contentIdRaw) : undefined,
        };
      })
      .filter((att: { filename: string }) => !!att.filename);
  }

  private async fetchMessageDetails(zohoMsgId: string, zohoFolderId?: string): Promise<any | null> {
    const endpoints = [];
    if (zohoFolderId) {
      endpoints.push(`/folders/${zohoFolderId}/messages/${zohoMsgId}`);
    }
    endpoints.push(`/messages/${zohoMsgId}`);

    for (const endpoint of endpoints) {
      try {
        const result = await this.apiRequest(endpoint, true);
        if (result?.data) {
          return result.data;
        }
      } catch (error: any) {
        console.warn(`[ZohoMail] Failed to fetch message details via ${endpoint}: ${error.message}`);
      }
    }

    return null;
  }

  private async apiRequestBinary(path: string): Promise<Response> {
    const token = await this.refreshAccessToken();
    const accountId = await this.getAccountId();
    const url = `${ZOHO_BASE_URL}/accounts/${accountId}${path}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        Accept: "application/octet-stream",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zoho API binary error ${response.status}: ${text}`);
    }

    return response;
  }

  private parseContentDispositionFilename(contentDisposition: string | null): string | undefined {
    if (!contentDisposition) return undefined;

    const filenameStarMatch = contentDisposition.match(/filename\*=([^;]+)/i);
    if (filenameStarMatch?.[1]) {
      const rawValue = filenameStarMatch[1].trim();
      const cleaned = rawValue.replace(/^UTF-8''/i, "").replace(/^["']|["']$/g, "");
      try {
        return decodeURIComponent(cleaned);
      } catch {
        return cleaned;
      }
    }

    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (filenameMatch?.[1]) {
      return filenameMatch[1];
    }

    return undefined;
  }

  private async fetchAttachmentInfos(zohoFolderId: string, zohoMsgId: string): Promise<Array<{
    attachmentId: string;
    attachmentName: string;
    attachmentSize?: number;
    contentId?: string;
  }>> {
    const result = await this.apiRequest(
      `/folders/${zohoFolderId}/messages/${zohoMsgId}/attachmentinfo?includeInline=true`,
      true
    );
    const data = result?.data || {};

    const normalizeItem = (item: any): {
      attachmentId: string;
      attachmentName: string;
      attachmentSize?: number;
      contentId?: string;
    } | null => {
      const attachmentId = item?.attachmentId ? String(item.attachmentId) : "";
      if (!attachmentId) return null;
      return {
        attachmentId,
        attachmentName: this.decodeMimeHeader(String(item?.attachmentName || "")).trim(),
        attachmentSize: this.parseAttachmentSize(item?.attachmentSize),
        contentId: item?.cid ? String(item.cid) : undefined,
      };
    };

    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const inline = Array.isArray(data.inline) ? data.inline : [];

    return [...attachments, ...inline]
      .map(normalizeItem)
      .filter((entry): entry is NonNullable<ReturnType<typeof normalizeItem>> => !!entry);
  }

  private findBestAttachmentInfo(
    infos: Array<{ attachmentId: string; attachmentName: string; attachmentSize?: number; contentId?: string }>,
    target: { filename?: string | null; size?: number | null; contentId?: string | null; attachmentId?: string | null }
  ): { attachmentId: string; attachmentName: string; attachmentSize?: number; contentId?: string } | null {
    const normalizedFilename = this.decodeMimeHeader(String(target.filename || "")).trim().toLowerCase();
    const normalizedContentId = target.contentId ? String(target.contentId).trim() : "";
    const targetSize = this.parseAttachmentSize(target.size);
    const targetAttachmentId = target.attachmentId ? String(target.attachmentId).trim() : "";

    if (targetAttachmentId) {
      const byId = infos.find(info => info.attachmentId === targetAttachmentId);
      if (byId) return byId;
    }

    if (normalizedContentId) {
      const byContentId = infos.find(info => info.contentId && info.contentId === normalizedContentId);
      if (byContentId) return byContentId;
    }

    if (normalizedFilename && targetSize) {
      const byNameAndSize = infos.find(
        info => info.attachmentName.toLowerCase() === normalizedFilename && info.attachmentSize === targetSize
      );
      if (byNameAndSize) return byNameAndSize;
    }

    if (normalizedFilename) {
      const byName = infos.find(info => info.attachmentName.toLowerCase() === normalizedFilename);
      if (byName) return byName;
    }

    if (targetSize) {
      const bySize = infos.find(info => info.attachmentSize === targetSize);
      if (bySize) return bySize;
    }

    return infos[0] || null;
  }

  async downloadAttachment(options: {
    zohoFolderId: string;
    zohoMessageId: string;
    attachmentId?: string | null;
    filename?: string | null;
    size?: number | null;
    contentId?: string | null;
  }): Promise<{ filename: string; contentType: string; content: Buffer }> {
    if (!this.configured) {
      throw new Error("Zoho Mail not configured");
    }

    if (!options.zohoFolderId || !options.zohoMessageId) {
      throw new Error("Missing Zoho folder/message identifiers");
    }

    let resolvedAttachmentId = options.attachmentId ? String(options.attachmentId).trim() : "";
    let attachmentInfos: Array<{ attachmentId: string; attachmentName: string; attachmentSize?: number; contentId?: string }> = [];

    if (!resolvedAttachmentId) {
      attachmentInfos = await this.fetchAttachmentInfos(options.zohoFolderId, options.zohoMessageId);
      const best = this.findBestAttachmentInfo(attachmentInfos, options);
      resolvedAttachmentId = best?.attachmentId || "";
    }

    if (!resolvedAttachmentId) {
      throw new Error("Attachment ID not found");
    }

    let response: Response;
    try {
      response = await this.apiRequestBinary(
        `/folders/${options.zohoFolderId}/messages/${options.zohoMessageId}/attachments/${resolvedAttachmentId}`
      );
    } catch (firstError) {
      attachmentInfos = attachmentInfos.length > 0
        ? attachmentInfos
        : await this.fetchAttachmentInfos(options.zohoFolderId, options.zohoMessageId);
      const best = this.findBestAttachmentInfo(attachmentInfos, options);
      if (!best || best.attachmentId === resolvedAttachmentId) {
        throw firstError;
      }
      resolvedAttachmentId = best.attachmentId;
      response = await this.apiRequestBinary(
        `/folders/${options.zohoFolderId}/messages/${options.zohoMessageId}/attachments/${resolvedAttachmentId}`
      );
    }

    const content = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const headerFilename = this.parseContentDispositionFilename(response.headers.get("content-disposition"));
    const bestInfo = attachmentInfos.find(info => info.attachmentId === resolvedAttachmentId);
    const filename =
      this.decodeMimeHeader(String(headerFilename || "")).trim() ||
      bestInfo?.attachmentName ||
      this.decodeMimeHeader(String(options.filename || "")).trim() ||
      `anexo-${resolvedAttachmentId}`;

    return { filename, contentType, content };
  }

  private async fetchFullContent(zohoMsgId: string, zohoFolderId?: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    const delays = [500, 1500, 3000];

    const endpoints = [];
    if (zohoFolderId) {
      endpoints.push(`/folders/${zohoFolderId}/messages/${zohoMsgId}/content?includeBlockContent=true`);
    }
    endpoints.push(`/messages/${zohoMsgId}/content?includeBlockContent=true`);

    for (const endpoint of endpoints) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const contentResult = await this.apiRequest(endpoint);
          const body = this.extractBodyFromResponse(contentResult);

          if (body) {
            const sizeBytes = Buffer.byteLength(body, "utf-8");
            console.log(`[ZohoMail] Content fetched for ${zohoMsgId}: ${sizeBytes} bytes (${body.length} chars) via ${endpoint}`);
            return body;
          }

          console.warn(`[ZohoMail] Empty body from ${endpoint} attempt ${attempt} for ${zohoMsgId}, response keys: ${JSON.stringify(Object.keys(contentResult.data || {}))}`);
        } catch (contentError: any) {
          console.warn(`[ZohoMail] Content fetch attempt ${attempt}/${MAX_ATTEMPTS} failed for ${zohoMsgId} via ${endpoint}: ${contentError.message}`);
        }

        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, delays[attempt - 1]));
        }
      }
    }

    console.error(`[ZohoMail] FAILED to fetch full content for message ${zohoMsgId} after all attempts and endpoints`);
    return "";
  }

  async testConnection(): Promise<{ success: boolean; connected?: boolean; error?: string }> {
    try {
      if (!this.configured) {
        return { success: false, error: "Zoho Mail not configured" };
      }

      await this.getAccountId();
      return { success: true, connected: true };
    } catch (error) {
      console.error("[ZohoMail] Connection test failed:", error);
      return { success: false, connected: false, error: (error as Error).message };
    }
  }

  async syncFolders(tenantId: number): Promise<void> {
    if (!this.configured) {
      throw new Error("Zoho Mail not configured");
    }

    console.log("[ZohoMail] Syncing folders...");
    const result = await this.apiRequest("/folders");
    const folders = result.data;

    if (!folders || !Array.isArray(folders)) {
      console.log("[ZohoMail] No folders returned from API");
      return;
    }

    for (const folder of folders) {
      const folderName = folder.folderName || folder.name;
      const zohoFolderId = String(folder.folderId);

      let folderType = "custom";
      const lowerName = (folderName || "").toLowerCase();
      if (lowerName === "inbox") folderType = "inbox";
      else if (lowerName === "sent" || lowerName === "sent mail" || lowerName === "enviados") folderType = "sent";
      else if (lowerName === "drafts" || lowerName === "rascunhos" || lowerName === "draft") folderType = "drafts";
      else if (lowerName === "trash" || lowerName === "lixeira" || lowerName === "deleted") folderType = "trash";
      else if (lowerName === "spam" || lowerName === "junk") folderType = "spam";

      await storage.getOrCreateEmailFolder({
        tenantId,
        name: folderName,
        imapPath: zohoFolderId,
        type: folderType,
      });
    }

    console.log(`[ZohoMail] Synced ${folders.length} folders`);
  }

  isSyncing(): boolean {
    return this.syncLock;
  }

  async syncEmails(tenantId: number, folderId: number, imapPath: string, limit = 50): Promise<number> {
    if (!this.configured) {
      throw new Error("Zoho Mail not configured");
    }

    if (this.syncLock) {
      console.log("[ZohoMail] Sync already in progress, skipping");
      return 0;
    }

    this.syncLock = true;
    try {
      return await this._doSyncEmails(tenantId, folderId, imapPath, limit);
    } finally {
      this.syncLock = false;
    }
  }

  private async _doSyncEmails(tenantId: number, folderId: number, imapPath: string, limit = 50): Promise<number> {
    const zohoFolderId = imapPath;
    console.log(`[ZohoMail] Syncing emails for folder ${zohoFolderId}, limit ${limit}`);

    const result = await this.apiRequest(`/messages/view?folderId=${zohoFolderId}&limit=${limit}&includeto=true`, true);
    const messagesList = result.data;

    if (!messagesList || !Array.isArray(messagesList)) {
      console.log("[ZohoMail] No messages returned from API");
      await storage.updateEmailFolderCounts(folderId);
      await storage.updateEmailFolderLastSync(folderId);
      return 0;
    }

    let syncedCount = 0;

    for (const msg of messagesList) {
      try {
        const zohoMsgId = String(msg.messageId || msg.msgId || "");
        const messageId = zohoMsgId || `zoho-${Date.now()}`;

        const existingEmail = await storage.getEmailByMessageId(tenantId, messageId);
        if (existingEmail) continue;

        let bodyHtml = "";
        let bodyText = "";
        if (zohoMsgId) {
          bodyHtml = await this.fetchFullContent(zohoMsgId, zohoFolderId);
        }

        if (!bodyHtml) {
          console.warn(`[ZohoMail] No full content available for message ${zohoMsgId} - saving without body (will need refetch)`);
        }

        const savedBodySize = Buffer.byteLength(bodyHtml || "", "utf-8");
        console.log(`[ZohoMail] Saving email ${zohoMsgId}: bodyHtml=${savedBodySize} bytes`);

        const { address: fromAddress, name: fromName } = this.parseFromAddress(msg.fromAddress || msg.sender || "");
        const decodedSubject = this.decodeMimeHeader(msg.subject || "(Sem assunto)") || "(Sem assunto)";

        const toAddresses = this.parseToAddresses(msg.toAddress || msg.to || "");
        const ccAddresses = this.parseCcAddresses(msg.ccAddress || msg.cc || "");

        const sentDate = msg.sentDateInGMT
          ? new Date(parseInt(String(msg.sentDateInGMT), 10))
          : msg.receivedTime
            ? new Date(parseInt(String(msg.receivedTime), 10))
            : new Date();

        const isRead = msg.status === "1" || msg.flagid === "2";
        const hasAttachments = msg.hasAttachment === "1" || (msg.attachments && msg.attachments.length > 0);
        let attachments = this.extractZohoAttachments(msg);
        if (hasAttachments && attachments.length === 0 && zohoMsgId) {
          const details = await this.fetchMessageDetails(zohoMsgId, zohoFolderId);
          attachments = this.extractZohoAttachments(details);
        }

        const emailData: InsertEmail = {
          tenantId,
          folderId,
          messageId,
          uid: 0,
          subject: decodedSubject,
          fromAddress,
          fromName,
          toAddresses,
          ccAddresses: ccAddresses.length > 0 ? ccAddresses : undefined,
          bodyText: bodyText || "",
          bodyHtml: bodyHtml || "",
          date: sentDate,
          isRead,
          hasAttachments: !!hasAttachments,
          inReplyTo: msg.inReplyTo || undefined,
          references: msg.references ? (Array.isArray(msg.references) ? msg.references : [msg.references]) : undefined,
        };

        const email = await storage.createEmail(emailData);
        for (const att of attachments) {
          await storage.createEmailAttachment({
            emailId: email.id,
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            storagePath: att.storagePath,
            contentId: att.contentId,
          });
        }
        syncedCount++;
      } catch (emailError) {
        console.error("[ZohoMail] Error saving email:", emailError);
      }
    }

    await storage.updateEmailFolderCounts(folderId);
    await storage.updateEmailFolderLastSync(folderId);

    console.log(`[ZohoMail] Synced ${syncedCount} new emails from folder ${zohoFolderId}`);
    return syncedCount;
  }

  async refetchEmailContent(tenantId: number): Promise<{ updated: number; failed: number; skipped: number }> {
    if (!this.configured) {
      throw new Error("Zoho Mail not configured");
    }

    console.log("[ZohoMail] Re-fetching full content for ALL emails (no size limit)...");
    const folders = await storage.getEmailFolders(tenantId);
    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const folder of folders) {
      const folderEmails = await storage.getEmails(folder.id, 500, 0);
      const zohoFolderId = folder.imapPath;

      for (const email of folderEmails) {
        const zohoMsgId = email.messageId;
        if (!zohoMsgId || zohoMsgId.startsWith("zoho-")) {
          skipped++;
          continue;
        }

        try {
          const fullBody = await this.fetchFullContent(zohoMsgId, zohoFolderId);

          if (!fullBody) {
            console.warn(`[ZohoMail] Could not fetch content for ${zohoMsgId}`);
            failed++;
            continue;
          }

          const currentBody = email.bodyHtml || "";
          const newSize = Buffer.byteLength(fullBody, "utf-8");
          const oldSize = Buffer.byteLength(currentBody, "utf-8");

          if (fullBody.length > currentBody.length || this.looksIncomplete(currentBody)) {
            await storage.updateEmail(email.id, { bodyHtml: fullBody });
            updated++;
            console.log(`[ZohoMail] Updated content for email ${zohoMsgId} (${oldSize} → ${newSize} bytes)`);
          } else {
            skipped++;
          }
        } catch (err: any) {
          failed++;
          console.warn(`[ZohoMail] Failed to re-fetch content for ${zohoMsgId}: ${err.message}`);
        }

        await new Promise(r => setTimeout(r, 300));
      }
    }

    console.log(`[ZohoMail] Re-fetch complete: ${updated} updated, ${failed} failed, ${skipped} skipped`);
    return { updated, failed, skipped };
  }

  async fetchSingleEmailContent(emailId: number): Promise<{ success: boolean; sizeBytes?: number; error?: string }> {
    if (!this.configured) {
      throw new Error("Zoho Mail not configured");
    }

    const email = await storage.getEmail(emailId);
    if (!email) {
      return { success: false, error: "Email not found" };
    }

    const zohoMsgId = email.messageId;
    if (!zohoMsgId || zohoMsgId.startsWith("zoho-")) {
      return { success: false, error: "Invalid Zoho message ID" };
    }

    const folders = await storage.getEmailFolders(email.tenantId);
    const folder = folders.find(f => f.id === email.folderId);
    const zohoFolderId = folder?.imapPath;

    console.log(`[ZohoMail] Fetching full content for single email ${zohoMsgId} (folder: ${zohoFolderId})`);

    const fullBody = await this.fetchFullContent(zohoMsgId, zohoFolderId);

    if (!fullBody) {
      return { success: false, error: "Could not fetch content from Zoho API" };
    }

    const sizeBytes = Buffer.byteLength(fullBody, "utf-8");
    await storage.updateEmail(emailId, { bodyHtml: fullBody });

    const existingAttachments = await storage.getEmailAttachments(emailId);
    if (existingAttachments.length === 0) {
      const details = await this.fetchMessageDetails(zohoMsgId, zohoFolderId);
      const attachments = this.extractZohoAttachments(details);
      for (const att of attachments) {
        await storage.createEmailAttachment({
          emailId,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          storagePath: att.storagePath,
          contentId: att.contentId,
        });
      }
      if (attachments.length > 0 && !email.hasAttachments) {
        await storage.updateEmail(emailId, { hasAttachments: true });
      }
    }

    console.log(`[ZohoMail] Single email ${zohoMsgId} updated: ${sizeBytes} bytes`);
    return { success: true, sizeBytes };
  }

  private looksIncomplete(html: string): boolean {
    if (!html || html.length === 0) return true;

    const trimmed = html.trim();
    if (trimmed.length < 50) return true;

    const openDivs = (trimmed.match(/<div/gi) || []).length;
    const closeDivs = (trimmed.match(/<\/div>/gi) || []).length;
    if (openDivs > 0 && closeDivs === 0) return true;
    if (openDivs > closeDivs + 2) return true;

    const openTables = (trimmed.match(/<table/gi) || []).length;
    const closeTables = (trimmed.match(/<\/table>/gi) || []).length;
    if (openTables > closeTables) return true;

    if (/\w{3,}$/.test(trimmed) && !trimmed.endsWith(">")) return true;

    return false;
  }

  async syncAllFolders(tenantId: number, limit = 50): Promise<{ folder: string; synced: number }[]> {
    const folders = await storage.getEmailFolders(tenantId);
    const results: { folder: string; synced: number }[] = [];

    for (const folder of folders) {
      try {
        const synced = await this.syncEmails(tenantId, folder.id, folder.imapPath, limit);
        results.push({ folder: folder.name, synced });
      } catch (error) {
        console.error(`[ZohoMail] Error syncing folder ${folder.name}:`, error);
        results.push({ folder: folder.name, synced: 0 });
      }
    }

    return results;
  }

  async sendEmail(options: { to: string; subject: string; htmlBody: string; cc?: string; bcc?: string; fromAddress?: string }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.configured) {
      return { success: false, error: "Zoho Mail not configured" };
    }

    try {
      const token = await this.refreshAccessToken();
      const accountId = await this.getAccountId();

      const payload: any = {
        fromAddress: options.fromAddress || process.env.ZOHO_MAIL_USER || "",
        toAddress: options.to,
        subject: options.subject,
        content: options.htmlBody,
        mailFormat: "html",
      };

      if (options.cc) payload.ccAddress = options.cc;
      if (options.bcc) payload.bccAddress = options.bcc;

      const response = await fetch(`${ZOHO_BASE_URL}/accounts/${accountId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("[ZohoMail] Send email error:", response.status, text);
        return { success: false, error: `Zoho API error ${response.status}: ${text}` };
      }

      const result = await response.json();
      console.log("[ZohoMail] Email sent successfully via API");
      return { success: true, messageId: result.data?.messageId || undefined };
    } catch (error: any) {
      console.error("[ZohoMail] Send email error:", error);
      return { success: false, error: error.message };
    }
  }

  private parseFromAddress(from: string): { address: string; name: string } {
    if (!from) return { address: "", name: "" };

    const decodedFrom = this.decodeMimeHeader(from).replace(/\s+/g, " ").trim();

    const match = decodedFrom.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
    if (match) {
      return {
        name: this.decodeMimeHeader(match[1].trim()),
        address: match[2].trim(),
      };
    }

    if (decodedFrom.includes("@")) {
      return { address: decodedFrom.trim(), name: "" };
    }

    return { address: decodedFrom.trim(), name: "" };
  }

  private parseToAddresses(to: string | string[]): string[] {
    if (!to) return [];
    if (Array.isArray(to)) return to;

    return to.split(",").map((addr: string) => {
      const match = addr.match(/<([^>]+)>/);
      return match ? match[1].trim() : addr.trim();
    }).filter(Boolean);
  }

  private parseCcAddresses(cc: string | string[]): string[] {
    if (!cc) return [];
    return this.parseToAddresses(cc);
  }
}

export const zohoMailService = new ZohoMailService();
