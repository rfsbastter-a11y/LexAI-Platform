import { isSocioRequiredAction } from "./secretaryCapabilities";

export type SecretaryActorContext = {
  isSocio: boolean;
  socioName: string;
  clientId?: number;
  clientName: string;
  isKnownClient: boolean;
};

export function isSocioRole(role?: string | null): boolean {
  return role === "socio" || role === "admin" || role === "advogado";
}

export function deriveSecretaryActorContext(params: {
  senderUser?: { name?: string | null; email?: string | null; role?: string | null } | null;
  client?: { id?: number; name?: string | null } | null;
  contactName?: string;
}): SecretaryActorContext {
  const { senderUser, client, contactName } = params;
  const isSocio = isSocioRole(senderUser?.role);

  return {
    isSocio,
    socioName: isSocio ? (senderUser?.name || senderUser?.email?.split("@")[0] || contactName || "") : "",
    clientId: client?.id,
    clientName: client?.name || "",
    isKnownClient: !!client,
  };
}

export function canActorExecuteSecretaryAction(action: string, isSocio: boolean): boolean {
  if (isSocioRequiredAction(action)) return isSocio;
  return true;
}

function stripProfessionalPrefix(name: string): string {
  return (name || "")
    .replace(/^(dr|dra|doutor|doutora)\.?\s+/i, "")
    .trim();
}

export function isGreetingOnlyMessage(message: string): boolean {
  return /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eai|alô|hello|hey|oi oi|olá!|oi!)[\s!?.]*$/i.test((message || "").trim());
}

export function isExplicitResumeRequest(message: string): boolean {
  return /(retome|retomar|continue|continuar|pode continuar|pode retomar|tente novamente|gere novamente|reenvie a peça|reenvie o documento)/i.test((message || "").trim());
}

export function buildPendingActionResumeMessage(params: {
  socioName: string;
  label?: string;
}): string {
  const cleanSocioName = stripProfessionalPrefix(params.socioName);
  const drName = cleanSocioName ? `Dr. ${cleanSocioName.split(" ")[0]}` : "Doutor";
  return `Olá, ${drName}! Estava tentando gerar ${params.label || "uma peça jurídica"} que o senhor pediu — quer que eu tente novamente?`;
}

export function formatDeterministicSocioReply(
  body: string,
  action: string,
  isFirstMessage: boolean,
  originalMessage: string,
  socioName: string,
): string {
  const cleanBody = (body || "").trim();
  if (!cleanBody) return cleanBody;

  const cleanSocioName = stripProfessionalPrefix(socioName);
  const firstName = cleanSocioName ? cleanSocioName.split(" ")[0] : "";
  const drTitle = firstName ? `Dr. ${firstName}` : "Doutor";
  const greetedInUserMessage = /^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/i.test((originalMessage || "").trim());

  let intro = "";
  if (isFirstMessage || greetedInUserMessage) {
    if (/^preciso\b/i.test(cleanBody) || /^n[aã]o consegui/i.test(cleanBody) || /^n[ãa]o foi poss[ií]vel/i.test(cleanBody)) {
      intro = `Olá, ${drTitle}! Aqui é do escritório Marques & Serra Sociedade de Advogados. `;
    } else if (action === "gerar_relatorio_executivo") {
      intro = `Olá, ${drTitle}! Aqui é do escritório Marques & Serra Sociedade de Advogados. Segue o relatório executivo de hoje.\n\n`;
    } else {
      intro = `Olá, ${drTitle}! Aqui é do escritório Marques & Serra Sociedade de Advogados. `;
    }
  }

  if (/^preciso\b/i.test(cleanBody)) {
    return `${intro}${cleanBody}`;
  }

  if (action === "gerar_relatorio_executivo") {
    return `${intro}${cleanBody}`;
  }

  return `${intro}${cleanBody}`.trim();
}
