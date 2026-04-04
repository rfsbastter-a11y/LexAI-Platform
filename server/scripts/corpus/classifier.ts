/**
 * Classificador jurídico de documentos.
 *
 * Usa GPT-4o-mini (barato: $0.15/1M input tokens) para classificar:
 * - tipo de peça processual
 * - área do direito
 * - instituição/órgão
 * - qualidade (0-10)
 *
 * Fallback: classificação por regex/keywords (sem custo de API).
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ClassificationResult {
  pieceType: string;
  legalArea: string;
  institution: string | null;
  tribunal: string | null;
  qualityScore: number;    // 0-10
  completenessScore: number; // 0-10
  isLegalDocument: boolean;  // false = descartar (não é peça jurídica)
  theses: string[];
}

const PIECE_TYPES = [
  "peticao_inicial", "contestacao", "recurso_apelacao", "contrarrazoes",
  "recurso_especial", "recurso_extraordinario", "agravo_instrumento",
  "execucao_fiscal", "cumprimento_sentenca", "acao_monitoria",
  "habeas_corpus", "mandado_seguranca", "contrato", "notificacao_extrajudicial",
  "acordo_extrajudicial", "parecer", "outros",
];

/**
 * Classificação via GPT-4o-mini.
 * Usa apenas os primeiros 3000 chars para manter custo baixo.
 */
