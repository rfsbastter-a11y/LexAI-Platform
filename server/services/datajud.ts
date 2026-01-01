import { createHash } from "crypto";
import { storage } from "../storage";
import type { InsertCaseMovement } from "@shared/schema";
import { TRIBUNAIS_REGISTRY, parseCaseNumber, getTribunalBySigla, getAllTribunais, type TribunalInfo } from "./datajudRegistry";

interface DatajudMovement {
  data: string;
  nome: string;
  codigo?: string;
  complemento?: string;
}

interface DatajudProcess {
  numeroProcesso: string;
  classe?: { codigo: number; nome: string };
  orgaoJulgador?: { nome: string; codigoMunicipioIBGE?: number };
  assuntos?: Array<{ codigo: number; nome: string }>;
  dataAjuizamento?: string;
  movimentos?: DatajudMovement[];
  siglaTribunal?: string;
  grau?: string;
}

interface DatajudSearchResult {
  hits?: {
    hits?: Array<{
      _source: DatajudProcess;
    }>;
    total?: { value: number };
  };
}

const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";

function formatCaseNumber(caseNumber: string): string {
  return caseNumber.replace(/\D/g, "");
}

function getApiKey(): string {
  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) {
    throw new Error("DATAJUD_API_KEY not configured. Please add it to secrets.");
  }
  return apiKey;
}

export class DatajudService {
  private rateLimitDelay = 1000;
  private lastRequestTime = 0;

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  getAllTribunais(): TribunalInfo[] {
    return getAllTribunais();
  }

  getTribunaisBySegmento(segmento: string): TribunalInfo[] {
    return TRIBUNAIS_REGISTRY.filter(t => t.segmento === segmento);
  }

  async searchByProcessNumber(caseNumber: string): Promise<DatajudProcess | null> {
    await this.enforceRateLimit();

    const parsed = parseCaseNumber(caseNumber);
    let tribunal: TribunalInfo | undefined;

    if (parsed?.tribunal) {
      tribunal = parsed.tribunal;
    } else {
      console.log("Could not parse tribunal from case number, will try fallback search:", caseNumber);
    }

    if (tribunal) {
      const result = await this.searchInTribunal(caseNumber, tribunal);
      if (result) return result;
    }

    console.log("Tribunal-specific search failed or not found, trying fallback multi-tribunal search");
    return this.searchAllTribunals(caseNumber);
  }

