import { format } from "date-fns";

const ACTION_PREFIX_PATTERN = "A(?:ÇÃO|Ã‡ÃƒO)";
const PIECE_TOKEN_PATTERN = "PE(?:ÇA|Ã‡A)";
const REPORT_TOKEN_PATTERN = "RELAT(?:ÓRIO|Ã“RIO)";

export async function processLegacySecretaryActions(params: {
  response: string;
  tenantId: number;
  jid: string;
  contactName: string;
  clientId?: number;
  openai: any;
  storage: any;
  createSecretaryAuditLog: (params: any) => Promise<any>;
  createAgendaEvent: (data: any) => Promise<any>;
  generateSimpleLegacyPiece: (params: any) => Promise<any>;
  formatForWhatsApp: (text: string) => string;
  runSecretaryJob: <T>(params: { kind: any; operation: () => Promise<T> }) => Promise<T>;
}): Promise<string> {
  const {
    response,
    tenantId,
    jid,
    contactName,
    clientId,
    storage,
    createSecretaryAuditLog,
    createAgendaEvent,
    generateSimpleLegacyPiece,
    formatForWhatsApp,
    openai,
    runSecretaryJob,
  } = params;

  const searchTagRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:PESQUISAR\\|[^\\]]+\\]`, "g");
  const pieceTagRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:GERAR_${PIECE_TOKEN_PATTERN}\\|([^|]+)\\|([^\\]]+)\\]`);
  const pieceTagReplaceRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:GERAR_${PIECE_TOKEN_PATTERN}\\|[^\\]]+\\]`);
  const agendaTagRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:AGENDAR\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^|]+)\\|([^\\]]+)\\]`);
  const agendaTagReplaceRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:AGENDAR\\|[^\\]]+\\]`);
  const reportTagRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:${REPORT_TOKEN_PATTERN}\\|([^|]+)\\|([^\\]]+)\\]`);
  const reportTagReplaceRegex = new RegExp(`\\[${ACTION_PREFIX_PATTERN}:${REPORT_TOKEN_PATTERN}\\|[^\\]]+\\]`);

  let cleanResponse = response;
  cleanResponse = cleanResponse.replace(searchTagRegex, "").trim();

  const pieceMatch = response.match(pieceTagRegex);
  if (pieceMatch) {
    const [, pieceType, description] = pieceMatch;
    try {
      const generatedPiece = await runSecretaryJob({
        kind: "legacy_piece_generation",
        operation: () => generateSimpleLegacyPiece({
          openai,
          tenantId,
          pieceType,
          description,
          createGeneratedPiece: storage.createGeneratedPiece.bind(storage),
        }),
      });

      if (generatedPiece) {
        await createSecretaryAuditLog({
          tenantId, jid, contactName,
          actionType: "gerar_peca",
          description: `Gerou ${pieceType}: ${description.substring(0, 100)}`,
          status: "completed",
          actorType: clientId ? "client" : "unknown",
        });
      }
    } catch (error) {
      console.error("[Secretary] Error generating piece:", error);
    }

    cleanResponse = cleanResponse.replace(pieceTagReplaceRegex, "").trim();
  }

  const agendaMatch = response.match(agendaTagRegex);
  if (agendaMatch) {
    const [, date, timeStart, timeEnd, title, responsible] = agendaMatch;
    try {
      await createAgendaEvent({
        tenantId,
        title: `${title} - ${contactName}`,
        type: "Reunião",
        date,
        timeStart,
        timeEnd,
        responsible: responsible || "Dr. Ronald Serra",
        description: `Agendado via Secretária LexAI para ${contactName}`,
        sourceType: "secretary",
        status: "agendado",
      });
      await createSecretaryAuditLog({
        tenantId, jid, contactName,
        actionType: "agendamento",
        description: `Agendou reunião: ${title} em ${date} às ${timeStart}`,
        status: "completed",
        actorType: clientId ? "client" : "unknown",
      });
    } catch (error) {
      console.error("[Secretary] Error creating event:", error);
    }
    cleanResponse = cleanResponse.replace(agendaTagReplaceRegex, "").trim();
  }

  const reportMatch = response.match(reportTagRegex);
  if (reportMatch) {
    const [, tipo, descricao] = reportMatch;
    await createSecretaryAuditLog({
      tenantId, jid, contactName,
      actionType: "relatorio",
      description: `Solicitação de relatório: ${tipo} - ${descricao}`,
      status: "completed",
      actorType: clientId ? "client" : "unknown",
    });
    cleanResponse = cleanResponse.replace(reportTagReplaceRegex, "").trim();
  }

  if (response.includes("[URGENTE]")) {
    await createSecretaryAuditLog({
      tenantId, jid, contactName,
      actionType: "urgencia",
      description: `Mensagem urgente detectada de ${contactName}`,
      status: "needs_attention",
      actorType: clientId ? "client" : "unknown",
    });
    cleanResponse = cleanResponse.replace("[URGENTE]", "").trim();
  }

  let noteMatch: RegExpExecArray | null;
  const noteRegex = /\[NOTA:([^\]]+)\]/g;
  while ((noteMatch = noteRegex.exec(response)) !== null) {
    const noteText = noteMatch[1].trim();
    if (clientId && noteText) {
      try {
        const client = await storage.getClient(clientId);
        if (client) {
          const existingNotes = client.secretaryNotes || "";
          const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");
          const updatedNotes = existingNotes
            ? `${existingNotes}\n[${timestamp}] ${noteText}`
            : `[${timestamp}] ${noteText}`;
          await storage.updateClient(clientId, { secretaryNotes: updatedNotes });
        }
      } catch (error) {
        console.error("[Secretary] Error saving note:", error);
      }
    }
    cleanResponse = cleanResponse.replace(noteMatch[0], "").trim();
  }

  return formatForWhatsApp(cleanResponse);
}
