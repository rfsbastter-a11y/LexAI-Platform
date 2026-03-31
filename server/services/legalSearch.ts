import OpenAI from "openai";
import { escavadorService } from "./escavador";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface SearchResult {
  id: string;
  source: "escavador" | "doctrine" | "web";
  title: string;
  summary: string;
  ementa?: string;
  legalThesis?: string;
  fundamentacao?: string;
  court?: string;
  date?: string;
  caseNumber?: string;
  url?: string;
  relevance: "alta" | "media" | "baixa";
  citationABNT?: string;
  rawContent?: string;
  selected?: boolean;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalFound: number;
  sources: string[];
}

const JURISPRUDENCE_CLASSES: Record<string, number> = {
  "acao_civil_publica": 65,
  "acao_trabalhista": 1116,
  "mandado_seguranca": 120,
  "recurso_ordinario": 1009,
  "agravo_instrumento": 1320,
  "habeas_corpus": 307,
  "recurso_especial": 1001,
  "recurso_extraordinario": 1000,
  "execucao_fiscal": 1116,
  "cumprimento_sentenca": 156,
};

const SUBJECT_CODES: Record<string, number> = {
  "dano_moral": 7773,
  "rescisao_contrato_trabalho": 8819,
  "horas_extras": 8818,
  "verbas_rescisorias": 8817,
  "acidente_trabalho": 10219,
  "responsabilidade_civil": 10432,
  "consumidor": 8826,
  "contrato": 8833,
  "familia": 10577,
  "heranca": 10580,
};

export class LegalSearchService {
  async searchJurisprudence(
    query: string,
    options?: {
      tribunals?: string[];
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    }
  ): Promise<SearchResponse> {
    const results: SearchResult[] = [];
    const limit = options?.limit || 10;

    if (escavadorService.isConfigured()) {
      try {
        const escResults = await escavadorService.searchByNameOrDocument(query);
        const processos = escResults?.processos || escResults?.items || [];
        
        for (const proc of processos.slice(0, limit)) {
          const numero = proc.numero_cnj || proc.numeroProcesso || proc.numero || "";
          const tribunal = proc.tribunal?.sigla || proc.tribunal || "";
          const classe = proc.classe || proc.tipo || "";
          const assuntos = proc.assuntos?.map((a: any) => a.nome || a).join(", ") || "";
          
          const result: SearchResult = {
            id: `escavador-${numero}`,
            source: "escavador",
            title: `${classe || "Processo"} - ${tribunal}`,
            summary: assuntos || proc.descricao || `${classe} - Tribunal: ${tribunal}`,
            court: tribunal,
            date: proc.data_inicio || proc.dataAjuizamento,
            caseNumber: numero,
            url: proc.url || `https://www.escavador.com/processos/${numero.replace(/\D/g, "")}`,
            relevance: "media",
            rawContent: JSON.stringify(proc),
          };
          results.push(result);
        }
      } catch (error) {
        console.error("[Legal Search] Escavador search error:", error);
      }
    }

    const sortedResults = results.slice(0, limit);

    return {
      query,
      results: sortedResults,
      totalFound: results.length,
      sources: Array.from(new Set(results.map(r => r.court || r.source))),
    };
  }

