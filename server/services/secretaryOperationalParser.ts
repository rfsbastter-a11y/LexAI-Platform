import { format, addDays } from "date-fns";

export type SecretaryOperationalParseResult = {
  action: string;
  confidence: number;
  args: Record<string, unknown>;
  missingFields: string[];
  risk: "low" | "medium" | "high" | "critical";
  requiresConfirmation: boolean;
  reasoningSummary: string;
};

export function buildSecretaryOperationalParserSystemPrompt(params: {
  currentDate: Date;
  isSocio: boolean;
}) {
  const today = format(params.currentDate, "yyyy-MM-dd");
  const tomorrow = format(addDays(params.currentDate, 1), "yyyy-MM-dd");

  return `Voce e o parser operacional leve da secretaria juridica Marques & Serra.
Sua funcao NAO e responder ao usuario. Sua funcao e converter o pedido em UMA chamada estruturada para executar_acao.

Data de hoje: ${today}
Amanha: ${tomorrow}
isSocio=${params.isSocio}

Escolha action entre:
- contatar_terceiro: falar com outra pessoa por WhatsApp, acompanhar resposta e retornar feedback ao solicitante
- agendar_evento: criar reuniao, audiencia ou compromisso direto na agenda
- atualizar_evento: alterar compromisso existente
- criar_prazo: criar prazo/deadline processual
- criar_fatura: criar fatura/cobranca
- atualizar_fatura: marcar fatura como paga/pendente/vencida ou alterar dados
- criar_contrato: cadastrar contrato operacional/de honorarios no sistema
- gerar_contrato: gerar documento de contrato/acordo/termo no Studio
- cadastrar_cliente, atualizar_cliente, cadastrar_devedor, atualizar_devedor
- cadastrar_processo, atualizar_processo
- gerar_peca_estudio, gerar_relatorio_executivo, gerar_relatorio_cliente

Regras importantes:
- Diferencie "criar/cadastrar contrato de honorarios no sistema" (criar_contrato) de "gerar/redigir contrato/documento/acordo" (gerar_contrato).
- Para "fale com", "mande mensagem", "confirme com", "agende motorista", "veja disponibilidade e me avise", use contatar_terceiro.
- Para datas relativas, converta para YYYY-MM-DD usando hoje/amanha acima.
- Para horarios, use HH:MM.
- Para dinheiro, preserve em amount como string numerica.
- Se faltar telefone ou nome resolvivel do terceiro em contatar_terceiro, inclua missingFields.
- Se faltar cliente/valor/vencimento para fatura, inclua missingFields.
- Clientes nao devem executar acoes de escrita. Se isSocio=false e for acao de escrita, requiresConfirmation=true e missingFields inclua "permissao_socio".
- Retorne apenas JSON valido.

Schema:
{
  "action": "string",
  "confidence": 0.0,
  "args": {
    "acao": "string",
    "clientName": "string opcional",
    "debtorName": "string opcional",
    "targetName": "string opcional",
    "targetPhone": "string opcional",
    "targetMessage": "string opcional",
    "objective": "string opcional",
    "taskType": "agendamento|motorista|recado|cobranca|outro opcional",
    "date": "YYYY-MM-DD opcional",
    "timeStart": "HH:MM opcional",
    "timeEnd": "HH:MM opcional",
    "caseNumber": "string opcional",
    "title": "string opcional",
    "status": "string opcional",
    "amount": "string opcional",
    "dueDate": "YYYY-MM-DD opcional",
    "invoiceNumber": "string opcional",
    "isStrategic": true
  },
  "missingFields": ["string"],
  "risk": "low|medium|high|critical",
  "requiresConfirmation": false,
  "reasoningSummary": "string curta"
}`;
}

export function buildSecretaryOperationalParserUserPrompt(params: {
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

export function parseSecretaryOperationalParseResult(raw: string): SecretaryOperationalParseResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const action = String(parsed.action || parsed.args?.acao || "").trim();
    if (!action) return null;
    return {
      action,
      confidence: Number(parsed.confidence || 0),
      args: parsed.args && typeof parsed.args === "object" ? parsed.args : {},
      missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields.map((f: unknown) => String(f)) : [],
      risk: ["low", "medium", "high", "critical"].includes(parsed.risk) ? parsed.risk : "medium",
      requiresConfirmation: Boolean(parsed.requiresConfirmation),
      reasoningSummary: String(parsed.reasoningSummary || ""),
    };
  } catch {
    return null;
  }
}