  private async searchInTribunal(caseNumber: string, tribunal: TribunalInfo): Promise<DatajudProcess | null> {
    const formattedNumber = formatCaseNumber(caseNumber);
    const url = `${DATAJUD_BASE_URL}/${tribunal.endpoint}/_search`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": getApiKey(),
        },
        body: JSON.stringify({
          query: {
            match: {
              numeroProcesso: formattedNumber,
            },
          },
        }),
      });

      if (!response.ok) {
        console.error(`DataJud API error for ${tribunal.sigla}:`, response.status);
        return null;
      }

      const data: DatajudSearchResult = await response.json();
      const hits = data.hits?.hits;
      
      if (!hits || hits.length === 0) {
        return null;
      }

      return hits[0]._source;
    } catch (error) {
      console.error(`Error fetching from DataJud (${tribunal.sigla}):`, error);
      return null;
    }
  }

  private async searchAllTribunals(caseNumber: string): Promise<DatajudProcess | null> {
    const formattedNumber = formatCaseNumber(caseNumber);
    const mainTribunals = TRIBUNAIS_REGISTRY.filter(t => 
      t.segmento === "estadual" || t.segmento === "federal" || t.segmento === "trabalho"
    );

    for (const tribunal of mainTribunals) {
      await this.enforceRateLimit();
      const result = await this.searchInTribunal(caseNumber, tribunal);
      if (result) {
        console.log(`Found case in ${tribunal.sigla} via fallback search`);
        return result;
      }
    }

    return null;
  }

  async searchByDocument(document: string, segmentos?: string[]): Promise<DatajudProcess[]> {
    const cleanDoc = document.replace(/\D/g, "");
    const results: DatajudProcess[] = [];

    let tribunais = TRIBUNAIS_REGISTRY;
    if (segmentos && segmentos.length > 0) {
      tribunais = TRIBUNAIS_REGISTRY.filter(t => segmentos.includes(t.segmento));
    }

    for (const tribunal of tribunais) {
      await this.enforceRateLimit();
      try {
        const url = `${DATAJUD_BASE_URL}/${tribunal.endpoint}/_search`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": getApiKey(),
          },
          body: JSON.stringify({
            query: {
              match: {
                "partes.cpfCnpj": cleanDoc,
              },
            },
            size: 10,
          }),
        });

        if (response.ok) {
          const data: DatajudSearchResult = await response.json();
          const hits = data.hits?.hits || [];
          results.push(...hits.map(h => h._source));
        }
      } catch (error) {
        console.error(`Error searching ${tribunal.sigla}:`, error);
      }
    }

    return results;
  }

  async searchByTribunal(tribunalSigla: string, query: Record<string, any>): Promise<DatajudProcess[]> {
    await this.enforceRateLimit();

    const tribunal = getTribunalBySigla(tribunalSigla);
    if (!tribunal) {
      console.error("Tribunal not found:", tribunalSigla);
      return [];
    }

    try {
      const url = `${DATAJUD_BASE_URL}/${tribunal.endpoint}/_search`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": getApiKey(),
        },
        body: JSON.stringify({
          query,
          size: 100,
        }),
      });

      if (!response.ok) {
        console.error(`DataJud API error for ${tribunal.sigla}:`, response.status);
        return [];
      }

      const data: DatajudSearchResult = await response.json();
      return (data.hits?.hits || []).map(h => h._source);
    } catch (error) {
      console.error(`Error searching ${tribunal.sigla}:`, error);
      return [];
    }
  }

  async importProcess(caseId: number, processData: DatajudProcess): Promise<void> {
    const movements: InsertCaseMovement[] = (processData.movimentos || []).map(mov => ({
      caseId,
      date: new Date(mov.data),
      type: this.classifyMovementType(mov.nome),
      description: mov.complemento ? `${mov.nome}: ${mov.complemento}` : mov.nome,
      source: "DataJud",
      datajudCode: mov.codigo,
      datajudPayload: mov as any,
      requiresAction: this.requiresAction(mov.nome),
    }));

    if (movements.length > 0) {
      await storage.createCaseMovements(movements);
    }

    const payloadHash = createHash("sha256").update(JSON.stringify(processData)).digest("hex");
    
    await storage.updateCase(caseId, {
      datajudLastSync: new Date(),
      datajudPayloadHash: payloadHash,
      caseClass: processData.classe?.nome,
      subject: processData.assuntos?.[0]?.nome,
    });

    const tribunalInfo = getTribunalBySigla(processData.siglaTribunal || "");
    await storage.createDatajudSyncLog({
      caseId,
      endpoint: tribunalInfo?.endpoint || "unknown",
      tribunal: processData.siglaTribunal || "unknown",
      requestPayload: { numeroProcesso: processData.numeroProcesso },
      responsePayloadHash: payloadHash,
      status: "success",
      movementsFound: movements.length,
    });
  }

  private classifyMovementType(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("intimação") || lower.includes("intimacao")) return "Intimação";
    if (lower.includes("sentença") || lower.includes("sentenca")) return "Sentença";
    if (lower.includes("decisão") || lower.includes("decisao") || lower.includes("despacho")) return "Decisão";
    if (lower.includes("audiência") || lower.includes("audiencia")) return "Audiência";
    if (lower.includes("petição") || lower.includes("peticao") || lower.includes("juntada")) return "Juntada";
    return "Movimentação";
  }

  private requiresAction(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.includes("intimação") || 
           lower.includes("intimacao") || 
           lower.includes("citação") || 
           lower.includes("citacao") ||
           lower.includes("prazo");
  }
}

export const datajudService = new DatajudService();