  async searchDoctrine(query: string, options?: { limit?: number }): Promise<SearchResponse> {
    const limit = options?.limit || 10;
    
    const doctrinePrompt = `Você é um pesquisador jurídico. Para o tema "${query}", liste até ${limit} referências doutrinárias brasileiras reais e verificáveis.

Para cada referência, forneça APENAS referências que você TEM CERTEZA que existem:
- Autor(es)
- Título da obra/artigo
- Editora ou periódico
- Ano de publicação
- Um breve resumo do conteúdo relevante (2-3 frases)

IMPORTANTE: 
- NÃO invente referências
- Se não conhecer referências reais sobre o tema, diga explicitamente
- Prefira obras clássicas e consolidadas da doutrina brasileira

Responda em formato JSON com a seguinte estrutura:
{
  "references": [
    {
      "author": "Nome do Autor",
      "title": "Título da Obra",
      "publisher": "Editora",
      "year": "2020",
      "summary": "Resumo do conteúdo relevante"
    }
  ],
  "note": "Observação sobre a pesquisa, se necessário"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um pesquisador jurídico especializado em doutrina brasileira. Responda apenas em JSON válido." },
          { role: "user", content: doctrinePrompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      
      const results: SearchResult[] = (parsed.references || []).map((ref: any, index: number) => ({
        id: `doctrine-${index}`,
        source: "doctrine" as const,
        title: ref.title,
        summary: ref.summary,
        date: ref.year,
        relevance: "media" as const,
        citationABNT: this.formatDoctrineABNT(ref),
        rawContent: JSON.stringify(ref),
        url: `https://scholar.google.com.br/scholar?q=${encodeURIComponent(`"${ref.author}" "${ref.title}"`)}`,
      }));

      return {
        query,
        results,
        totalFound: results.length,
        sources: ["Doutrina Brasileira"],
      };
    } catch (error) {
      console.error("Error searching doctrine:", error);
      return {
        query,
        results: [],
        totalFound: 0,
        sources: [],
      };
    }
  }

  async summarizeResult(result: SearchResult): Promise<string> {
    if (!result.rawContent) return result.summary;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: "Você é um assistente jurídico. Resuma de forma concisa e profissional o conteúdo jurídico fornecido, destacando os pontos principais e a tese jurídica." 
          },
          { 
            role: "user", 
            content: `Resuma este conteúdo jurídico em 3-4 frases:\n\n${result.rawContent}` 
          },
        ],
        max_tokens: 300,
        temperature: 0.2,
      });

      return response.choices[0]?.message?.content || result.summary;
    } catch (error) {
      console.error("Error summarizing result:", error);
      return result.summary;
    }
  }

  async extractLegalContent(results: SearchResult[]): Promise<SearchResult[]> {
    if (results.length === 0) return results;

    const extractionPrompt = `Analise os seguintes processos judiciais e extraia o CONTEÚDO JURÍDICO RELEVANTE de cada um.

Para cada processo, identifique:
1. EMENTA: Resumo do caso e decisão (o que foi decidido)
2. TESE JURÍDICA: O entendimento jurídico aplicado (a regra de direito utilizada)
3. FUNDAMENTAÇÃO: Os argumentos principais que justificam a decisão

Processos para análise:
${results.map((r, i) => `
PROCESSO ${i + 1}:
- Classe: ${r.title}
- Número: ${r.caseNumber || "N/A"}
- Tribunal: ${r.court || "N/A"}
- Dados brutos: ${r.rawContent?.slice(0, 1500) || r.summary}
`).join("\n")}

Responda em JSON com a estrutura:
{
  "extractions": [
    {
      "index": 0,
      "ementa": "Resumo claro do caso e sua decisão...",
      "legalThesis": "Tese jurídica aplicada...",
      "fundamentacao": "Argumentos principais..."
    }
  ]
}

IMPORTANTE: 
- Foque no MÉRITO e na TESE JURÍDICA, não em dados processuais
- Se não houver informação suficiente para extrair, use "Informação não disponível nos dados públicos"
- Seja objetivo e técnico`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um jurista especializado em análise de jurisprudência. Extraia o conteúdo jurídico relevante de forma técnica e objetiva. Responda apenas em JSON válido." },
          { role: "user", content: extractionPrompt },
        ],
        max_tokens: 3000,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      
      const enrichedResults = results.map((result, index) => {
        const extraction = (parsed.extractions || []).find((e: any) => e.index === index);
        if (extraction) {
          return {
            ...result,
            ementa: extraction.ementa || result.summary,
            legalThesis: extraction.legalThesis,
            fundamentacao: extraction.fundamentacao,
          };
        }
        return result;
      });

      return enrichedResults;
    } catch (error) {
      console.error("Error extracting legal content:", error);
      return results;
    }
  }

  private buildElasticQuery(query: string, dateFrom?: string, dateTo?: string): Record<string, any> {
    const must: any[] = [
      {
        multi_match: {
          query,
          fields: ["assuntos.nome", "classe.nome", "movimentos.nome", "orgaoJulgador.nome"],
          type: "best_fields",
          fuzziness: "AUTO",
        },
      },
    ];

    if (dateFrom || dateTo) {
      const range: any = { dataAjuizamento: {} };
      if (dateFrom) range.dataAjuizamento.gte = dateFrom;
      if (dateTo) range.dataAjuizamento.lte = dateTo;
      must.push({ range });
    }

    return {
      bool: { must },
    };
  }

  private buildSummary(proc: any): string {
    const parts: string[] = [];
    
    if (proc.classe?.nome) {
      parts.push(proc.classe.nome);
    }
    
    if (proc.assuntos && proc.assuntos.length > 0) {
      parts.push(`Assuntos: ${proc.assuntos.map((a: any) => a.nome).join(", ")}`);
    }
    
    if (proc.orgaoJulgador?.nome) {
      parts.push(`Órgão: ${proc.orgaoJulgador.nome}`);
    }

    if (proc.movimentos && proc.movimentos.length > 0) {
      const lastMovement = proc.movimentos[0];
      parts.push(`Última mov.: ${lastMovement.nome}`);
    }

    return parts.join(" | ");
  }

  private buildTribunalUrl(tribunal: TribunalInfo, caseNumber: string): string {
    const cleanNumber = caseNumber.replace(/\D/g, "");
    
    const urlTemplates: Record<string, string> = {
      "STF": `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${cleanNumber}`,
      "STJ": `https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=${cleanNumber}`,
      "TJSP": `https://esaj.tjsp.jus.br/cpopg/show.do?processo.codigo=${cleanNumber}`,
      "TRT2": `https://pje.trt2.jus.br/consultaprocessual/detalhe-processo/${cleanNumber}`,
    };

    return urlTemplates[tribunal.sigla] || 
      `https://www.google.com/search?q=${encodeURIComponent(`${caseNumber} ${tribunal.sigla}`)}`;
  }

  private calculateRelevance(query: string, proc: any): "alta" | "media" | "baixa" {
    const queryTerms = query.toLowerCase().split(/\s+/);
    let matches = 0;

    const searchText = JSON.stringify(proc).toLowerCase();
    
    for (const term of queryTerms) {
      if (term.length > 2 && searchText.includes(term)) {
        matches++;
      }
    }

    const matchRatio = matches / queryTerms.length;
    
    if (matchRatio >= 0.7) return "alta";
    if (matchRatio >= 0.4) return "media";
    return "baixa";
  }

  private formatABNTCitation(proc: any, tribunal: TribunalInfo): string {
    const parts: string[] = [];
    
    parts.push("BRASIL.");
    parts.push(`${tribunal.nome}.`);
    
    if (proc.classe?.nome) {
      parts.push(`${proc.classe.nome}.`);
    }
    
    parts.push(`Processo nº ${proc.numeroProcesso}.`);
    
    if (proc.orgaoJulgador?.nome) {
      parts.push(`${proc.orgaoJulgador.nome}.`);
    }
    
    if (proc.dataAjuizamento) {
      const date = new Date(proc.dataAjuizamento);
      parts.push(`Ajuizado em ${date.toLocaleDateString("pt-BR")}.`);
    }

    return parts.join(" ");
  }

  private formatDoctrineABNT(ref: any): string {
    const parts: string[] = [];
    
    if (ref.author) {
      const authors = ref.author.split(",").map((a: string) => a.trim());
      if (authors.length === 1) {
        const nameParts = authors[0].split(" ");
        parts.push(`${nameParts[nameParts.length - 1].toUpperCase()}, ${nameParts.slice(0, -1).join(" ")}.`);
      } else {
        parts.push(`${authors[0].split(" ").pop()?.toUpperCase()} et al.`);
      }
    }
    
    if (ref.title) {
      parts.push(`**${ref.title}**.`);
    }
    
    if (ref.publisher) {
      parts.push(`${ref.publisher},`);
    }
    
    if (ref.year) {
      parts.push(`${ref.year}.`);
    }

    return parts.join(" ");
  }

  private async searchSerpApi(searchQuery: string, serpApiKey: string, limit: number): Promise<any[]> {
    const params = new URLSearchParams({
      api_key: serpApiKey,
      q: searchQuery,
      google_domain: "google.com.br",
      gl: "br",
      hl: "pt-br",
      num: limit.toString(),
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SerpAPI error ${response.status}:`, errorText);
      return [];
    }

    const data = await response.json();
    return data.organic_results || [];
  }

  async searchWebJurisprudence(query: string, options?: { limit?: number }): Promise<SearchResponse> {
    const limit = options?.limit || 50;
    const serpApiKey = process.env.SERPAPI_API_KEY;

    if (!serpApiKey) {
      console.error("SERPAPI_API_KEY not configured");
      return { query, results: [], totalFound: 0, sources: [] };
    }

    try {
      const perSourceLimit = Math.ceil(limit / 3);

      const [tribunalResults, jusBrasilResults, escavadorResults] = await Promise.all([
        this.searchSerpApi(
          `${query} site:*.jus.br ementa acórdão processo`,
          serpApiKey,
          perSourceLimit
        ).catch(() => []),
        this.searchSerpApi(
          `${query} site:jusbrasil.com.br jurisprudência`,
          serpApiKey,
          perSourceLimit
        ).catch(() => []),
        this.searchSerpApi(
          `${query} site:escavador.com jurisprudência processo`,
          serpApiKey,
          perSourceLimit
        ).catch(() => []),
      ]);

      const allRawResults: Array<{ item: any; sourceLabel: string }> = [];
      jusBrasilResults.forEach((item: any) => allRawResults.push({ item, sourceLabel: "JusBrasil" }));
      tribunalResults.forEach((item: any) => allRawResults.push({ item, sourceLabel: "Tribunais" }));
      escavadorResults.forEach((item: any) => allRawResults.push({ item, sourceLabel: "Escavador" }));

      const seenUrls = new Set<string>();
      const uniqueResults = allRawResults.filter(({ item }) => {
        const url = item.link?.toLowerCase();
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });

      const MAX_ENRICH = 8;
      const results: SearchResult[] = await Promise.all(
        uniqueResults.slice(0, limit).map(async ({ item, sourceLabel }, index) => {
          const court = this.extractCourtFromUrl(item.link) || sourceLabel;
          const result: SearchResult = {
            id: `web-juris-${index}`,
            source: "web",
            title: item.title || "Sem título",
            summary: item.snippet || "",
            url: item.link,
            court,
            relevance: index < 3 ? "alta" : index < 6 ? "media" : "baixa",
          };

          if (index < MAX_ENRICH) {
            const enriched = await this.enrichResultWithAI(result, "jurisprudence");
            return enriched;
          }
          return result;
        })
      );

      const sourcesFound: string[] = [];
      if (tribunalResults.length > 0) sourcesFound.push("STJ", "STF", "TRFs", "TJs", "TRTs");
      if (jusBrasilResults.length > 0) sourcesFound.push("JusBrasil");
      if (escavadorResults.length > 0) sourcesFound.push("Escavador");

      return {
        query,
        results,
        totalFound: results.length,
        sources: sourcesFound,
      };
    } catch (error) {
      console.error("Error in web jurisprudence search:", error);
      return { query, results: [], totalFound: 0, sources: [] };
    }
  }

  async searchWebDoctrine(query: string, options?: { limit?: number }): Promise<SearchResponse> {
    const limit = options?.limit || 50;
    const serpApiKey = process.env.SERPAPI_API_KEY;

    if (!serpApiKey) {
      console.error("SERPAPI_API_KEY not configured");
      return { query, results: [], totalFound: 0, sources: [] };
    }

    try {
      // Use Google Scholar engine for academic/doctrine searches
      const params = new URLSearchParams({
        api_key: serpApiKey,
        engine: "google_scholar",
        q: `${query} direito`,
        hl: "pt-br",
        num: limit.toString(),
      });

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`SerpAPI Google Scholar error ${response.status}:`, errorText);
        throw new Error(`SerpAPI error: ${response.status}`);
      }

      const data = await response.json();
      const organicResults = data.organic_results || [];

      const results: SearchResult[] = await Promise.all(
        organicResults.slice(0, limit).map(async (item: any, index: number) => {
          // Google Scholar returns different structure
          const publication = item.publication_info?.summary || "";
          const authors = item.publication_info?.authors?.map((a: any) => a.name).join(", ") || "";
          
          const result: SearchResult = {
            id: `scholar-doctrine-${index}`,
            source: "doctrine",
            title: item.title || "Sem título",
            summary: item.snippet || "",
            url: item.link || item.resources?.[0]?.link || "",
            date: publication,
            court: authors, // Using court field to store authors for doctrine
            relevance: index < 3 ? "alta" : index < 6 ? "media" : "baixa",
          };

          const enriched = await this.enrichResultWithAI(result, "doctrine");
          return enriched;
        })
      );

      return {
        query,
        results,
        totalFound: results.length,
        sources: ["Google Scholar"],
      };
    } catch (error) {
      console.error("Error in Google Scholar doctrine search:", error);
      return { query, results: [], totalFound: 0, sources: [] };
    }
  }

  private extractCourtFromUrl(url: string): string {
    if (url.includes("stj.jus.br")) return "STJ";
    if (url.includes("stf.jus.br")) return "STF";
    if (url.includes("tjsp.jus.br")) return "TJSP";
    if (url.includes("trt")) return "TRT";
    if (url.includes("jusbrasil.com.br")) return "JusBrasil";
    return "";
  }

  private async enrichResultWithAI(result: SearchResult, type: "jurisprudence" | "doctrine"): Promise<SearchResult> {
    try {
      const prompt = type === "jurisprudence" 
        ? `Analise esta jurisprudência e extraia as informações para inserção em peça processual:

Título: ${result.title}
Snippet: ${result.summary}
URL: ${result.url}
Tribunal: ${result.court || ""}

IMPORTANTE: Formate para inserção direta em peça jurídica.

Extraia:
1. EMENTA: Citação literal da ementa ou trecho relevante da decisão (para ser inserido com recuo em parágrafo separado)
2. TESE JURÍDICA: O entendimento de direito aplicado
3. FUNDAMENTAÇÃO: Os argumentos jurídicos principais
4. REPOSITÓRIO: Número do processo, Relator, Órgão julgador, data de julgamento, DJe (formato: "TRIBUNAL, Processo nº X, Rel. Min. Y, Órgão, julgado em DD/MM/AAAA, DJe DD/MM/AAAA")

Responda em JSON:
{
  "ementa": "citação literal da ementa ou trecho da decisão entre aspas",
  "legalThesis": "tese jurídica identificada",
  "fundamentacao": "fundamentação jurídica",
  "citationABNT": "TRIBUNAL. Processo nº X. Relator: Min. Y. Órgão Julgador. Data. DJe."
}`
        : `Analise esta referência doutrinária do Google Scholar e extraia as informações para inserção em peça processual:

Título: ${result.title}
Snippet: ${result.summary}
Autores: ${result.court || ""}
Publicação: ${result.date || ""}
URL: ${result.url}

IMPORTANTE: Formate para inserção direta em peça jurídica.

Extraia:
1. CITAÇÃO LITERAL: Trecho principal do texto entre aspas (para ser inserido com recuo em parágrafo separado)
2. TESE: O argumento ou tese central defendida pelo autor
3. FUNDAMENTAÇÃO: A base teórica e doutrinária apresentada
4. REFERÊNCIA BIBLIOGRÁFICA: Em formato ABNT para rodapé (AUTOR. Título. Local: Editora, ano. p. X)

Responda em JSON:
{
  "ementa": "citação literal do trecho mais relevante entre aspas",
  "legalThesis": "tese ou argumento central do autor",
  "fundamentacao": "fundamentação teórica",
  "citationABNT": "SOBRENOME, Nome. Título da obra. Local: Editora, ano. p. X-Y."
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um pesquisador jurídico brasileiro. Extraia informações jurídicas relevantes. Responda apenas em JSON válido." },
          { role: "user", content: prompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        ...result,
        ementa: parsed.ementa || result.summary,
        legalThesis: parsed.legalThesis,
        fundamentacao: parsed.fundamentacao,
        citationABNT: parsed.citationABNT,
      };
    } catch (error) {
      console.error("Error enriching result with AI:", error);
      return result;
    }
  }
}

export const legalSearchService = new LegalSearchService();
