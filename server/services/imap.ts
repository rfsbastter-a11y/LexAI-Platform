import Imap from "imap";
import { simpleParser, ParsedMail, AddressObject } from "mailparser";
import { storage } from "../storage";
import type { InsertEmail, InsertEmailFolder, InsertEmailAttachment } from "@shared/schema";

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

interface EmailMessage {
  uid: number;
  messageId: string;
  subject: string;
  from: { address: string; name: string };
  to: string[];
  cc: string[];
  date: Date;
  bodyText: string;
  bodyHtml: string;
  hasAttachments: boolean;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
    contentId?: string;
  }[];
  inReplyTo?: string;
  references?: string[];
}

class ImapService {
  private config: ImapConfig | null = null;
  private imap: Imap | null = null;
  private isConnected = false;

  initialize() {
    const user = process.env.ZOHO_MAIL_USER;
    const password = process.env.ZOHO_MAIL_PASSWORD;

    if (!user || !password) {
      console.log("[IMAP] Credentials not configured - email sync disabled");
      return;
    }

    this.config = {
      user,
      password,
      host: "imap.zoho.com",
      port: 993,
      tls: true,
    };

    console.log(`[IMAP] Initialized for ${user}`);
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  private createConnection(): Promise<Imap> {
    return new Promise((resolve, reject) => {
      if (!this.config) {
        reject(new Error("IMAP not configured"));
        return;
      }

      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false },
      });

      imap.once("ready", () => {
        this.isConnected = true;
        resolve(imap);
      });

      imap.once("error", (err: Error) => {
        this.isConnected = false;
        reject(err);
      });

      imap.once("end", () => {
        this.isConnected = false;
      });

      imap.connect();
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const imap = await this.createConnection();
      imap.end();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async syncFolders(tenantId: number): Promise<void> {
    if (!this.config) {
      throw new Error("IMAP not configured");
    }

    const imap = await this.createConnection();

    return new Promise((resolve, reject) => {
      imap.getBoxes((err, boxes) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        const folderPromises: Promise<unknown>[] = [];
        
        const processBoxes = (boxes: Imap.MailBoxes, prefix = "") => {
          for (const [name, box] of Object.entries(boxes)) {
            const fullPath = prefix ? `${prefix}/${name}` : name;
            
            let folderType = "custom";
            const lowerName = name.toLowerCase();
            if (lowerName === "inbox") folderType = "inbox";
            else if (lowerName === "sent" || lowerName === "sent mail" || lowerName === "enviados") folderType = "sent";
            else if (lowerName === "drafts" || lowerName === "rascunhos") folderType = "drafts";
            else if (lowerName === "trash" || lowerName === "lixeira" || lowerName === "deleted") folderType = "trash";
            else if (lowerName === "spam" || lowerName === "junk") folderType = "spam";

            folderPromises.push(
              storage.getOrCreateEmailFolder({
                tenantId,
                name,
                imapPath: fullPath,
                type: folderType,
              })
            );

            if (box.children) {
              processBoxes(box.children, fullPath);
            }
          }
        };

        processBoxes(boxes);

        Promise.all(folderPromises)
          .then(() => {
            imap.end();
            resolve();
          })
          .catch((error) => {
            imap.end();
            reject(error);
          });
      });
    });
  }

