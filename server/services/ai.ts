import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

interface AiCitation {
  documentId?: number;
  source: string;
  excerpt: string;
  relevance: string;
}

interface AiResponse {
  content: string;
  citations: AiCitation[];
  tokensUsed: number;
}

const SYSTEM_PROMPT = `Você é a LexAI, uma assistente jurídica profissional de nível avançado para um escritório de advocacia real.

REGRAS OBRIGATÓRIAS:
1. NUNCA invente jurisprudência ou doutrina. Toda citação deve ser real e verificável.
2. NUNCA simule dados ou fatos. Trabalhe apenas com informações fornecidas no contexto.
3. Quando não houver jurisprudência consolidada sobre um tema, DECLARE EXPLICITAMENTE.
4. Sempre forneça a FONTE de cada informação jurídica citada.
5. Nenhuma peça processual deve ser gerada sem contexto adequado do caso.
6. Mantenha rastreabilidade: cite trechos específicos dos documentos analisados.

FORMATO DE RESPOSTA:
- Seja preciso e profissional
- Cite artigos de lei com número e dispositivo
- Para jurisprudência, cite: Tribunal, número do recurso, relator e data
- Ao analisar documentos, referencie trechos específicos

Você está aqui para ASSISTIR advogados, não substituí-los. Toda produção requer validação humana.`;

