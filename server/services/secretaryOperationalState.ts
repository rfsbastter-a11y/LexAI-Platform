import { inferTemplateTypeFromLegalRequestText } from "./secretaryPromptShared";

type ConversationMessage = { role: string; content: string };

export type SecretaryOperationalState = {
  lastUserIntent: string;
  lastCaseNumber?: string;
  lastPieceType?: string;
  referencedDocumentCount: number;
  hasRecentMediaContext: boolean;
};

export function deriveSecretaryOperationalState(
  conversationMessages?: ConversationMessage[],
): SecretaryOperationalState {
  const messages = conversationMessages || [];
  const userMessages = messages.filter((message) => message.role === "user");
  const recentUserText = userMessages.slice(-6).map((message) => message.content).join("\n");
  const normalized = recentUserText.toLowerCase();

  let lastUserIntent = "conversa_geral";
  if (/peti[çc][ãa]o|peça|recurso|contrarraz|contestação|execução|cumprimento de sentença|agravo|monitoria|habeas|mandado/i.test(recentUserText)) {
    lastUserIntent = "geracao_peca";
  } else if (/contrato|acordo|termo/i.test(recentUserText)) {
    lastUserIntent = "geracao_contrato";
  } else if (/agendar|reunião|audiência|compromisso/i.test(recentUserText)) {
    lastUserIntent = "agendamento";
  } else if (/cadastre|atualize|registre|crie/i.test(recentUserText)) {
    lastUserIntent = "acao_cadastral";
  } else if (/relatório|resumo|andamento|processo|financeiro|prazos/i.test(recentUserText)) {
    lastUserIntent = "consulta_sistema";
  }

  const caseNumberMatch = recentUserText.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
  const referencedDocumentCount = userMessages.filter((message) =>
    message.content.includes("[Conteúdo do documento") ||
    message.content.includes("[Transcrição do áudio") ||
    message.content.includes("[Conteúdo da imagem")
  ).length;

  const lastPieceType = lastUserIntent === "geracao_peca"
    ? inferTemplateTypeFromLegalRequestText(normalized)
    : undefined;

  return {
    lastUserIntent,
    lastCaseNumber: caseNumberMatch?.[0],
    lastPieceType,
    referencedDocumentCount,
    hasRecentMediaContext: referencedDocumentCount > 0,
  };
}

export function formatOperationalStateForPrompt(state: SecretaryOperationalState): string {
  return [
    "ESTADO OPERACIONAL RECENTE DA CONVERSA:",
    `- Última intenção predominante: ${state.lastUserIntent}`,
    state.lastCaseNumber ? `- Último número de processo citado: ${state.lastCaseNumber}` : "",
    state.lastPieceType ? `- Último tipo de peça inferido: ${state.lastPieceType}` : "",
    `- Quantidade de documentos/mídias recentes com extração: ${state.referencedDocumentCount}`,
    `- Há contexto recente de mídia/documento: ${state.hasRecentMediaContext ? "sim" : "não"}`,
  ].filter(Boolean).join("\n");
}
