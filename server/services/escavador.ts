import { storage } from "../storage";
import type { InsertCaseMovement } from "@shared/schema";

const ESCAVADOR_V2_BASE = "https://api.escavador.com/api/v2";
const ESCAVADOR_V1_BASE = "https://api.escavador.com/api/v1";

interface EscavadorFonte {
  id: number;
  processo_fonte_id: number;
  nome: string;
  tipo: string;
  sigla: string;
  grau: number;
  grau_formatado: string;
  capa?: EscavadorCapa;
}

interface EscavadorCapa {
  classe?: string;
  assunto?: string;
  area?: string;
  orgao_julgador?: string;
  valor_causa?: { valor: number; moeda: string };
  data_distribuicao?: string;
  data_arquivamento?: string;
  informacoes_complementares?: Array<{ tipo: string; valor: string }>;
}

interface EscavadorEnvolvido {
  nome: string;
  tipo_pessoa?: string;
  polo?: string;
  tipo?: string;
  quantidade_processos?: number;
  oabs?: Array<{ numero: string; uf: string }>;
}

interface EscavadorMovimentacao {
  id: number;
  data: string;
  tipo?: string;
  conteudo: string;
  fonte?: { nome: string; sigla: string; tipo: string; grau: number };
}

interface EscavadorProcesso {
  id: number;
  numero_cnj: string;
  data_inicio?: string;
  data_ultima_movimentacao?: string;
  quantidade_movimentacoes?: number;
  fontes_tribunal_url?: string[];
  fontes?: EscavadorFonte[];
  titulo_polo_ativo?: string;
  titulo_polo_passivo?: string;
}

interface EscavadorSearchResult {
  items?: EscavadorProcesso[];
  paginator?: {
    total: number;
    total_pages: number;
    current_page: number;
    per_page: number;
  };
  links?: { next: string | null; prev: string | null };
}

interface EscavadorEnvolvidoResult {
  nome: string;
  tipo_pessoa?: string;
  quantidade_processos?: number;
  processos?: EscavadorProcesso[];
  paginator?: {
    total: number;
    total_pages: number;
    current_page: number;
  };
}

export class EscavadorService {
  private rateLimitDelay = 200;
  private lastRequestTime = 0;

  private getToken(): string {
    const token = process.env.ESCAVADOR_API_KEY?.trim();
    if (!token) {
      throw new Error("ESCAVADOR_API_KEY not configured");
    }
    if (token.length > 1500) {
      console.warn(`[Escavador] AVISO: Token muito longo (${token.length} chars). Verifique o secret ESCAVADOR_API_KEY.`);
    }
    return token;
  }