export class AiService {
  async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    contextDocuments?: Array<{ id: number; title: string; content: string }>,
    options?: { systemPromptOverride?: string; maxTokens?: number; temperature?: number }
  ): Promise<AiResponse> {
    let systemPrompt = options?.systemPromptOverride || SYSTEM_PROMPT;

    if (contextDocuments && contextDocuments.length > 0) {
      systemPrompt += "\n\nDOCUMENTOS EM CONTEXTO:\n";
      contextDocuments.forEach((doc, i) => {
        systemPrompt += `\n[DOC ${i + 1}: ${doc.title}]\n${doc.content}\n`;
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: options?.maxTokens || 16000,
      temperature: options?.temperature ?? 0.1,
    });

    const content = response.choices[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    const citations = this.extractCitations(content, contextDocuments);

    return {
      content,
      citations,
      tokensUsed,
    };
  }

  async generatePiece(
    pieceType: string,
    caseContext: {
      caseNumber: string;
      court: string;
      caseClass: string;
      subject: string;
      parties?: string;
    },
    intimationText: string,
    additionalInstructions?: string
  ): Promise<AiResponse> {
    const prompt = `Elabore um rascunho de ${pieceType} para o seguinte caso:

DADOS DO PROCESSO:
- Número: ${caseContext.caseNumber}
- Tribunal/Vara: ${caseContext.court}
- Classe: ${caseContext.caseClass}
- Assunto: ${caseContext.subject}
${caseContext.parties ? `- Partes: ${caseContext.parties}` : ""}

INTIMAÇÃO/MOVIMENTAÇÃO QUE ORIGINA A PEÇA:
${intimationText}

${additionalInstructions ? `INSTRUÇÕES ADICIONAIS:\n${additionalInstructions}` : ""}

IMPORTANTE:
1. Este é um RASCUNHO que será revisado por advogado
2. NÃO invente fatos ou jurisprudência
3. Use estrutura formal apropriada para ${pieceType}
4. Indique com [COMPLETAR] onde informações específicas do caso devem ser inseridas
5. Cite apenas legislação e jurisprudência reais e verificáveis`;

    return this.chat([{ role: "user", content: prompt }]);
  }

  async summarizeDocument(documentContent: string, documentTitle: string): Promise<AiResponse> {
    const prompt = `Analise e resuma o seguinte documento jurídico:

TÍTULO: ${documentTitle}

CONTEÚDO:
${documentContent}

Forneça:
1. RESUMO EXECUTIVO (2-3 parágrafos)
2. PONTOS PRINCIPAIS identificados
3. DATAS e PRAZOS importantes (se houver)
4. OBRIGAÇÕES das partes (se aplicável)
5. RISCOS ou pontos de atenção`;

    return this.chat([{ role: "user", content: prompt }]);
  }

  async extractDataFromDocument(documentContent: string, extractionType: "contract" | "procuration" | "petition" | "client"): Promise<Record<string, any>> {
    const prompts: Record<string, string> = {
      client: `Extraia os dados de cliente/pessoa deste documento. Retorne APENAS um JSON com estes campos (preencha o que encontrar, string vazia para campos não encontrados):
{
  "type": "PF" ou "PJ",
  "name": "nome completo ou razão social",
  "document": "CPF ou CNPJ (apenas números)",
  "email": "email",
  "phone": "telefone",
  "address": "endereço completo",
  "notes": "outras informações relevantes como profissão, estado civil, nacionalidade, RG"
}
Se encontrar dados de mais de uma pessoa, priorize a pessoa principal (cliente/contratante/requerente).`,
      contract: `Extraia os seguintes dados do contrato:
- Partes contratantes (nome, CPF/CNPJ)
- Objeto do contrato
- Valor (se houver)
- Prazo de vigência
- Cláusulas de reajuste
- Multas e penalidades
- Foro de eleição`,
      procuration: `Extraia os seguintes dados da procuração:
- Outorgante (nome, CPF/CNPJ, endereço)
- Outorgado (advogado, OAB)
- Poderes conferidos
- Prazo de validade
- Foro`,
      petition: `Extraia os seguintes dados da petição:
- Partes (autor, réu)
- Tipo de ação
- Pedidos formulados
- Valor da causa
- Provas indicadas`,
    };

    const prompt = `${prompts[extractionType]}

DOCUMENTO:
${documentContent}

Retorne os dados em formato estruturado JSON.`;

    const response = await this.chat([{ role: "user", content: prompt }]);
    
    try {
      const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      return JSON.parse(response.content);
    } catch {
      return { rawExtraction: response.content };
    }
  }

  async chatWithGemini(
    prompt: string,
    systemPrompt?: string
  ): Promise<AiResponse & { modelUsed: string }> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const waitMs = Math.pow(2, attempt) * 1000;
          console.log(`[Gemini] Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }

        const config: Record<string, unknown> = {
          temperature: 0.1,
          maxOutputTokens: 65536,
        };
        if (systemPrompt) {
          config.systemInstruction = systemPrompt;
        }

        const response = await gemini.models.generateContent({
          model: "gemini-2.5-pro",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config,
        });

        const content = response.text || "";
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        return {
          content,
          citations: this.extractCitations(content),
          tokensUsed,
          modelUsed: "gemini-2.5-pro",
        };
      } catch (error: any) {
        lastError = error;
        if (error?.status !== 429) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Gemini rate limit exceeded after retries");
  }

  private extractCitations(content: string, contextDocuments?: Array<{ id: number; title: string; content: string }>): AiCitation[] {
    const citations: AiCitation[] = [];

    const lawMatches = Array.from(content.matchAll(/Art(?:igo)?\.?\s*(\d+)(?:,?\s*(?:§|parágrafo)\s*\d+)?(?:\s*(?:do|da)\s+([^,\.]+))?/gi));
    for (const match of lawMatches) {
      citations.push({
        source: match[2] || "Legislação",
        excerpt: match[0],
        relevance: "Citação legal",
      });
    }

    const jurisprudenceMatches = Array.from(content.matchAll(/(REsp|RE|HC|MS|AgRg|EDcl|AI)\s*(?:n[º°]?\s*)?[\d\.\-\/]+/gi));
    for (const match of jurisprudenceMatches) {
      citations.push({
        source: "Jurisprudência",
        excerpt: match[0],
        relevance: "Precedente judicial",
      });
    }

    if (contextDocuments) {
      const docRefMatches = Array.from(content.matchAll(/\[DOC\s*(\d+)[^\]]*\]/gi));
      for (const match of docRefMatches) {
        const docIndex = parseInt(match[1]) - 1;
        if (contextDocuments[docIndex]) {
          citations.push({
            documentId: contextDocuments[docIndex].id,
            source: contextDocuments[docIndex].title,
            excerpt: match[0],
            relevance: "Documento do caso",
          });
        }
      }
    }

    return citations;
  }

  async analyzeFile(content: string, fileName: string, isImage: boolean, imageBase64?: string): Promise<AiResponse> {
    const systemPrompt = `Você é a LexAI, assistente jurídica do escritório Marques & Serra Sociedade de Advogados. O usuário enviou o arquivo "${fileName}".

INSTRUÇÕES:
1. ENTENDA o conteúdo do documento - NÃO transcreva o texto inteiro
2. Identifique o tipo de documento (contrato, procuração, petição, decisão, certidão, etc.)
3. Faça um RESUMO EXECUTIVO com os pontos principais (máximo 5-8 itens)
4. Extraia dados-chave: partes envolvidas, datas importantes, valores, obrigações
5. Sugira 2-3 ações práticas que podem ser executadas no sistema (cadastrar cliente, gerar peça, criar contrato, etc.)
6. Responda de forma organizada, breve e prática em português
7. MEMORIZE estas informações para referência futura na conversa`;

    if (isImage && imageBase64) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Analise esta imagem do arquivo "${fileName}". Extraia todo o texto visível (OCR) e identifique o tipo de documento jurídico.` },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ] as any,
          },
        ],
        max_tokens: 4000,
      });

      return {
        content: response.choices[0].message.content || "Não foi possível analisar a imagem.",
        citations: [],
        tokensUsed: response.usage?.total_tokens || 0,
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Arquivo: ${fileName}\n\nConteúdo:\n${content.substring(0, 8000)}` },
      ],
      max_tokens: 4000,
    });

    return {
      content: response.choices[0].message.content || "Não foi possível analisar o arquivo.",
      citations: [],
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }
}

export const aiService = new AiService();
