import { inferTemplateTypeFromLegalRequestText } from "./secretaryPromptShared";

function normalizeAccents(str: string): string {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(str: string): string {
  return normalizeAccents(str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export type SecretaryInternalIntent =
  | "greeting"
  | "system_query"
  | "legal_piece"
  | "contract"
  | "resend_document"
  | "operational_action"
  | "approval"
  | "rejection"
  | "web_research"
  | "unknown";

export type SecretaryInternalRoutingResult = {
  intent: SecretaryInternalIntent;
  confidence: number;
  latentNeed: string;
  recommendedTool: "executar_acao" | "consultar_sistema" | "pesquisar_web" | "none";
  pieceType?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  explicitResume: boolean;
  shouldIgnoreHistory: boolean;
  reasoningSummary: string;
};

export function buildSecretaryIntentRouterSystemPrompt(params: {
  isSocio: boolean;
  isKnownClient: boolean;
}) {
  return `Voce e o roteador interno da secretaria juridica do escritorio Marques & Serra Sociedade de Advogados.
Sua funcao NAO e responder ao usuario. Sua funcao e classificar o pedido atual e recomendar o proximo passo.

Regras:
- Considere prioritariamente a mensagem atual. Historico so serve como apoio, nunca como gatilho automatico.
- Se a mensagem atual for apenas saudacao curta, classifique como greeting e ignore historico.
- Se o usuario estiver pedindo peca juridica, classifique como legal_piece.
- Se estiver pedindo contrato, acordo ou termo, classifique como contract.
- Se estiver pedindo dados do sistema, classifique como system_query.
- Se estiver pedindo pesquisa juridica, legislacao, jurisprudencia ou duvida factual externa, classifique como web_research.
- Se estiver aprovando ou rejeitando algo pendente, classifique como approval ou rejection.
- So classifique como resend_document quando houver pedido EXPLICITO de arquivo Word/docx/documento.
- So classifique como operational_action para cadastro, atualizacao, agenda, arquivamento e tarefas operacionais claras.
- Se faltar dado essencial e a acao for clara, marque needsClarification=true e formule UMA pergunta curta e objetiva.
- Se a mensagem for ambigua, use unknown.

Contexto do ator:
- isSocio=${params.isSocio}
- isKnownClient=${params.isKnownClient}

Saia APENAS em JSON valido com este schema:
{
  "intent": "greeting|system_query|legal_piece|contract|resend_document|operational_action|approval|rejection|web_research|unknown",
  "confidence": 0.0,
  "latentNeed": "string curta",
  "recommendedTool": "executar_acao|consultar_sistema|pesquisar_web|none",
  "pieceType": "string opcional",
  "needsClarification": false,
  "clarificationQuestion": "string opcional",
  "explicitResume": false,
  "shouldIgnoreHistory": false,
  "reasoningSummary": "resumo curto"
}`;
}

export function buildSecretaryIntentRouterUserPrompt(params: {
  message: string;
  recentHistory: string;
  extractedMediaContext?: string;
}) {
  return `Mensagem atual:
"""${params.message || ""}"""

Historico recente:
"""${params.recentHistory || ""}"""

Conteudo extraido recente de midia/documentos:
"""${params.extractedMediaContext || ""}"""`;
}

export function parseSecretaryInternalRoutingResult(raw: string): SecretaryInternalRoutingResult | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const intent = String(parsed.intent || "unknown") as SecretaryInternalIntent;
    const recommendedTool = String(parsed.recommendedTool || "none") as SecretaryInternalRoutingResult["recommendedTool"];
    const pieceTypeRaw = typeof parsed.pieceType === "string" ? parsed.pieceType.trim() : "";

    return {
      intent,
      confidence: Number(parsed.confidence || 0),
      latentNeed: String(parsed.latentNeed || ""),
      recommendedTool,
      pieceType: pieceTypeRaw || undefined,
      needsClarification: Boolean(parsed.needsClarification),
      clarificationQuestion: parsed.clarificationQuestion ? String(parsed.clarificationQuestion) : undefined,
      explicitResume: Boolean(parsed.explicitResume),
      shouldIgnoreHistory: Boolean(parsed.shouldIgnoreHistory),
      reasoningSummary: String(parsed.reasoningSummary || ""),
    };
  } catch {
    return null;
  }
}

export function buildFallbackSecretaryInternalRouting(params: {
  message: string;
  isSocio: boolean;
}): SecretaryInternalRoutingResult {
  const normalized = normalizeForMatch(params.message);

  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|alo)[\s!?.]*$/.test(normalized)) {
    return {
      intent: "greeting",
      confidence: 0.99,
      latentNeed: "saudacao_inicial",
      recommendedTool: "none",
      needsClarification: false,
      explicitResume: false,
      shouldIgnoreHistory: true,
      reasoningSummary: "Saudacao pura detectada",
    };
  }

  if (/(lei|jurisprudencia|stj|stf|artigo|codigo|tribunal)/.test(normalized)) {
    return {
      intent: "web_research",
      confidence: 0.8,
      latentNeed: "pesquisa_juridica_externa",
      recommendedTool: "pesquisar_web",
      needsClarification: false,
      explicitResume: false,
      shouldIgnoreHistory: false,
      reasoningSummary: "Pesquisa juridica externa detectada por heuristica",
    };
  }

  if (/(contrato|termo de acordo|acordo extrajudicial|renegociacao)/.test(normalized) && params.isSocio) {
    return {
      intent: "contract",
      confidence: 0.9,
      latentNeed: "geracao_documento_contratual",
      recommendedTool: "executar_acao",
      needsClarification: false,
      explicitResume: false,
      shouldIgnoreHistory: false,
      reasoningSummary: "Pedido contratual detectado por heuristica",
    };
  }

  const pieceType = inferTemplateTypeFromLegalRequestText(params.message);
  if (pieceType !== "outro" || /(peticao|peca|recurso|contestacao|contrarraz|agravo|execucao|cumprimento de sentenca|monitoria|mandado|habeas|embargo|apelacao)/.test(normalized)) {
    return {
      intent: "legal_piece",
      confidence: 0.9,
      latentNeed: "geracao_peca_juridica",
      recommendedTool: "executar_acao",
      pieceType: pieceType === "outro" ? undefined : pieceType,
      needsClarification: false,
      explicitResume: false,
      shouldIgnoreHistory: false,
      reasoningSummary: "Pedido de peca detectado por heuristica",
    };
  }

  return {
    intent: "unknown",
    confidence: 0.4,
    latentNeed: "ambiguous_request",
    recommendedTool: "none",
    needsClarification: false,
    explicitResume: false,
    shouldIgnoreHistory: false,
    reasoningSummary: "Sem decisao robusta por fallback",
  };
}
