import { storage } from "../storage";
import { db } from "../db";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { caseMovements, cases } from "@shared/schema";

export async function syncDeadlinesToAgenda(tenantId: number = 1): Promise<number> {
  let created = 0;

  try {
    const deadlines = await storage.getDeadlinesByTenant(tenantId);
    const existingEvents = await storage.getAgendaEventsByTenant(tenantId);
    const existingSourceIds = new Set(
      existingEvents
        .filter((e: any) => e.sourceType !== "manual")
        .map((e: any) => e.sourceId)
    );

    const allCases = await storage.getCasesByTenant(tenantId);
    const strategicCaseIds = new Set(
      allCases.filter((c: any) => c.isStrategic).map((c: any) => c.id)
    );

    for (const deadline of deadlines) {
      const sourceId = `deadline-${deadline.id}`;
      if (existingSourceIds.has(sourceId)) continue;
      if (deadline.status === "concluido" || deadline.status === "cancelado") continue;
      if (deadline.caseId && !strategicCaseIds.has(deadline.caseId)) continue;

      const dueDate = new Date(deadline.dueDate);
      const dateStr = dueDate.toISOString().split("T")[0];

      await storage.createAgendaEvent({
        tenantId,
        title: deadline.title,
        type: deadline.type === "audiencia" ? "Audiência" : "Prazo",
        date: dateStr,
        timeStart: dueDate.getHours() > 0
          ? `${String(dueDate.getHours()).padStart(2, "0")}:${String(dueDate.getMinutes()).padStart(2, "0")}`
          : "08:00",
        timeEnd: null,
        responsible: "Dr. Ronald Serra",
        description: deadline.description || "",
        sourceType: "deadline",
        sourceId,
        status: "agendado",
        caseId: deadline.caseId,
        clientId: null,
      });
      created++;
    }

    for (const caseItem of allCases) {
      if (!caseItem.isStrategic) continue;

      const movements = await storage.getCaseMovements(caseItem.id);

      for (const mov of movements) {
        if (!mov.actionDeadline) continue;

        const sourceId = `movement-${mov.id}`;
        if (existingSourceIds.has(sourceId)) continue;

        const deadlineDate = new Date(mov.actionDeadline);
        const dateStr = deadlineDate.toISOString().split("T")[0];

        let eventType = "Prazo";
        if (mov.type === "Audiência") eventType = "Audiência";

        await storage.createAgendaEvent({
          tenantId,
          caseId: caseItem.id,
          clientId: null,
          title: `${mov.type}: ${mov.description?.substring(0, 80) || "Movimentação"}`,
          type: eventType,
          date: dateStr,
          timeStart: deadlineDate.getHours() > 0
            ? `${String(deadlineDate.getHours()).padStart(2, "0")}:${String(deadlineDate.getMinutes()).padStart(2, "0")}`
            : "08:00",
          timeEnd: null,
          responsible: "Dr. Ronald Serra",
          description: mov.description || "",
          sourceType: "escavador",
          sourceId,
          status: "agendado",
        });
        created++;
      }
    }

    const intimacaoDeadlines = await db.select({
      id: caseMovements.id,
      caseId: caseMovements.caseId,
      aiDeadlineDate: caseMovements.aiDeadlineDate,
      aiDeadlineSummary: caseMovements.aiDeadlineSummary,
      description: caseMovements.description,
      caseNumber: cases.caseNumber,
      isStrategic: cases.isStrategic,
    }).from(caseMovements)
      .innerJoin(cases, eq(caseMovements.caseId, cases.id))
      .where(and(
        eq(cases.tenantId, tenantId),
        eq(cases.isStrategic, true),
        isNotNull(caseMovements.aiDeadlineDate),
        isNull(caseMovements.acknowledgedAt)
      ));

    for (const mov of intimacaoDeadlines) {
      const sourceId = `intimacao-deadline-${mov.id}`;
      if (existingSourceIds.has(sourceId)) continue;

      const dateStr = mov.aiDeadlineDate!;

      await storage.createAgendaEvent({
        tenantId,
        caseId: mov.caseId,
        clientId: null,
        title: `Prazo Intimação: ${mov.aiDeadlineSummary || mov.description?.substring(0, 80) || "Intimação"}`,
        type: "Prazo",
        date: dateStr,
        timeStart: "08:00",
        timeEnd: null,
        responsible: "Dr. Ronald Serra",
        description: `Processo ${mov.caseNumber} - ${mov.description || ""}`,
        sourceType: "intimacao",
        sourceId,
        status: "agendado",
      });
      created++;
    }

    if (created > 0) {
      console.log(`[Agenda Sync] Created ${created} events from strategic case deadlines, movements and intimações`);
    }
  } catch (error) {
    console.error("[Agenda Sync] Error syncing deadlines to agenda:", error);
  }

  return created;
}
