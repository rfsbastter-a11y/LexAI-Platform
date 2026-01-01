import { createHash } from "crypto";
import { storage } from "../storage";
import type { InsertCaseMovement } from "@shared/schema";

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
  };
}

const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";

const TRIBUNAL_ENDPOINTS: Record<string, string> = {
  "TJSP": "api_publica_tjsp",
  "TJMG": "api_publica_tjmg",
  "TJRJ": "api_publica_tjrj",
  "TJRS": "api_publica_tjrs",
  "TJPR": "api_publica_tjpr",
  "TRT1": "api_publica_trt1",
  "TRT2": "api_publica_trt2",
  "TRT3": "api_publica_trt3",
  "TRF1": "api_publica_trf1",
  "TRF3": "api_publica_trf3",
  "STJ": "api_publica_stj",
  "STF": "api_publica_stf",
};

function extractTribunalFromCaseNumber(caseNumber: string): string | null {
  const match = caseNumber.match(/\d{7}-\d{2}\.\d{4}\.(\d)\.\d{2}\.\d{4}/);
  if (!match) return null;
  
  const justicaCode = match[1];
  const segmentoMatch = caseNumber.match(/\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}/);
  const segmento = segmentoMatch ? segmentoMatch[1] : "";

  if (justicaCode === "8") {
    const tribunalMap: Record<string, string> = {
      "26": "TJSP", "13": "TJMG", "19": "TJRJ", "21": "TJRS", "16": "TJPR"
    };
    return tribunalMap[segmento] || "TJSP";
  } else if (justicaCode === "5") {
    return `TRT${segmento}`;
  } else if (justicaCode === "4") {
    return `TRF${segmento}`;
  }
  
  return null;
}

function formatCaseNumber(caseNumber: string): string {
  return caseNumber.replace(/\D/g, "");
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

  async searchByProcessNumber(caseNumber: string): Promise<DatajudProcess | null> {
    await this.enforceRateLimit();

    const tribunal = extractTribunalFromCaseNumber(caseNumber);
    if (!tribunal) {
      console.error("Could not extract tribunal from case number:", caseNumber);
      return null;
    }

    const endpoint = TRIBUNAL_ENDPOINTS[tribunal];
    if (!endpoint) {
      console.error("No endpoint configured for tribunal:", tribunal);
      return null;
    }

    const formattedNumber = formatCaseNumber(caseNumber);
    const url = `${DATAJUD_BASE_URL}/${endpoint}/_search`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `APIKey ${process.env.DATAJUD_API_KEY || "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="}`,
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
        console.error("DataJud API error:", response.status, await response.text());
        return null;
      }

      const data: DatajudSearchResult = await response.json();
      const hits = data.hits?.hits;
      
      if (!hits || hits.length === 0) {
        return null;
      }

      return hits[0]._source;
    } catch (error) {
      console.error("Error fetching from DataJud:", error);
      return null;
    }
  }

  async searchByDocument(document: string): Promise<DatajudProcess[]> {
    await this.enforceRateLimit();

    const cleanDoc = document.replace(/\D/g, "");
    const results: DatajudProcess[] = [];

    for (const [tribunal, endpoint] of Object.entries(TRIBUNAL_ENDPOINTS)) {
      try {
        const url = `${DATAJUD_BASE_URL}/${endpoint}/_search`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `APIKey ${process.env.DATAJUD_API_KEY || "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="}`,
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
        
        await this.enforceRateLimit();
      } catch (error) {
        console.error(`Error searching ${tribunal}:`, error);
      }
    }

    return results;
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

    await storage.createDatajudSyncLog({
      caseId,
      endpoint: TRIBUNAL_ENDPOINTS[processData.siglaTribunal || ""] || "unknown",
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
