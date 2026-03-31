import { db } from "../db";
import { 
  clients, cases, caseMovements, contracts, documents, 
  debtors, negotiations, negotiationContacts, negotiationRounds, invoices
} from "../../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'date', 'readAt', 'aiAnalyzedAt', 'acknowledgedAt',
  'actionDeadline', 'distributionDate', 'datajudLastSync', 'startDate', 'endDate',
  'nextAdjustmentDate', 'validatedAt', 'dueDate', 'paidAt', 'deadline',
  'sentAt', 'respondedAt', 'created_at', 'updated_at'
]);

function toDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return val;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function convertDates(record: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(record)) {
    if (DATE_FIELDS.has(key)) {
      result[key] = toDate(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function stripId(record: any): any {
  const { id, ...rest } = record;
  return rest;
}

export async function runDataMigrationIfNeeded() {
  try {
    const migrationFile = path.join(process.cwd(), "server", "migration-data.json");
    if (!fs.existsSync(migrationFile)) {
      console.log("[Migration] No migration data file found, skipping.");
      return;
    }

    const tenantId = 1;
    const existingCases = await db.select({ id: cases.id }).from(cases).where(eq(cases.tenantId, tenantId));
    
    if (existingCases.length >= 50) {
      console.log(`[Migration] Database already has ${existingCases.length} cases, skipping migration.`);
      return;
    }

    console.log(`[Migration] Database has only ${existingCases.length} cases. Starting data migration...`);
    
    const rawData = fs.readFileSync(migrationFile, "utf-8");
    const data = JSON.parse(rawData);

    const clientIdMap = new Map<number, number>();
    const caseIdMap = new Map<number, number>();
    const contractIdMap = new Map<number, number>();
    const negIdMap = new Map<number, number>();
    const debtorIdMap = new Map<number, number>();

    let stats = { clients: 0, cases: 0, movements: 0, contracts: 0, documents: 0, debtors: 0, negotiations: 0, invoices: 0 };

    for (const client of (data.clients || [])) {
      const oldId = client.id;
      const cleaned = convertDates(stripId(client));
      try {
        const existing = await db.select().from(clients).where(
          and(eq(clients.tenantId, tenantId), eq(clients.name, client.name))
        ).limit(1);
        
        if (existing.length > 0) {
          clientIdMap.set(oldId, existing[0].id);
          continue;
        }
        
        const [inserted] = await db.insert(clients).values({
          ...cleaned,
          tenantId,
          createdAt: cleaned.createdAt || new Date(),
        }).returning();
        clientIdMap.set(oldId, inserted.id);
        stats.clients++;
      } catch (e: any) {
        console.error(`[Migration] Client error (${client.name}):`, e.message?.substring(0, 100));
      }
    }
    console.log(`[Migration] Clients imported: ${stats.clients}`);

    for (const contract of (data.contracts || [])) {
      const oldId = contract.id;
      const cleaned = convertDates(stripId(contract));
      try {
        const [inserted] = await db.insert(contracts).values({
          ...cleaned,
          tenantId,
          clientId: clientIdMap.get(contract.clientId) || contract.clientId,
          createdAt: cleaned.createdAt || new Date(),
        }).returning();
        contractIdMap.set(oldId, inserted.id);
        stats.contracts++;
      } catch (e: any) {
        console.error(`[Migration] Contract error:`, e.message?.substring(0, 100));
      }
    }
    console.log(`[Migration] Contracts imported: ${stats.contracts}`);

    for (const cs of (data.cases || [])) {
      const oldId = cs.id;
      const cleaned = convertDates(stripId(cs));
      try {
        const existing = await db.select().from(cases).where(
          and(eq(cases.tenantId, tenantId), eq(cases.caseNumber, cs.caseNumber))
        ).limit(1);
        
        if (existing.length > 0) {
          caseIdMap.set(oldId, existing[0].id);
          continue;
        }
        
        const [inserted] = await db.insert(cases).values({
          ...cleaned,
          tenantId,
          clientId: cs.clientId ? (clientIdMap.get(cs.clientId) || cs.clientId) : null,
          contractId: cs.contractId ? (contractIdMap.get(cs.contractId) || cs.contractId) : null,
          createdAt: cleaned.createdAt || new Date(),
        }).returning();
        caseIdMap.set(oldId, inserted.id);
        stats.cases++;
      } catch (e: any) {
        console.error(`[Migration] Case error (${cs.caseNumber}):`, e.message?.substring(0, 200));
      }
    }
    console.log(`[Migration] Cases imported: ${stats.cases}`);

    const movements = data.caseMovements || [];
    console.log(`[Migration] Starting ${movements.length} movements import...`);
    for (let i = 0; i < movements.length; i++) {
      const mov = movements[i];
      const newCaseId = caseIdMap.get(mov.caseId);
      if (!newCaseId) continue;
      const cleaned = convertDates(stripId(mov));
      try {
        await db.insert(caseMovements).values({
          ...cleaned,
          caseId: newCaseId,
          createdAt: cleaned.createdAt || new Date(),
        });
        stats.movements++;
      } catch (e: any) {
      }
      if ((i + 1) % 1000 === 0) {
        console.log(`[Migration] Movements progress: ${i + 1}/${movements.length}`);
      }
    }
    console.log(`[Migration] Movements imported: ${stats.movements}`);

    for (const doc of (data.documents || [])) {
      const cleaned = convertDates(stripId(doc));
      try {
        await db.insert(documents).values({
          ...cleaned,
          tenantId,
          caseId: doc.caseId ? (caseIdMap.get(doc.caseId) || doc.caseId) : null,
          clientId: doc.clientId ? (clientIdMap.get(doc.clientId) || doc.clientId) : null,
          createdAt: cleaned.createdAt || new Date(),
        });
        stats.documents++;
      } catch (e: any) {
        console.error(`[Migration] Document error:`, e.message?.substring(0, 100));
      }
    }
    console.log(`[Migration] Documents imported: ${stats.documents}`);

    for (const debtor of (data.debtors || [])) {
      const oldId = debtor.id;
      const cleaned = convertDates(stripId(debtor));
      try {
        const newClientId = clientIdMap.get(debtor.clientId) || debtor.clientId;
        const existing = await db.select().from(debtors).where(
          and(eq(debtors.clientId, newClientId), eq(debtors.name, debtor.name))
        ).limit(1);
        
        if (existing.length > 0) {
          debtorIdMap.set(oldId, existing[0].id);
          continue;
        }
        
        const [inserted] = await db.insert(debtors).values({
          ...cleaned,
          clientId: newClientId,
          tenantId,
          createdAt: cleaned.createdAt || new Date(),
        }).returning();
        debtorIdMap.set(oldId, inserted.id);
        stats.debtors++;
      } catch (e: any) {
        console.error(`[Migration] Debtor error:`, e.message?.substring(0, 100));
      }
    }
    console.log(`[Migration] Debtors imported: ${stats.debtors}`);

    for (const neg of (data.negotiations || [])) {
      const oldId = neg.id;
      const cleaned = convertDates(stripId(neg));
      try {
        const [inserted] = await db.insert(negotiations).values({
          ...cleaned,
          tenantId,
          clientId: neg.clientId ? (clientIdMap.get(neg.clientId) || neg.clientId) : null,
          debtorId: neg.debtorId ? (debtorIdMap.get(neg.debtorId) || neg.debtorId) : null,
          createdAt: cleaned.createdAt || new Date(),
        }).returning();
        negIdMap.set(oldId, inserted.id);
        stats.negotiations++;
      } catch (e: any) {
        console.error(`[Migration] Negotiation error:`, e.message?.substring(0, 100));
      }
    }

    for (const contact of (data.negotiationContacts || [])) {
      const cleaned = convertDates(stripId(contact));
      const newNegId = negIdMap.get(contact.negotiationId);
      if (!newNegId) continue;
      try {
        await db.insert(negotiationContacts).values({
          ...cleaned,
          negotiationId: newNegId,
        });
      } catch (e: any) {}
    }

    for (const round of (data.negotiationRounds || [])) {
      const cleaned = convertDates(stripId(round));
      const newNegId = negIdMap.get(round.negotiationId);
      if (!newNegId) continue;
      try {
        await db.insert(negotiationRounds).values({
          ...cleaned,
          negotiationId: newNegId,
          createdAt: cleaned.createdAt || new Date(),
        });
      } catch (e: any) {}
    }

    for (const inv of (data.invoices || [])) {
      const cleaned = convertDates(stripId(inv));
      try {
        await db.insert(invoices).values({
          ...cleaned,
          tenantId,
          clientId: inv.clientId ? (clientIdMap.get(inv.clientId) || inv.clientId) : null,
          contractId: inv.contractId ? (contractIdMap.get(inv.contractId) || inv.contractId) : null,
          createdAt: cleaned.createdAt || new Date(),
        });
        stats.invoices++;
      } catch (e: any) {}
    }

    console.log(`[Migration] Complete! Stats:`, JSON.stringify(stats));
    console.log(`[Migration] ID mappings: ${clientIdMap.size} clients, ${caseIdMap.size} cases, ${debtorIdMap.size} debtors`);
    
  } catch (error: any) {
    console.error("[Migration] Fatal error:", error.message);
  }
}
