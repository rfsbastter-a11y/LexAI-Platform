import { SecretaryActionName } from "./secretaryCapabilities";

export type SecretarySensitivity = "low" | "medium" | "high" | "critical";

export type SecretaryPolicyDecision = {
  capability?: string;
  sensitivity: SecretarySensitivity;
  requiresHumanApproval: boolean;
  auditLevel: "standard" | "elevated";
  reason: string;
};

const actionPolicyMatrix: Record<SecretaryActionName, Omit<SecretaryPolicyDecision, "capability">> = {
  cadastrar_devedor: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "altera cadastro de terceiro" },
  cadastrar_cliente: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "altera cadastro de cliente" },
  atualizar_cliente: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "atualiza dados cadastrais sensiveis" },
  atualizar_devedor: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "atualiza dados cadastrais sensiveis" },
  vincular_processo: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "vincula processo a parte existente" },
  cadastrar_processo: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "cria registro processual" },
  atualizar_processo: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "atualiza registro processual" },
  cadastrar_contrato: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "cria registro contratual" },
  cadastrar_prazo: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "registra prazo operacional" },
  agendar_compromisso: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "agenda compromisso" },
  gerar_relatorio_cliente: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "gera relatorio de cliente" },
  relatorio_devedor: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "gera relatorio de devedor" },
  listar_documentos_devedor: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "consulta documentos de devedor" },
  arquivar_documento: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "arquiva documento recebido" },
  enviar_documento_sistema: { sensitivity: "critical", requiresHumanApproval: true, auditLevel: "elevated", reason: "envio externo de documento sensivel" },
  gerar_contrato: { sensitivity: "critical", requiresHumanApproval: false, auditLevel: "elevated", reason: "gera documento juridico formal" },
  gerar_peca_estudio: { sensitivity: "critical", requiresHumanApproval: false, auditLevel: "elevated", reason: "gera peca juridica formal" },
  gerar_relatorio_executivo: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "consolida dados internos do escritorio" },
};

const genericPolicyMatrix: Record<string, SecretaryPolicyDecision> = {
  resposta_auto: { sensitivity: "low", requiresHumanApproval: false, auditLevel: "standard", reason: "resposta conversacional automatica" },
  resposta_pendente: { sensitivity: "medium", requiresHumanApproval: true, auditLevel: "standard", reason: "mensagem aguardando aprovacao humana" },
  consulta_sistema: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "consulta dados internos" },
  pesquisa_web: { sensitivity: "low", requiresHumanApproval: false, auditLevel: "standard", reason: "pesquisa informacional" },
  erro: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "falha operacional" },
  fora_horario: { sensitivity: "medium", requiresHumanApproval: true, auditLevel: "standard", reason: "mensagem automatica em horario sensivel" },
  falha_midia: { sensitivity: "medium", requiresHumanApproval: true, auditLevel: "elevated", reason: "falha em processamento de midia" },
  acordo_assinado: { sensitivity: "critical", requiresHumanApproval: true, auditLevel: "elevated", reason: "confirmacao de documento juridico assinado" },
  interceptor_frase_proibida: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "resposta bloqueada por compliance" },
  peca_prometida_falhou: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "promessa de peca nao entregue" },
  negociacao_auto: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "negociacao automatica em curso" },
  negociacao_pendente: { sensitivity: "high", requiresHumanApproval: true, auditLevel: "elevated", reason: "negociacao aguardando aprovacao" },
  gerar_peca: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "gera rascunho de peca pelo fluxo legado" },
  agendamento: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "agendamento legado" },
  relatorio: { sensitivity: "medium", requiresHumanApproval: false, auditLevel: "standard", reason: "solicitacao de relatorio legado" },
  urgencia: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "marcacao de urgencia" },
  alerta_negociacao: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "alerta interno de negociacao" },
  auto_cadastro_devedor: { sensitivity: "critical", requiresHumanApproval: false, auditLevel: "elevated", reason: "cadastro automatico a partir de documento" },
  auto_arquivo_documento: { sensitivity: "high", requiresHumanApproval: false, auditLevel: "elevated", reason: "arquivamento automatico de documento" },
};

function extractCapabilityFromActionType(actionType: string): string | undefined {
  if (actionType.startsWith("acao_")) return actionType.replace(/^acao_/, "");
  if (actionType.startsWith("deterministic_")) return actionType.replace(/^deterministic_/, "");
  if (actionPolicyMatrix[actionType as SecretaryActionName]) return actionType;
  return undefined;
}

export function getSecretaryPolicyDecision(actionType: string): SecretaryPolicyDecision {
  const capability = extractCapabilityFromActionType(actionType);
  if (capability && actionPolicyMatrix[capability as SecretaryActionName]) {
    return {
      capability,
      ...actionPolicyMatrix[capability as SecretaryActionName],
    };
  }
  return genericPolicyMatrix[actionType] || {
    sensitivity: "medium",
    requiresHumanApproval: false,
    auditLevel: "standard",
    reason: "evento operacional sem politica especifica",
  };
}

export function requiresSecretaryHumanApproval(actionType: string): boolean {
  return getSecretaryPolicyDecision(actionType).requiresHumanApproval;
}

export function buildSecretaryAuditPayload(params: {
  actionType: string;
  actorType: "socio" | "client" | "unknown";
  pendingAction?: unknown;
  executionMode?: string;
}): Record<string, unknown> {
  const policy = getSecretaryPolicyDecision(params.actionType);
  const pendingAction = (params.pendingAction && typeof params.pendingAction === "object")
    ? { ...(params.pendingAction as Record<string, unknown>) }
    : {};

  return {
    ...pendingAction,
    audit: {
      actorType: params.actorType,
      executionMode: params.executionMode || null,
      policy,
      loggedAt: new Date().toISOString(),
    },
  };
}
