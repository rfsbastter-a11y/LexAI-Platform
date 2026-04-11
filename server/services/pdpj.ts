interface PdpjConfig {
  baseUrl: string;
  ssoTokenUrl: string;
  clientId?: string;
  clientSecret?: string;
  enableRealSubmit: boolean;
  submitPath?: string;
}

interface PdpjDocumentPayload {
  ordem: number;
  nome: string;
  tipo?: string;
  origem?: string;
  textoExtraido?: boolean;
}

interface PdpjIntercorrentePayload {
  schema: string;
  tipoPeticionamento: "INTERCORRENTE";
  numeroProcesso: string | null;
  tribunal: string | null;
  documentoPrincipal: {
    titulo: string;
    formatoOrigem: string;
    obrigatorio: boolean;
  };
  documentos: PdpjDocumentPayload[];
  metadados: Record<string, unknown>;
  pendencias: string[];
}

function getConfig(): PdpjConfig {
  return {
    baseUrl: process.env.PDPJ_PORTAL_BASE_URL || "https://portalexterno-tribunais.stg.pdpj.jus.br",
    ssoTokenUrl: process.env.PDPJ_SSO_TOKEN_URL || "https://sso.stg.cloud.pje.jus.br/auth/realms/pdpj/protocol/openid-connect/token",
    clientId: process.env.PDPJ_CLIENT_ID,
    clientSecret: process.env.PDPJ_CLIENT_SECRET,
    enableRealSubmit: process.env.PDPJ_ENABLE_REAL_SUBMIT === "true",
    submitPath: process.env.PDPJ_INTERCORRENTE_SUBMIT_PATH,
  };
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function buildDefaultPayload(protocolPackage: any): PdpjIntercorrentePayload {
  const protocolData = protocolPackage.protocolData || {};
  const attachments = Array.isArray(protocolPackage.attachments) ? protocolPackage.attachments : [];
  return protocolData.pdpjIntercorrente || {
    schema: "lexai.pdpj.intercorrente.v1",
    tipoPeticionamento: "INTERCORRENTE",
    numeroProcesso: protocolPackage.caseNumber || null,
    tribunal: protocolPackage.court || null,
    documentoPrincipal: {
      titulo: protocolPackage.mainDocumentTitle || protocolPackage.title || "Peticao intercorrente",
      formatoOrigem: "html",
      obrigatorio: true,
    },
    documentos: attachments.map((attachment: any, index: number) => ({
      ordem: index + 1,
      nome: attachment.name,
      tipo: attachment.type || "application/octet-stream",
      origem: attachment.source || "arquivo",
      textoExtraido: !!attachment.hasExtractedText,
    })),
    metadados: {
      classeJudicial: protocolData?.dadosIniciais?.classeJudicial || null,
      assuntoSugerido: protocolData?.assunto?.sugestao || null,
      codigoAssunto: protocolData?.assunto?.codigo || null,
      procurador: protocolData?.procurador || null,
    },
    pendencias: [
      !protocolPackage.caseNumber ? "Informar numero do processo antes do protocolo." : null,
      attachments.length === 0 ? "Conferir se ha anexos obrigatorios para a peticao." : null,
    ].filter(Boolean),
  };
}

async function getServiceToken(config: PdpjConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("PDPJ_CLIENT_ID e PDPJ_CLIENT_SECRET não configurados.");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);

  const response = await fetch(config.ssoTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao autenticar no SSO PDPJ (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("SSO PDPJ não retornou access_token.");
  }
  return data.access_token;
}

export const pdpjService = {
  getConfigStatus() {
    const config = getConfig();
    return {
      baseUrl: config.baseUrl,
      ssoTokenUrl: config.ssoTokenUrl,
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      enableRealSubmit: config.enableRealSubmit,
      hasSubmitPath: !!config.submitPath,
    };
  },

  buildIntercorrentePayload(protocolPackage: any) {
    return buildDefaultPayload(protocolPackage);
  },

  validateIntercorrente(protocolPackage: any) {
    const payload = buildDefaultPayload(protocolPackage);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!payload.numeroProcesso) errors.push("Número do processo é obrigatório para petição intercorrente.");
    if (!protocolPackage.mainDocumentHtml) errors.push("Peça principal não encontrada no pacote.");
    if (!payload.documentoPrincipal?.titulo) errors.push("Título do documento principal é obrigatório.");
    if (!payload.tribunal) warnings.push("Tribunal não informado; pode ser necessário escolher a tramitação manualmente.");
    if (!payload.documentos.length) warnings.push("Nenhum anexo registrado além da peça principal.");
    if (payload.pendencias?.length) warnings.push(...payload.pendencias);

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      payload,
      config: this.getConfigStatus(),
    };
  },

  async submitIntercorrente(protocolPackage: any) {
    const validation = this.validateIntercorrente(protocolPackage);
    const config = getConfig();

    if (!validation.ok) {
      return {
        dryRun: true,
        submitted: false,
        validation,
        message: "Pacote com pendências obrigatórias. Corrija antes de enviar ao PDPJ.",
      };
    }

    if (!config.enableRealSubmit) {
      return {
        dryRun: true,
        submitted: false,
        validation,
        message: "Dry-run PDPJ: payload validado, envio real desativado por PDPJ_ENABLE_REAL_SUBMIT.",
      };
    }

    if (!config.submitPath) {
      throw new Error("PDPJ_INTERCORRENTE_SUBMIT_PATH não configurado. Defina o path após validar o Swagger oficial.");
    }

    const token = await getServiceToken(config);
    const url = `${normalizeBaseUrl(config.baseUrl)}${config.submitPath.startsWith("/") ? config.submitPath : `/${config.submitPath}`}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validation.payload),
    });

    const responseText = await response.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {}

    if (!response.ok) {
      throw new Error(`PDPJ retornou ${response.status}: ${responseText.slice(0, 500)}`);
    }

    return {
      dryRun: false,
      submitted: true,
      validation,
      response: responseBody,
    };
  },

  async getPetitionByProtocol(protocol: string) {
    const config = getConfig();
    const token = await getServiceToken(config);
    const url = `${normalizeBaseUrl(config.baseUrl)}/api/v1/peticoes/por-protocolo/${encodeURIComponent(protocol)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Falha ao consultar petição PDPJ (${response.status}): ${text.slice(0, 300)}`);
    }

    return response.json();
  },
};
