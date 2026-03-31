/**
 * meetingAI.ts
 *
 * Improvements over original:
 *   - Singleton Gemini client (one instance per process)
 *   - meetingChat no longer makes a separate "should I search?" LLM call.
 *     Instead it uses keyword heuristics (~0ms) to decide, saving 1–2s per message.
 *   - generateMeetingInsights replaced by generateConselheiro: unified "O que + Como" panel
 *     that combines jurídical insights with DISC-adapted communication tips.
 */

import { GoogleGenAI } from "@google/genai";

// ── Singleton client ───────────────────────────────────────────────────────

let _geminiClient: GoogleGenAI | null = null;

function gemini(): GoogleGenAI {
  if (!_geminiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "";
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    _geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "", baseUrl },
    });
  }
  return _geminiClient;
}

// ── Conselheiro ao vivo ────────────────────────────────────────────────────
// Replaces the old generateMeetingInsights which kept insights and DISC separate.
// Now produces a single unified panel: "O que falar + Como falar" per recommendation,
// DISC profiles embedded inline when the transcript has enough speech per participant.

export async function generateMeetingInsights(
  transcriptText: string,
  legalRole: string,
  meetingTitle: string
): Promise<string> {
  const systemPrompt = `Você é um conselheiro estratégico ao vivo em uma reunião jurídica de ${legalRole}.

Analise a transcrição e produza o painel "Conselheiro ao vivo" com dois blocos:

---

## 🧭 O QUE E COMO FALAR AGORA

Liste de 3 a 5 recomendações de ação. Cada recomendação deve combinar em UMA SÓ FRASE:
- O que abordar (conteúdo jurídico, ponto de atenção, argumento, risco)
- Como comunicar (tom, abordagem, palavras-chave — adaptado ao perfil DISC do participante quando identificável)

Formato de cada recomendação:
**Com [Nome] / Em geral:** [O que abordar] — [como comunicar: tom específico, sugestão de frase ou abordagem]

Exemplos:
- **Com Marina:** Aborde o prazo de entrega do contrato — use linguagem colaborativa ("juntos podemos resolver antes do prazo"), evite pressão direta.
- **Em geral:** Clarifique as cláusulas de rescisão — apresente como proteção mútua, não como desconfiança.

Se não houver informação suficiente para personalizar por participante, faça recomendações gerais e inclua:
> ℹ️ *Marque quem está falando para personalizar as dicas de comunicação.*

---

## 🧠 PERFIS DE COMUNICAÇÃO

Para cada participante com falas identificadas na transcrição, informe em UMA linha:
**[Nome]** — [Perfil DISC: letra + nome] — [Uma dica prática de comunicação]

Exemplos:
- **Marina** — S (Estabilidade) — Comunicação colaborativa, evite urgência e pressão
- **Carlos** — D (Dominância) — Seja direto, apresente resultados concretos

Classifique DISC apenas com base em falas reais. Se não houver falas suficientes de um participante, omita-o.
Se nenhum participante tiver falas suficientes, omita esta seção.

---

Seja conciso e prático. Responda em português brasileiro.`;

  try {
    const response = await gemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Reunião: "${meetingTitle}"\nPapel jurídico: ${legalRole}\n\nTranscrição acumulada:\n${transcriptText}`,
      config: { systemInstruction: systemPrompt },
    });
    return response.text || "Aguardando mais contexto da reunião para gerar recomendações.";
  } catch (error) {
    console.error("[MeetingAI] Error generating conselheiro:", error);
    return "Erro ao gerar recomendações. Tente novamente.";
  }
}

// ── Executive Summary ──────────────────────────────────────────────────────

export async function generateExecutiveSummary(
  transcriptText: string,
  legalRole: string,
  meetingTitle: string,
  participantNames: string[]
): Promise<{
  summary: string;
  decisions: string[];
  actions: { description: string; responsible: string; deadline: string }[];
  risks: string[];
  nextSteps: string[];
  discProfiles: { name: string; profile: string; description: string; tip: string }[];
}> {
  const empty = {
    summary: "Resumo não disponível.",
    decisions: [],
    actions: [],
    risks: [],
    nextSteps: [],
    discProfiles: [],
  };

  const systemPrompt = `Você é um copiloto jurídico. Gere um resumo executivo da reunião em formato JSON.
Participantes: ${participantNames.join(", ")}
Papel jurídico: ${legalRole}

Responda APENAS com JSON válido no formato:
{
  "summary": "Resumo geral da reunião (2-3 parágrafos)",
  "decisions": ["Decisão 1", "Decisão 2"],
  "actions": [{"description": "Ação", "responsible": "Responsável", "deadline": "Prazo sugerido"}],
  "risks": ["Risco 1", "Risco 2"],
  "nextSteps": ["Próximo passo 1", "Próximo passo 2"],
  "discProfiles": [
    {
      "name": "Nome do participante",
      "profile": "D - Dominância",
      "description": "Justificativa breve baseada nas falas",
      "tip": "Dica prática de como se comunicar com esta pessoa"
    }
  ]
}

IMPORTANTE para discProfiles:
- Inclua SOMENTE participantes que aparecem com falas claras na transcrição.
- Não invente perfil para quem não falou ou falou muito pouco.
- Se não houver informação suficiente, deixe o array vazio.

Para os demais campos, use array vazio se não houver informação suficiente.`;

  try {
    const response = await gemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Reunião: "${meetingTitle}"\n\nTranscrição completa:\n${transcriptText}`,
      config: { systemInstruction: systemPrompt },
    });

    const text = response.text || "{}";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || empty.summary,
      decisions: parsed.decisions || [],
      actions: parsed.actions || [],
      risks: parsed.risks || [],
      nextSteps: parsed.nextSteps || [],
      discProfiles: parsed.discProfiles || [],
    };
  } catch (error) {
    console.error("[MeetingAI] Error generating summary:", error);
    return empty;
  }
}

