/**
 * transcriptionAI.ts
 *
 * Handles audio transcription via Gemini.
 *
 * DESIGN: No automatic voice-based diarization.
 * Speaker attribution follows this priority:
 *   1. activeSpeakerHint (user confirmed who is speaking) → use that name
 *   2. participants list → limit labels to those names only, never invent new ones
 *   3. No hints → use "Participante" as the generic label
 *
 * ANTI-HALLUCINATION RULES:
 *   1. Never invent speech. Silent/unintelligible audio → return [].
 *   2. Never create speaker labels outside the provided list.
 *   3. Never repeat content from recentUtterances.
 *   4. Confidence gate: omit segments shorter than 3 words or very uncertain.
 */

import { GoogleGenAI } from "@google/genai";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "";
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  return new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } });
}

let _geminiClient: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!_geminiClient) _geminiClient = getGeminiClient();
  return _geminiClient;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  text: string;
}

/**
 * Transcribes a self-contained audio blob (WebM/opus).
 * Speaker attribution is user-driven, not voice-based.
 *
 * @param audioBase64        Base64-encoded audio blob
 * @param mimeType           MIME type (e.g. "audio/webm")
 * @param participants       Known participant names (restricts labels to this list)
 * @param recentUtterances   Last few utterances already saved (dedup guard)
 * @param activeSpeakerHint  Name the user confirmed is speaking right now (highest priority)
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  participants: string[] = [],
  recentUtterances: { speaker: string; text: string }[] = [],
  activeSpeakerHint?: string
): Promise<TranscriptionResult> {
  const ai = gemini();

  // ── Build speaker instruction ──────────────────────────────────────────────
  let speakerInstruction: string;

  if (activeSpeakerHint) {
    speakerInstruction =
      `O usuário confirmou que "${activeSpeakerHint}" está falando agora. ` +
      `Use "${activeSpeakerHint}" como rótulo de falante para TODOS os segmentos. ` +
      `Não tente identificar outras vozes. Não crie nenhum outro rótulo de falante.`;
  } else {
    // No hint → always use generic label; never attribute names
    speakerInstruction =
      `Use "Participante" como rótulo para TODOS os segmentos. ` +
      `Não tente identificar vozes por timbre nem criar rótulos distintos. ` +
      `Nunca use nomes de participantes como rótulos de falante sem confirmação do usuário.`;
  }

  // ── Build dedup context ────────────────────────────────────────────────────
  const recentContext =
    recentUtterances.length > 0
      ? `\n\nFalas JÁ TRANSCRITAS — NÃO repita estas:\n` +
        recentUtterances
          .slice(-6)
          .map((u) => `${u.speaker}: ${u.text}`)
          .join("\n")
      : "";

  const systemPrompt = `Você é um motor de transcrição de áudio para reuniões jurídicas.

REGRAS OBRIGATÓRIAS — siga todas sem exceção:

1. TRANSCREVA APENAS O QUE ESTÁ NO ÁUDIO ENVIADO AGORA.
   - Não invente, não complete, não infira falas que não foram ditas.
   - Se o áudio estiver silencioso, com ruído ou ininteligível → retorne JSON com array vazio: {"segments": []}
   - Se apenas parte do áudio for compreensível, transcreva somente essa parte.

2. ATRIBUIÇÃO DE FALANTES — siga a instrução abaixo:
   ${speakerInstruction}

3. NÃO REPITA CONTEÚDO JÁ TRANSCRITO.${recentContext}

4. FORMATO DA RESPOSTA — JSON puro, sem markdown, sem explicações:
{"segments": [{"speaker": "NomeFalante", "text": "Texto exato da fala."}]}

5. QUALIDADE MÍNIMA: omita segmentos com menos de 3 palavras ou muito incertos.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "audio/webm",
                data: audioBase64,
              },
            },
            {
              text: "Transcreva o áudio acima seguindo todas as regras do sistema.",
            },
          ],
        },
      ],
      config: { systemInstruction: systemPrompt },
    });

    const raw = (response.text || "").trim();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    if (!cleaned || cleaned === "{}") {
      return { segments: [], text: "" };
    }

    let parsed: { segments?: TranscriptSegment[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[TranscriptionAI] Failed to parse response:", cleaned.slice(0, 200));
      return { segments: [], text: "" };
    }

    const segments: TranscriptSegment[] = (parsed.segments || []).filter(
      (s) => s && typeof s.speaker === "string" && typeof s.text === "string" && s.text.trim().length >= 3
    );

    // ── Dedup guard ────────────────────────────────────────────────────────
    const recentTexts = recentUtterances.map((u) =>
      u.text.trim().toLowerCase().replace(/\s+/g, " ")
    );

    const dedupedSegments = segments.filter((seg) => {
      const normalized = seg.text.trim().toLowerCase().replace(/\s+/g, " ");
      const isDuplicate = recentTexts.some(
        (recent) =>
          recent === normalized ||
          recent.includes(normalized) ||
          normalized.includes(recent)
      );
      if (isDuplicate) {
        console.log(`[TranscriptionAI] Dedup filtered: "${seg.text}"`);
      }
      return !isDuplicate;
    });

    const text = dedupedSegments.map((s) => s.text).join(" ");

    console.log(
      `[TranscriptionAI] ${dedupedSegments.length} segments (${segments.length - dedupedSegments.length} deduped)`
    );

    return { segments: dedupedSegments, text };
  } catch (error) {
    console.error("[TranscriptionAI] Error:", error);
    return { segments: [], text: "" };
  }
}
