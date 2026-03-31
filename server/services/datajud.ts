import { createHash } from "crypto";
import { storage } from "../storage";
import type { InsertCaseMovement } from "@shared/schema";
import { TRIBUNAIS_REGISTRY, parseCaseNumber, getTribunalBySigla, getAllTribunais, type TribunalInfo } from "./datajudRegistry";

interface DatajudMovement {
  dataHora: string;
  nome: string;
  codigo?: number;
  complementosTabelados?: Array<{
    codigo: number;
    valor: number;
    nome: string;
    descricao: string;
  }>;
}

interface DatajudParte {
  nome?: string;
  tipoParte?: string;
  polo?: string;
  cpfCnpj?: string;
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
  partes?: DatajudParte[];
  valorCausa?: number;
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

function getAuthHeader(): string {
  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) {
    throw new Error("DATAJUD_API_KEY not configured. Please add it to secrets.");
  }
  if (apiKey.startsWith("APIKey ")) {
    return apiKey;
  }
  return `APIKey ${apiKey}`;
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
          "Authorization": getAuthHeader(),
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
    } else {
      tribunais = TRIBUNAIS_REGISTRY.filter(t => 
        t.segmento === "estadual" || t.segmento === "trabalho" || t.segmento === "federal"
      );
    }

    const BATCH_SIZE = 5;
    for (let i = 0; i < tribunais.length; i += BATCH_SIZE) {
      const batch = tribunais.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (tribunal) => {
          try {
            const url = `${DATAJUD_BASE_URL}/${tribunal.endpoint}/_search`;
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": getAuthHeader(),
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
              return (data.hits?.hits || []).map(h => h._source);
            }
            return [];
          } catch (error) {
            console.error(`Error searching ${tribunal.sigla}:`, error);
            return [];
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(...result.value);
        }
      }

      if (i + BATCH_SIZE < tribunais.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
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
          "Authorization": getAuthHeader(),
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

  extractPartes(partes: DatajudParte[] = []): { autor: string; reu: string } {
    const autores: string[] = [];
    const reus: string[] = [];
    
    for (const parte of partes) {
      if (!parte.nome) continue;
      const polo = (parte.polo || parte.tipoParte || "").toLowerCase();
      if (polo.includes("ativo") || polo.includes("autor") || polo.includes("requerente") || polo.includes("reclamante") || polo.includes("exequente")) {
        autores.push(parte.nome);
      } else if (polo.includes("passivo") || polo.includes("réu") || polo.includes("reu") || polo.includes("requerido") || polo.includes("reclamado") || polo.includes("executado")) {
        reus.push(parte.nome);
      }
    }
    
    return {
      autor: autores.join(", ") || "Não informado",
      reu: reus.join(", ") || "Não informado",
    };
  }

  extractTeor(mov: DatajudMovement): string {
    if (!mov.complementosTabelados || mov.complementosTabelados.length === 0) {
      return "";
    }
    return mov.complementosTabelados
      .map(c => c.descricao || c.nome)
      .filter(Boolean)
      .join(". ");
  }

  async importProcess(caseId: number, processData: DatajudProcess): Promise<void> {
    const movements: InsertCaseMovement[] = (processData.movimentos || []).map(mov => {
      const complementos = mov.complementosTabelados?.map(c => c.nome).join(", ") || "";
      const description = complementos ? `${mov.nome}: ${complementos}` : mov.nome;
      const teor = this.extractTeor(mov);
      
      return {
        caseId,
        date: new Date(mov.dataHora),
        type: this.classifyMovementType(mov.nome),
        description,
        teor: teor || null,
        source: "DataJud",
        datajudCode: mov.codigo?.toString(),
        datajudPayload: mov as any,
        requiresAction: this.requiresAction(mov.nome),
      };
    });

    if (movements.length > 0) {
      await storage.createCaseMovements(movements);
    }

    const payloadHash = createHash("sha256").update(JSON.stringify(processData)).digest("hex");
    
    // Extrair partes (autor/réu)
    const { autor, reu } = this.extractPartes(processData.partes);
    
    // Extrair assuntos
    const assuntos = (processData.assuntos || []).map(a => a.nome).filter(Boolean);
    
    await storage.updateCase(caseId, {
      datajudLastSync: new Date(),
      datajudPayloadHash: payloadHash,
      caseClass: processData.classe?.codigo?.toString(),
      classeNome: processData.classe?.nome,
      subject: processData.assuntos?.[0]?.nome,
      autor,
      reu,
      vara: processData.orgaoJulgador?.nome,
      valorCausa: processData.valorCausa?.toString(),
      assuntos,
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
    if (lower.includes("intimação") || lower.includes("intimacao") || lower.includes("intimado") || lower.includes("intimada")) return "Intimação";
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
           lower.includes("intimado") ||
           lower.includes("intimada") ||
           lower.includes("citação") || 
           lower.includes("citacao") ||
           lower.includes("prazo") ||
           lower.includes("oportunizo") ||
           lower.includes("oportunizando");
  }
}

export const datajudService = new DatajudService();