// ── Web search ─────────────────────────────────────────────────────────────

async function searchWeb(query: string): Promise<string> {
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (!serpApiKey) return "";

  try {
    const params = new URLSearchParams({
      api_key: serpApiKey,
      q: query,
      google_domain: "google.com.br",
      gl: "br",
      hl: "pt-br",
      num: "5",
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    if (!response.ok) return "";

    const data = await response.json();
    interface SerpResult { title: string; snippet?: string; link: string }
    const results: SerpResult[] = data.organic_results || [];
    return results
      .slice(0, 5)
      .map((r) => `- ${r.title}: ${r.snippet || ""} (${r.link})`)
      .join("\n");
  } catch {
    return "";
  }
}

// ── Fast keyword heuristic (replaces the extra LLM call) ──────────────────

const LEGAL_SEARCH_KEYWORDS = [
  "lei", "artigo", "art.", "parágrafo", "inciso", "decreto", "portaria",
  "medida provisória", "instrução normativa", "resolução", "código",
  "jurisprudência", "súmula", "precedente", "acórdão", "decisão judicial",
  "stj", "stf", "tst", "trf", "tjsp", "tjdft", "tjgo",
  "prazo", "prescrição", "decadência", "recurso", "apelação",
  "taxa", "índice", "ipca", "igpm", "selic", "salário mínimo",
  "tabela", "percentual", "alíquota",
];

function needsWebSearch(question: string): boolean {
  if (!process.env.SERPAPI_API_KEY) return false;
  const lower = question.toLowerCase();
  return LEGAL_SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Chat ───────────────────────────────────────────────────────────────────

export async function meetingChat(
  question: string,
  transcriptText: string,
  chatHistory: { role: string; content: string }[],
  meetingTitle: string,
  legalRole: string
): Promise<string> {
  let webContext = "";
  if (needsWebSearch(question)) {
    try {
      const query = question.length > 100 ? question.substring(0, 100) : question;
      webContext = await searchWeb(query);
    } catch (error) {
      console.warn("[MeetingAI] Web search failed, continuing without:", error);
    }
  }

  const systemPrompt = `Você é um copiloto jurídico inteligente em uma reunião. 
Contexto da reunião: "${meetingTitle}" (${legalRole})
Responda perguntas do usuário de forma clara, concisa e profissional em português brasileiro.
Use o contexto da transcrição e, quando disponível, resultados de pesquisa web para embasar suas respostas.
Se não souber algo, diga claramente ao invés de inventar.`;

  const historyContext = chatHistory
    .slice(-10)
    .map((m) => `${m.role === "user" ? "Usuário" : "Copiloto"}: ${m.content}`)
    .join("\n");

  let prompt = "";
  if (transcriptText.trim()) {
    prompt += `Transcrição da reunião (contexto):\n${transcriptText.slice(-3000)}\n\n`;
  }
  if (historyContext) prompt += `Histórico do chat:\n${historyContext}\n\n`;
  if (webContext) prompt += `Resultados de pesquisa web:\n${webContext}\n\n`;
  prompt += `Pergunta do usuário: ${question}`;

  try {
    const response = await gemini().models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { systemInstruction: systemPrompt },
    });
    return response.text || "Não consegui processar sua pergunta. Tente reformular.";
  } catch (error) {
    console.error("[MeetingAI] Chat error:", error);
    throw error;
  }
}