  async syncEmails(tenantId: number, folderId: number, imapPath: string, limit = 50): Promise<number> {
    if (!this.config) {
      throw new Error("IMAP not configured");
    }

    const imap = await this.createConnection();

    return new Promise((resolve, reject) => {
      imap.openBox(imapPath, true, async (err, box) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        const totalMessages = box.messages.total;
        if (totalMessages === 0) {
          imap.end();
          resolve(0);
          return;
        }

        const start = Math.max(1, totalMessages - limit + 1);
        const range = `${start}:${totalMessages}`;

        const fetch = imap.seq.fetch(range, {
          bodies: "",
          struct: true,
        });

        const messages: EmailMessage[] = [];

        fetch.on("message", (msg, seqno) => {
          let uid = 0;
          let buffer = "";

          msg.on("body", (stream) => {
            stream.on("data", (chunk) => {
              buffer += chunk.toString("utf8");
            });
          });

          msg.once("attributes", (attrs) => {
            uid = attrs.uid;
          });

          msg.once("end", async () => {
            try {
              const parsed = await simpleParser(buffer);
              const fromAddr = this.extractAddress(parsed.from);
              
              messages.push({
                uid,
                messageId: parsed.messageId || `msg-${uid}-${Date.now()}`,
                subject: parsed.subject || "(Sem assunto)",
                from: fromAddr,
                to: this.extractAddresses(parsed.to),
                cc: this.extractAddresses(parsed.cc),
                date: parsed.date || new Date(),
                bodyText: parsed.text || "",
                bodyHtml: parsed.html || "",
                hasAttachments: (parsed.attachments?.length || 0) > 0,
                attachments: (parsed.attachments || []).map((att) => ({
                  filename: att.filename || "attachment",
                  contentType: att.contentType || "application/octet-stream",
                  size: att.size || 0,
                  content: att.content,
                  contentId: att.contentId,
                })),
                inReplyTo: parsed.inReplyTo,
                references: parsed.references ? 
                  (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : 
                  undefined,
              });
            } catch (parseError) {
              console.error("[IMAP] Error parsing message:", parseError);
            }
          });
        });

        fetch.once("error", (fetchErr) => {
          imap.end();
          reject(fetchErr);
        });

        fetch.once("end", async () => {
          let syncedCount = 0;

          for (const msg of messages) {
            try {
              const existingEmail = await storage.getEmailByMessageId(tenantId, msg.messageId);
              if (existingEmail) continue;

              const emailData: InsertEmail = {
                tenantId,
                folderId,
                messageId: msg.messageId,
                uid: msg.uid,
                subject: msg.subject,
                fromAddress: msg.from.address,
                fromName: msg.from.name,
                toAddresses: msg.to,
                ccAddresses: msg.cc.length > 0 ? msg.cc : undefined,
                bodyText: msg.bodyText,
                bodyHtml: msg.bodyHtml,
                date: msg.date,
                isRead: false,
                hasAttachments: msg.hasAttachments,
                inReplyTo: msg.inReplyTo,
                references: msg.references,
              };

              const email = await storage.createEmail(emailData);
              syncedCount++;

              for (const att of msg.attachments) {
                await storage.createEmailAttachment({
                  emailId: email.id,
                  filename: att.filename,
                  contentType: att.contentType,
                  size: att.size,
                  contentId: att.contentId,
                });
              }
            } catch (emailError) {
              console.error("[IMAP] Error saving email:", emailError);
            }
          }

          await storage.updateEmailFolderCounts(folderId);
          await storage.updateEmailFolderLastSync(folderId);

          imap.end();
          resolve(syncedCount);
        });
      });
    });
  }

  private extractAddress(from: AddressObject | AddressObject[] | undefined): { address: string; name: string } {
    if (!from) return { address: "", name: "" };
    const addr = Array.isArray(from) ? from[0] : from;
    const firstValue = addr?.value?.[0];
    return {
      address: firstValue?.address || "",
      name: firstValue?.name || "",
    };
  }

  private extractAddresses(addresses: AddressObject | AddressObject[] | undefined): string[] {
    if (!addresses) return [];
    const addrArray = Array.isArray(addresses) ? addresses : [addresses];
    const result: string[] = [];
    for (const addr of addrArray) {
      if (addr?.value) {
        for (const v of addr.value) {
          if (v.address) result.push(v.address);
        }
      }
    }
    return result;
  }

  async syncAllFolders(tenantId: number, limit = 50): Promise<{ folder: string; synced: number }[]> {
    const folders = await storage.getEmailFolders(tenantId);
    const results: { folder: string; synced: number }[] = [];

    for (const folder of folders) {
      try {
        const synced = await this.syncEmails(tenantId, folder.id, folder.imapPath, limit);
        results.push({ folder: folder.name, synced });
      } catch (error) {
        console.error(`[IMAP] Error syncing folder ${folder.name}:`, error);
        results.push({ folder: folder.name, synced: 0 });
      }
    }

    return results;
  }
}

export const imapService = new ImapService();
