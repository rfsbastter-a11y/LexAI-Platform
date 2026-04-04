import type { SecretaryInternalRoutingResult } from "./secretaryInternalPrompts";

export type SecretaryPlan = {
  intent: string;
  shouldExecuteNow: boolean;
  actionType?: string;
  queryType?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  steps: string[];
  summary: string;
};

function normalizeAccents(str: string): string {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(str: string): string {
  return normalizeAccents(str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildSecretaryPlannerSystemPrompt(params: {
  routing: SecretaryInternalRoutingResult;
  isSocio: boolean;
}) {
  return `Voce e o planner interno da secretaria juridica do escritorio Marques & Serra Sociedade de Advogados.
Sua funcao e transformar a intencao ja roteada em um plano operacional curto e tipado.

Regras:
- Nao responda ao usuario.
- Se faltar dado minimo para executar, marque needsClarification=true e gere UMA pergunta curta.
- Se a intencao for legal_piece, a actionType deve ser gerar_peca_estudio.
- Se a intencao for contract, a actionType deve ser gerar_contrato.
- Se a intencao for system_query, preencha queryType quando possivel.
- Se a intencao for greeting, nao execute nada.
- Use no maximo 5 steps.

Contexto:
- routing.intent=${params.routing.intent}
- routing.recommendedTool=${params.routing.recommendedTool}
- routing.pieceType=${params.routing.pieceType || ""}
- isSocio=${params.isSocio}

Saia APENAS em JSON valido:
{
  "intent": "string",
  "shouldExecuteNow": true,
  "actionType": "string opcional",
  "queryType": "string opcional",
  "needsClarification": false,
  "clarificationQuestion": "string opcional",
  "steps": ["step1", "step2"],
  "summary": "string curta"
}`;
}

export function buildSecretaryPlannerUserPrompt(params: {
  message: string;
  recentHistory: string;
  extractedMediaContext?: string;
}) {
  return `Mensagem atual:
"""${params.message || ""}"""

Historico recente:
"""${params.recentHistory || ""}"""

Conteudo extraido de midia:
"""${params.extractedMediaContext || ""}"""`;
}

export function parseSecretaryPlan(raw: string): SecretaryPlan | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      intent: String(parsed.intent || "unknown"),
      shouldExecuteNow: Boolean(parsed.shouldExecuteNow),
      actionType: parsed.actionType ? String(parsed.actionType) : undefined,
      queryType: parsed.queryType ? String(parsed.queryType) : undefined,
      needsClarification: Boolean(parsed.needsClarification),
      clarificationQuestion: parsed.clarificationQuestion ? String(parsed.clarificationQuestion) : undefined,
      steps: Array.isArray(parsed.steps) ? parsed.steps.map((s: unknown) => String(s)) : [],
      summary: String(parsed.summary || ""),
    };
  } catch {
    return null;
  }
}

export function buildFallbackSecretaryPlan(params: {
  routing: SecretaryInternalRoutingResult;
  message: string;
}): SecretaryPlan {
  const normalized = normalizeForMatch(params.message);

  if (params.routing.intent === "greeting") {
    return {
      intent: "greeting",
      shouldExecuteNow: false,
      needsClarification: false,
      steps: ["respond_greeting"],
      summary: "Saudacao simples sem execucao",
    };
  }

  if (params.routing.intent === "legal_piece") {
    const missingCaseNumber = !/\d{7,}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(params.message) && !/(documentos?|anexos?|pdf|word|docx)/.test(normalized);
    return {
      intent: "legal_piece",
      shouldExecuteNow: !missingCaseNumber,
      actionType: "gerar_peca_estudio",
      needsClarification: missingCaseNumber,
      clarificationQuestion: missingCaseNumber ? "Qual e o numero do processo ou qual documento devo usar como base?" : undefined,
      steps: missingCaseNumber
        ? ["ask_minimum_case_context"]
        : ["collect_sources", "build_brief", "run_studio_piece", "verify_delivery", "respond"],
      summary: missingCaseNumber ? "Peca precisa de contexto minimo" : "Plano de geracao de peca pelo Studio",
    };
  }

  if (params.routing.intent === "contract") {
    const missingFinancials = !/(parcelas?|entrada|valor|r\$|reais|vencimento)/.test(normalized);
    return {
      intent: "contract",
      shouldExecuteNow: !missingFinancials,
      actionType: "gerar_contrato",
      needsClarification: missingFinancials,
      clarificationQuestion: missingFinancials ? "Informe os valores, parcelas e condicoes principais do contrato." : undefined,
      steps: missingFinancials
        ? ["ask_contract_financials"]
        : ["collect_sources", "build_contract_brief", "run_contract_generation", "verify_delivery", "respond"],
      summary: missingFinancials ? "Contrato precisa de dados financeiros minimos" : "Plano de geracao contratual",
    };
  }

  if (params.routing.intent === "web_research") {
    return {
      intent: "web_research",
      shouldExecuteNow: true,
      needsClarification: false,
      steps: ["search_web", "summarize_sources", "respond"],
      summary: "Plano de pesquisa web",
    };
  }

  if (params.routing.intent === "system_query") {
    return {
      intent: "system_query",
      shouldExecuteNow: true,
      needsClarification: false,
      queryType: "relatorio_cliente",
      steps: ["query_system", "respond"],
      summary: "Plano de consulta interna",
    };
  }

  return {
    intent: params.routing.intent,
    shouldExecuteNow: false,
    needsClarification: false,
    steps: ["fallback_response"],
    summary: "Sem plano operacional forte",
  };
}
