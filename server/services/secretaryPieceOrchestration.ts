type ConversationMessage = { role: string; content: string };

export type PieceSourceDocument = {
  kind: string;
  preview: string;
};

function normalizeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(str: string): string {
  return normalizeAccents(str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function extractConversationSourceDocuments(
  conversationMessages?: ConversationMessage[],
): PieceSourceDocument[] {
  const userMessages = (conversationMessages || []).filter((message) => message.role === "user");
  return userMessages
    .filter((message) =>
      message.content.includes("[Conteúdo do documento") ||
      message.content.includes("[Transcrição do áudio") ||
      message.content.includes("[Conteúdo da imagem")
    )
    .slice(-10)
    .map((message) => {
      const kind =
        message.content.includes("[Conteúdo do documento") ? "documento" :
        message.content.includes("[Transcrição do áudio") ? "audio" :
        "imagem";

      return {
        kind,
        preview: message.content.substring(0, 300),
      };
    });
}

export function validatePieceRequest(params: {
  pieceType: string;
  prompt: string;
  caseNumber?: string;
  partyName?: string;
  documentCount: number;
}): string | null {
  const { pieceType, prompt, caseNumber, partyName, documentCount } = params;
  const normalizedPrompt = normalizeForMatch(prompt || "");

  if (!normalizedPrompt) {
    return "Preciso das orientações da peça para executar. Envie o pedido objetivo ou os documentos base.";
  }

  const hasFacts = normalizedPrompt.length >= 40;
  const hasCaseRef = !!caseNumber || /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(prompt || "");
  const hasPartyRef = !!partyName;
  const hasDocs = documentCount > 0;

  const stricterTypes = new Set([
    "execucao",
    "cumprimento_sentenca",
    "acao_monitoria",
    "contestacao",
    "recurso_apelacao",
    "agravo_instrumento",
    "contrarrazoes",
    "peticao_inicial",
  ]);

  if (stricterTypes.has(pieceType)) {
    if (!hasDocs && !hasCaseRef && !hasPartyRef) {
      return "Para elaborar essa peça, preciso de pelo menos um destes itens: número do processo, nome das partes ou os documentos base enviados no WhatsApp.";
    }
    if (!hasDocs && !hasFacts) {
      return "Preciso de mais base para elaborar essa peça. Pode me enviar os documentos ou indicar os fatos e pedidos principais?";
    }
  }

  if ((pieceType === "recurso_apelacao" || pieceType === "agravo_instrumento" || pieceType === "contrarrazoes") && !hasDocs && !hasCaseRef) {
    return "Para essa peça recursal, preciso do número do processo ou da decisão/documento base enviado no WhatsApp.";
  }

  return null;
}

export function buildPieceInstructionBrief(params: {
  userCommand: string;
  pieceType: string;
  caseNumber?: string;
  clientName?: string;
  debtorName?: string;
  conversationMessages?: ConversationMessage[];
  systemContext?: string;
}): { fullPrompt: string; documentCount: number; sourceDocuments: PieceSourceDocument[] } {
  const {
    userCommand,
    pieceType,
    caseNumber,
    clientName,
    debtorName,
    conversationMessages,
    systemContext,
  } = params;

  const userMessages = (conversationMessages || []).filter((message) => message.role === "user");
  const sourceDocuments = extractConversationSourceDocuments(conversationMessages);
  const docMessages = userMessages.filter((message) =>
    message.content.includes("[Conteúdo do documento") ||
    message.content.includes("[Transcrição do áudio") ||
    message.content.includes("[Conteúdo da imagem")
  );

  const plainInstructionMessages = userMessages
    .map((message) => message.content.trim())
    .filter(Boolean)
    .filter((content) =>
      !content.startsWith("[Conteúdo do documento") &&
      !content.startsWith("[Transcrição do áudio") &&
      !content.startsWith("[Conteúdo da imagem") &&
      !content.startsWith("[Conteúdo da imagem enviada")
    )
    .slice(-8);

  const instructionBlock = plainInstructionMessages.length > 0
    ? plainInstructionMessages.map((content, idx) => `${idx + 1}. ${content}`).join("\n")
    : userCommand;

  const documentBlock = docMessages.length > 0
    ? docMessages.slice(-10).map((message, idx) => {
        const trimmed = message.content.length > 6000 ? `${message.content.substring(0, 6000)}...` : message.content;
        return `DOCUMENTO ${idx + 1}:\n${trimmed}`;
      }).join("\n\n")
    : "Nenhum documento/anexo extraído na conversa.";

  const header = [
    "=== BRIEFING ESTRUTURADO PARA GERAÇÃO DE PEÇA JURÍDICA ===",
    `TIPO DA PEÇA: ${pieceType}`,
    caseNumber ? `NÚMERO DO PROCESSO: ${caseNumber}` : "",
    clientName ? `CLIENTE / PARTE REPRESENTADA: ${clientName}` : "",
    debtorName ? `PARTE CONTRÁRIA / DEVEDOR / RÉU: ${debtorName}` : "",
  ].filter(Boolean).join("\n");

  const prompt = [
    header,
    "",
    "REGRA MÁXIMA:",
    "- OBEDEÇA exatamente ao comando do sócio.",
    "- Use prioritariamente os documentos/anexos enviados nesta conversa do WhatsApp para fatos, datas, valores, nomes, pedidos e qualificação das partes.",
    "- Não ignore anexos. Não troque instrução concreta por texto genérico.",
    "- Se os documentos trouxerem dados suficientes, não use placeholders desnecessários.",
    "- Se houver conflito entre comando do sócio e documento, preserve o comando do sócio e use o documento como base de apoio factual.",
    "",
    "COMANDO CONSOLIDADO DO SÓCIO:",
    userCommand,
    "",
    "INSTRUÇÕES E ORIENTAÇÕES RECENTES DA CONVERSA:",
    instructionBlock,
    "",
    "DOCUMENTOS / ÁUDIOS / IMAGENS EXTRAÍDOS DO WHATSAPP:",
    documentBlock,
    systemContext ? `\nDADOS DO SISTEMA LEXAI:\n${systemContext}` : "",
  ].filter(Boolean).join("\n");

  return { fullPrompt: prompt, documentCount: docMessages.length, sourceDocuments };
}