  isConfigured(): boolean {
    return !!process.env.ESCAVADOR_API_KEY;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async request(url: string, method: string = "GET", body?: any): Promise<any> {
    await this.enforceRateLimit();

    const token = this.getToken();
    const tokenPreview = token.length > 8 ? `${token.substring(0, 4)}...${token.substring(token.length - 4)} (${token.length} chars)` : `SET (${token.length} chars)`;
    console.log(`[Escavador] ${method} ${url} [token: ${tokenPreview}]`);

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json",
      "Accept-Charset": "utf-8",
    };

    if (body) {
      headers["Content-Type"] = "application/json; charset=utf-8";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const creditsUsed = response.headers.get("Creditos-Utilizados");
    if (creditsUsed) {
      console.log(`[Escavador] Credits used: ${creditsUsed} centavos`);
    }

    const rawBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("Content-Type") || "";
    let textBody: string;
    if (contentType.toLowerCase().includes("latin") || contentType.toLowerCase().includes("iso-8859")) {
      textBody = new TextDecoder("iso-8859-1").decode(rawBuffer);
    } else {
      textBody = new TextDecoder("utf-8").decode(rawBuffer);
      if (textBody.includes("�") || textBody.includes("?VEL") || textBody.includes("?LIA") || textBody.includes("?RF")) {
        textBody = new TextDecoder("iso-8859-1").decode(rawBuffer);
      }
    }

    if (!response.ok) {
      console.log(`[Escavador] API response ${response.status}: ${textBody.substring(0, 300)}`);
      if (response.status === 402) {
        throw new Error("Saldo insuficiente na API do Escavador");
      }
      if (response.status === 401) {
        throw new Error("Token do Escavador inválido ou expirado");
      }
      if (response.status === 422) {
        try {
          const parsed = JSON.parse(textBody);
          return { _escavadorError: true, status: 422, message: parsed.message, appends: parsed.appends };
        } catch {
          throw new Error("Processo já está sendo atualizado. Aguarde a conclusão.");
        }
      }
      if (response.status === 429) {
        throw new Error("Limite de requisições do Escavador excedido. Tente novamente em breve.");
      }
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Escavador API error: ${response.status}`);
    }

    return JSON.parse(textBody);
  }

  async searchByProcessNumber(caseNumber: string): Promise<EscavadorProcesso | null> {
    const formatted = this.formatCNJ(caseNumber);
    const data = await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}`);
    return data || null;
  }

  async getMovements(caseNumber: string, page: number = 1): Promise<{ movimentacoes: EscavadorMovimentacao[]; total: number }> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      const data = await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/movimentacoes?pagina=${page}`);
      return {
        movimentacoes: data?.items || [],
        total: data?.paginator?.total || 0,
      };
    } catch (error: any) {
      console.error("[Escavador] Error fetching movements:", error.message);
      return { movimentacoes: [], total: 0 };
    }
  }

  async searchByNameOrDocument(query: string, page: number = 1): Promise<EscavadorEnvolvidoResult | null> {
    const cleanQuery = query.trim();
    const cleanDigits = cleanQuery.replace(/\D/g, "");

    const isCNJ = cleanDigits.length === 20 || /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(cleanQuery);
    if (isCNJ) {
      console.log(`[Escavador] Detected CNJ number in person search, redirecting to process search: ${cleanQuery}`);
      const processResult = await this.searchByProcessNumber(cleanQuery);
      if (processResult) {
        return { items: [processResult], paginator: { total: 1, current_page: 1, last_page: 1 } } as any;
      }
      return null;
    }

    const isDocument = cleanDigits.length >= 11 && cleanDigits.length <= 14;

    let url: string;
    if (isDocument) {
      url = `${ESCAVADOR_V2_BASE}/processos/envolvido?cpf_cnpj=${encodeURIComponent(cleanDigits)}&pagina=${page}`;
    } else {
      url = `${ESCAVADOR_V2_BASE}/processos/envolvido?nome=${encodeURIComponent(cleanQuery)}&pagina=${page}`;
    }

    const data = await this.request(url);
    return data || null;
  }

  async searchByOAB(oabNumber: string, oabState: string = "DF", page: number = 1): Promise<EscavadorEnvolvidoResult | null> {
    const cleanOAB = oabNumber.replace(/\D/g, "");
    const url = `${ESCAVADOR_V2_BASE}/processos/oab/${encodeURIComponent(cleanOAB)}?estado=${encodeURIComponent(oabState.toUpperCase())}&pagina=${page}`;
    const data = await this.request(url);
    return data || null;
  }

  async getEnvolvidos(caseNumber: string): Promise<EscavadorEnvolvido[]> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      const data = await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/envolvidos`);
      return data?.items || [];
    } catch (error: any) {
      console.error("[Escavador] Error fetching envolvidos:", error.message);
      return [];
    }
  }

  async getAvailableTribunais(): Promise<any[]> {
    try {
      const data = await this.request(`${ESCAVADOR_V2_BASE}/tribunais`);
      return data?.items || [];
    } catch (error: any) {
      console.error("[Escavador] Error fetching tribunais:", error.message);
      return [];
    }
  }

  private async requestBinary(url: string): Promise<Buffer | null> {
    await this.enforceRateLimit();

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.getToken()}`,
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/octet-stream",
    };

    const response = await fetch(url, { method: "GET", headers });

    const creditsUsed = response.headers.get("Creditos-Utilizados");
    if (creditsUsed) {
      console.log(`[Escavador] Credits used: ${creditsUsed} centavos`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      if (response.status !== 404) {
        console.error(`[Escavador] API error ${response.status}: ${errorText}`);
      }
      if (response.status === 402) {
        throw new Error("Saldo insuficiente na API do Escavador");
      }
      if (response.status === 401) {
        throw new Error("Token do Escavador inválido ou expirado");
      }
      if (response.status === 429) {
        throw new Error("Limite de requisições do Escavador excedido. Tente novamente em breve.");
      }
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Escavador API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async requestProcessUpdate(caseNumber: string, options?: { baixarDocumentosPublicos?: boolean; baixarAutos?: boolean }): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      const body: any = {};
      if (options?.baixarDocumentosPublicos) body.documentos_publicos = 1;
      if (options?.baixarAutos) body.autos = 1;
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/solicitar-atualizacao`, "POST", Object.keys(body).length > 0 ? body : undefined);
    } catch (error: any) {
      console.error("[Escavador] Error requesting process update:", error.message);
      throw error;
    }
  }

  async getUpdateStatus(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/status-atualizacao`);
    } catch (error: any) {
      console.error("[Escavador] Error getting update status:", error.message);
      throw error;
    }
  }

  async getPublicDocuments(caseNumber: string, page: number = 1): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/documentos-publicos?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error fetching public documents:", error.message);
      throw error;
    }
  }

  async getProcessAutos(caseNumber: string, page: number = 1): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/autos?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error fetching process autos:", error.message);
      throw error;
    }
  }

  async downloadDocument(documentId: number): Promise<Buffer | null> {
    try {
      return await this.requestBinary(`${ESCAVADOR_V2_BASE}/processos/documentos/${documentId}/download`);
    } catch (error: any) {
      console.error("[Escavador] Error downloading document:", error.message);
      throw error;
    }
  }

  async requestAISummary(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/resumo-inteligente/solicitar`, "POST");
    } catch (error: any) {
      console.error("[Escavador] Error requesting AI summary:", error.message);
      throw error;
    }
  }

  async getAISummary(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/resumo-inteligente`);
    } catch (error: any) {
      console.error("[Escavador] Error fetching AI summary:", error.message);
      throw error;
    }
  }

  async getAISummaryStatus(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/processos/numero_cnj/${encodeURIComponent(formatted)}/resumo-inteligente/status`);
    } catch (error: any) {
      console.error("[Escavador] Error fetching AI summary status:", error.message);
      throw error;
    }
  }

  async createProcessMonitoring(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-processos`, "POST", { numero_cnj: formatted });
    } catch (error: any) {
      console.error("[Escavador] Error creating process monitoring:", error.message);
      throw error;
    }
  }

  async listProcessMonitorings(page: number = 1): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-processos?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error listing process monitorings:", error.message);
      throw error;
    }
  }

  async getProcessMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-processos/${id}`);
    } catch (error: any) {
      console.error("[Escavador] Error getting process monitoring:", error.message);
      throw error;
    }
  }

  async removeProcessMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-processos/${id}`, "DELETE");
    } catch (error: any) {
      console.error("[Escavador] Error removing process monitoring:", error.message);
      throw error;
    }
  }

  async createNewProcessMonitoring(data: { tipo_pessoa: string; valor: string; nome?: string }): Promise<any> {
    try {
      const body: any = { tipo_pessoa: data.tipo_pessoa, valor: data.valor };
      if (data.nome) body.nome = data.nome;
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-novos-processos`, "POST", body);
    } catch (error: any) {
      console.error("[Escavador] Error creating new process monitoring:", error.message);
      throw error;
    }
  }

  async listNewProcessMonitorings(page: number = 1): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-novos-processos?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error listing new process monitorings:", error.message);
      throw error;
    }
  }

  async getNewProcessMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-novos-processos/${id}`);
    } catch (error: any) {
      console.error("[Escavador] Error getting new process monitoring:", error.message);
      throw error;
    }
  }

  async removeNewProcessMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-novos-processos/${id}`, "DELETE");
    } catch (error: any) {
      console.error("[Escavador] Error removing new process monitoring:", error.message);
      throw error;
    }
  }

  async listNewProcessMonitoringResults(id: number, page: number = 1): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V2_BASE}/monitoramentos-novos-processos/${id}/processos?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error listing new process monitoring results:", error.message);
      throw error;
    }
  }

  async searchProcessOnTribunal(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V1_BASE}/processos/tribunal`, "POST", { numero_unico: formatted });
    } catch (error: any) {
      console.error("[Escavador] Error searching process on tribunal:", error.message);
      throw error;
    }
  }

  async getAsyncSearchResult(buscaId: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/buscas-assincronas/${buscaId}`);
    } catch (error: any) {
      console.error("[Escavador] Error getting async search result:", error.message);
      throw error;
    }
  }

  async createTribunalMonitoring(caseNumber: string): Promise<any> {
    try {
      const formatted = this.formatCNJ(caseNumber);
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-tribunal`, "POST", { numero_unico: formatted });
    } catch (error: any) {
      console.error("[Escavador] Error creating tribunal monitoring:", error.message);
      throw error;
    }
  }

  async listTribunalMonitorings(page: number = 1): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-tribunal?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error listing tribunal monitorings:", error.message);
      throw error;
    }
  }

  async getTribunalMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-tribunal/${id}`);
    } catch (error: any) {
      console.error("[Escavador] Error getting tribunal monitoring:", error.message);
      throw error;
    }
  }

  async removeTribunalMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-tribunal/${id}`, "DELETE");
    } catch (error: any) {
      console.error("[Escavador] Error removing tribunal monitoring:", error.message);
      throw error;
    }
  }

  async createDiarioMonitoring(data: { termo: string; origens?: number[] }): Promise<any> {
    try {
      const body: any = { termo_monitorado: data.termo };
      if (data.origens && data.origens.length > 0) body.origens_ids = data.origens;
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-diarios`, "POST", body);
    } catch (error: any) {
      console.error("[Escavador] Error creating diario monitoring:", error.message);
      throw error;
    }
  }

  async listDiarioMonitorings(page: number = 1): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-diarios?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error listing diario monitorings:", error.message);
      throw error;
    }
  }

  async getDiarioMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-diarios/${id}`);
    } catch (error: any) {
      console.error("[Escavador] Error getting diario monitoring:", error.message);
      throw error;
    }
  }

  async removeDiarioMonitoring(id: number): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-diarios/${id}`, "DELETE");
    } catch (error: any) {
      console.error("[Escavador] Error removing diario monitoring:", error.message);
      throw error;
    }
  }

  async getDiarioAppearances(monitoringId: number, page: number = 1): Promise<any> {
    try {
      return await this.request(`${ESCAVADOR_V1_BASE}/monitoramentos-diarios/${monitoringId}/aparicoes?pagina=${page}`);
    } catch (error: any) {
      console.error("[Escavador] Error fetching diario appearances:", error.message);
      throw error;
    }
  }

  async checkBalance(): Promise<{ saldo: number } | null> {
    try {
      const data = await this.request(`${ESCAVADOR_V1_BASE}/creditos`);
      return data || null;
    } catch (error: any) {
      console.error("[Escavador] Error checking balance:", error.message);
      return null;
    }
  }

  normalizeCNJ(caseNumber: string): string {
    return caseNumber.replace(/\D/g, "");
  }

  async importProcessToCase(caseId: number, processData: EscavadorProcesso): Promise<{ movementsImported: number }> {
    let movementsImported = 0;

    const { movimentacoes } = await this.getMovements(processData.numero_cnj);

    if (movimentacoes.length > 0) {
      const existingMovements = await storage.getCaseMovements(caseId);
      const existingDescs = new Set(existingMovements.map(m => `${m.date}-${m.description}`.substring(0, 100)));

      const newMovements: InsertCaseMovement[] = [];
      for (const mov of movimentacoes) {
        const key = `${new Date(mov.data).toISOString()}-${mov.conteudo}`.substring(0, 100);
        if (existingDescs.has(key)) continue;

        newMovements.push({
          caseId,
          date: new Date(mov.data),
          type: this.classifyMovementType(mov.conteudo),
          description: mov.conteudo.substring(0, 500),
          teor: mov.conteudo,
          source: "Escavador",
          datajudCode: mov.id?.toString(),
          datajudPayload: mov as any,
          requiresAction: this.requiresAction(mov.conteudo),
        });
      }

      if (newMovements.length > 0) {
        await storage.createCaseMovements(newMovements);
        movementsImported = newMovements.length;
      }
    }

    const fonte = processData.fontes?.[0];
    const capa = fonte?.capa;

    const updateData: any = {
      datajudLastSync: new Date(),
    };

    if (processData.titulo_polo_ativo) {
      updateData.autor = processData.titulo_polo_ativo;
    }
    if (processData.titulo_polo_passivo) {
      updateData.reu = processData.titulo_polo_passivo;
    }

    if (!updateData.autor || !updateData.reu) {
      try {
        const envolvidos = await this.getEnvolvidos(processData.numero_cnj);
        if (envolvidos.length > 0) {
          const ativos = envolvidos.filter(e => e.polo?.toLowerCase() === "ativo" && e.tipo?.toLowerCase() !== "advogado");
          const passivos = envolvidos.filter(e => e.polo?.toLowerCase() === "passivo" && e.tipo?.toLowerCase() !== "advogado");
          if (!updateData.autor && ativos.length > 0) {
            updateData.autor = ativos.map(e => e.nome).join(", ");
          }
          if (!updateData.reu && passivos.length > 0) {
            updateData.reu = passivos.map(e => e.nome).join(", ");
          }
        }
      } catch (err: any) {
        console.log("[Escavador] Could not fetch envolvidos for autor/reu:", err.message);
      }
    }

    const existingCase = await storage.getCase(caseId);
    if ((!updateData.autor || !updateData.reu) && existingCase?.title) {
      const parts = existingCase.title.split(/\s+x\s+/i);
      if (parts.length >= 2) {
        if (!updateData.autor) updateData.autor = parts[0].trim();
        if (!updateData.reu) updateData.reu = parts.slice(1).join(" x ").trim();
      }
    }
    if (capa?.classe) updateData.classeNome = capa.classe;
    if (capa?.assunto) updateData.subject = capa.assunto;
    if (capa?.orgao_julgador) updateData.vara = capa.orgao_julgador;
    if (capa?.valor_causa?.valor) updateData.valorCausa = capa.valor_causa.valor.toString();

    await storage.updateCase(caseId, updateData);

    return { movementsImported };
  }

  private formatCNJ(caseNumber: string): string {
    const digits = caseNumber.replace(/\D/g, "");
    if (digits.length === 20) {
      return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
    }
    return caseNumber;
  }

  private classifyMovementType(content: string): string {
    const lower = content.toLowerCase();
    if (lower.includes("intimação") || lower.includes("intimacao") || lower.includes("intimado") || lower.includes("intimada")) return "Intimação";
    if (lower.includes("sentença") || lower.includes("sentenca")) return "Sentença";
    if (lower.includes("decisão") || lower.includes("decisao") || lower.includes("despacho")) return "Decisão";
    if (lower.includes("audiência") || lower.includes("audiencia")) return "Audiência";
    if (lower.includes("petição") || lower.includes("peticao") || lower.includes("juntada")) return "Juntada";
    return "Movimentação";
  }

  private requiresAction(content: string): boolean {
    const lower = content.toLowerCase();
    return lower.includes("intimação") ||
      lower.includes("intimacao") ||
      lower.includes("citação") ||
      lower.includes("citacao") ||
      lower.includes("prazo") ||
      lower.includes("intimado") ||
      lower.includes("intimada") ||
      lower.includes("oportunizo") ||
      lower.includes("oportunizando");
  }
}

export const escavadorService = new EscavadorService();