export async function classifyWithAI(text: string): Promise<ClassificationResult> {
  const snippet = text.substring(0, 3000);

  const prompt = `Analise este trecho de documento jurídico brasileiro e responda APENAS com JSON válido:

DOCUMENTO:
${snippet}

RESPONDA com este JSON (sem markdown, sem explicações):
{
  "pieceType": "um dos: ${PIECE_TYPES.join("|")}",
  "legalArea": "uma de: tributario|trabalhista|civil|administrativo|penal|previdenciario|constitucional|consumidor|outros",
  "institution": "nome da instituição/órgão se identificável, null se não",
  "tribunal": "sigla do tribunal se identificável (STJ, STF, TRF1, TJSP etc), null se não",
  "qualityScore": número de 0 a 10 (qualidade jurídica da redação),
  "completenessScore": número de 0 a 10 (completude do documento),
  "isLegalDocument": true ou false (false se não for peça jurídica real),
  "theses": array de strings com até 3 teses jurídicas principais identificadas
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleaned) as ClassificationResult;
  } catch (err: any) {
    console.warn("[Classifier] AI classification failed, using regex fallback:", err.message);
    return classifyWithRegex(text);
  }
}

/**
 * Classificação por regex/keywords — fallback sem custo de API.
 * Menos precisa mas funciona sem conectividade.
 */
export function classifyWithRegex(text: string): ClassificationResult {
  const lower = text.toLowerCase();

  const pieceType = detectPieceType(lower);
  const legalArea = detectLegalArea(lower);
  const institution = detectInstitution(text);
  const tribunal = detectTribunal(text);

  const isLegalDocument =
    /excelentíssimo|v\.exa\.|douta|colendo|sentença|acórdão|petição|recurso|contrato|notificação|parecer/i.test(text) &&
    text.length > 500;

  return {
    pieceType,
    legalArea,
    institution,
    tribunal,
    qualityScore: isLegalDocument ? 6 : 0,
    completenessScore: text.length > 5000 ? 7 : text.length > 2000 ? 5 : 3,
    isLegalDocument,
    theses: [],
  };
}

// ─── Helpers de detecção ────────────────────────────────────────────────────

function detectPieceType(lower: string): string {
  if (/petição inicial|excelentíssimo.*juiz.*requer/.test(lower)) return "peticao_inicial";
  if (/contestação|impugna os termos|contestar/.test(lower)) return "contestacao";
  if (/recurso de apelação|razões recursais|apelante/.test(lower)) return "recurso_apelacao";
  if (/contrarrazões/.test(lower)) return "contrarrazoes";
  if (/recurso especial|resp|violação.*lei federal/.test(lower)) return "recurso_especial";
  if (/recurso extraordinário|repercussão geral/.test(lower)) return "recurso_extraordinario";
  if (/agravo de instrumento|decisão agravada/.test(lower)) return "agravo_instrumento";
  if (/execução fiscal|dívida ativa|certidão de dívida/.test(lower)) return "execucao_fiscal";
  if (/cumprimento de sentença|impugnação ao cumprimento/.test(lower)) return "cumprimento_sentenca";
  if (/ação monitória|mandado monitório|embargos monitórios/.test(lower)) return "acao_monitoria";
  if (/habeas corpus|constrangimento ilegal|coação/.test(lower)) return "habeas_corpus";
  if (/mandado de segurança|direito líquido e certo|autoridade coatora/.test(lower)) return "mandado_seguranca";
  if (/contrato de|instrumento particular|cláusula.*parágrafo/.test(lower)) return "contrato";
  if (/notificação extrajudicial|intimamos|notificamos v\.sa/.test(lower)) return "notificacao_extrajudicial";
  if (/termo de acordo|acordo extrajudicial|proposta de acordo|renegociação/.test(lower)) return "acordo_extrajudicial";
  if (/parecer jurídico|parecer n°|nota técnica/.test(lower)) return "parecer";
  return "outros";
}

function detectLegalArea(lower: string): string {
  if (/execução fiscal|dívida ativa|tributário|pgfn|fazenda nacional|imposto|contribuição/.test(lower)) return "tributario";
  if (/trabalhista|reclamante|reclamado|trt|jcj|clt|rescisão.*contrato.*trabalho/.test(lower)) return "trabalhista";
  if (/inss|previdência|benefício|aposentadoria|pensão por morte|auxílio/.test(lower)) return "previdenciario";
  if (/consumidor|fornecedor|cdc|código de defesa/.test(lower)) return "consumidor";
  if (/constitucional|inconstitucionalidade|stf|repercussão geral/.test(lower)) return "constitucional";
  if (/administrativo|ato administrativo|licitação|concurso público/.test(lower)) return "administrativo";
  if (/penal|crime|réu|delegacia|inquérito|denúncia/.test(lower)) return "penal";
  return "civil";
}

function detectInstitution(text: string): string | null {
  if (/Advocacia-Geral da União|AGU/i.test(text)) return "AGU";
  if (/Procuradoria da Fazenda Nacional|PGFN/i.test(text)) return "PGFN";
  if (/Procuradoria-Geral Federal|PGF/i.test(text)) return "PGF";
  if (/Instituto Nacional do Seguro Social|INSS/i.test(text)) return "INSS";
  if (/Banco Central|BACEN|BCB/i.test(text)) return "BACEN";
  if (/CADE|Conselho Administrativo de Defesa Econômica/i.test(text)) return "CADE";
  if (/ANEEL/i.test(text)) return "ANEEL";
  if (/ANVISA/i.test(text)) return "ANVISA";
  if (/IBAMA/i.test(text)) return "IBAMA";
  if (/União Federal/i.test(text)) return "União Federal";
  return null;
}

function detectTribunal(text: string): string | null {
  if (/Superior Tribunal de Justiça|STJ/i.test(text)) return "STJ";
  if (/Supremo Tribunal Federal|STF/i.test(text)) return "STF";
  if (/Tribunal Superior do Trabalho|TST/i.test(text)) return "TST";
  if (/TRF1|Tribunal Regional Federal.*1/i.test(text)) return "TRF1";
  if (/TRF2|Tribunal Regional Federal.*2/i.test(text)) return "TRF2";
  if (/TRF3|Tribunal Regional Federal.*3/i.test(text)) return "TRF3";
  if (/TRF4|Tribunal Regional Federal.*4/i.test(text)) return "TRF4";
  if (/TRF5|Tribunal Regional Federal.*5/i.test(text)) return "TRF5";
  if (/TJSP/i.test(text)) return "TJSP";
  if (/TJDFT|TJDF/i.test(text)) return "TJDFT";
  if (/TJRJ/i.test(text)) return "TJRJ";
  if (/TJMG/i.test(text)) return "TJMG";
  return null;
}
