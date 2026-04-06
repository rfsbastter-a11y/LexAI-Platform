export async function processSecretaryMediaContent(params: {
  openai: any;
  mediaType: string;
  base64Data: string;
  fileName?: string;
  mimetype?: string;
}): Promise<string> {
  const { openai, mediaType, base64Data, fileName, mimetype } = params;

  try {
    if (mediaType === "image") {
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Descreva detalhadamente o conteúdo desta imagem. Se contiver texto, transcreva-o integralmente. Se for um documento, extraia todas as informações relevantes." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
            ],
          },
        ],
        max_tokens: 2000,
      });
      return visionResponse.choices[0]?.message?.content || "[Não foi possível analisar a imagem]";
    }

    if (mediaType === "audio") {
      const audioBuffer = Buffer.from(base64Data, "base64");
      const audioMime = (mimetype || "audio/ogg; codecs=opus").split(";")[0].trim();

      const transcribeModels = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe"];
      for (const model of transcribeModels) {
        try {
          const { toFile } = await import("openai");
          const ext = audioMime.includes("ogg") ? "ogg" : audioMime.includes("mp4") ? "m4a" : audioMime.includes("mpeg") ? "mp3" : "ogg";
          const file = await toFile(audioBuffer, `audio.${ext}`, { type: audioMime });
          const transcription = await openai.audio.transcriptions.create({
            file,
            model,
            language: "pt",
          });
          const text = transcription.text || "";
          if (text.trim()) return text.trim();
        } catch (error) {
          console.error(`[Secretary] ${model} transcription failed:`, error);
        }
      }

      try {
        const audioFormat = audioMime.includes("ogg") ? "ogg" : audioMime.includes("mp3") ? "mp3" : audioMime.includes("wav") ? "wav" : "ogg";
        const chatResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcreva exatamente o que é dito neste áudio em português brasileiro. Retorne APENAS a transcrição literal, sem explicações, sem aspas, sem prefixos." },
                {
                  type: "input_audio" as any,
                  input_audio: {
                    data: base64Data,
                    format: audioFormat,
                  },
                } as any,
              ],
            },
          ],
        });

        const text = chatResponse.choices[0]?.message?.content || "";
        if (text.trim()) return text.trim();
      } catch (error) {
        console.error("[Secretary] GPT-4o audio chat fallback failed:", error);
      }

      return "__MEDIA_FAILED__:audio";
    }

    if (mediaType === "document") {
      const docBuffer = Buffer.from(base64Data, "base64");
      const ext = (fileName || "").toLowerCase();
      const mime = (mimetype || "").toLowerCase();

      if (ext.endsWith(".pdf") || mime.includes("pdf")) {
        let pdfText = "";
        try {
          const { PDFParse } = await import("pdf-parse");
          const parser = new (PDFParse as any)({ data: docBuffer });
          await parser.load();
          const result = await parser.getText();
          pdfText = (typeof result === "string" ? result : result?.text || "") as string;
          pdfText = pdfText.trim();
        } catch (error) {
          console.error("[Secretary] PDF parse error:", error);
        }

        if (pdfText && pdfText.length > 50) {
          return pdfText.substring(0, 8000);
        }

        try {
          const { GoogleGenAI } = await import("@google/genai");
          const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
          if (geminiKey) {
            const genAI = new GoogleGenAI({
              apiKey: geminiKey,
              ...(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL } } : {}),
            });
            const ocrResult = await genAI.models.generateContent({
              model: "gemini-2.5-pro",
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: "Extraia TODO o texto visível deste documento PDF digitalizado. Transcreva cada informação: nomes, CPF, CNPJ, RG, endereços, valores, datas, números de documentos. Retorne APENAS o texto extraído, sem explicações." },
                    { inlineData: { mimeType: "application/pdf", data: base64Data } },
                  ],
                },
              ],
            });
            const ocrText = ocrResult.text || "";
            if (ocrText.length > 20) return ocrText.substring(0, 8000);
          }
        } catch (error) {
          console.error("[Secretary] Gemini OCR fallback error:", error);
        }

        if (!pdfText || pdfText.length <= 50) {
          return "__MEDIA_FAILED__:pdf";
        }

        return pdfText.substring(0, 8000);
      }

      if (ext.endsWith(".docx") || mime.includes("wordprocessingml")) {
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: docBuffer });
          return result.value?.substring(0, 8000) || "[Documento Word vazio]";
        } catch (error) {
          console.error("[Secretary] DOCX parse error:", error);
          return "[Não foi possível extrair texto do Word]";
        }
      }

      if (ext.endsWith(".txt") || ext.endsWith(".csv") || mime.includes("text")) {
        return docBuffer.toString("utf-8").substring(0, 5000);
      }

      if (ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png") || mime.includes("image")) {
        const visionResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcreva todo o texto visível nesta imagem de documento. Extraia todas as informações relevantes." },
                { type: "image_url", image_url: { url: `data:${mime || "image/jpeg"};base64,${base64Data}` } },
              ],
            },
          ],
          max_tokens: 2000,
        });
        return visionResponse.choices[0]?.message?.content || "[Não foi possível analisar o documento]";
      }

      return `[Documento recebido: ${fileName || "arquivo"} - formato não suportado para extração]`;
    }

    return `[Mídia do tipo ${mediaType} recebida]`;
  } catch (error) {
    console.error("[Secretary] Media processing error:", error);
    return `[Erro ao processar mídia: ${(error as Error).message}]`;
  }
}

export async function archiveSignedAgreementIfMatched(params: {
  jid: string;
  tenantId: number;
  mediaBase64: string;
  mediaType: string;
  mediaFileName?: string;
  mediaMimetype?: string;
  extractedText?: string;
  resolveLidToPhone: (lidId: string) => Promise<string | null>;
  normalizePhoneForComparison: (phone: string) => string[];
  storage: {
    getNegotiationsByTenant: (tenantId: number) => Promise<any[]>;
    getNegotiationContacts: (negotiationId: number) => Promise<any[]>;
    createDocument: (data: any) => Promise<any>;
    updateNegotiation: (negotiationId: number, data: any) => Promise<any>;
  };
}): Promise<{ negotiationId: number } | null> {
  try {
    const normalizedFileName = (params.mediaFileName || "").toLowerCase();
    const normalizedExtractedText = (params.extractedText || "").toLowerCase();
    const fileLooksRelevant = /(acordo|renegoci|termo|assinad)/.test(normalizedFileName);
    const textLooksRelevant = /(acordo|renegoci|termo)/.test(normalizedExtractedText);
    const textShowsSignature = /(assinad|assinado digitalmente|firmad|rubricad|signed)/.test(normalizedExtractedText);

    if (!fileLooksRelevant && !(textLooksRelevant && textShowsSignature)) {
      return null;
    }

    let phone: string | null = null;
    if (params.jid.includes("@lid")) {
      const lidId = params.jid.split("@")[0];
      phone = await params.resolveLidToPhone(lidId);
    } else {
      phone = params.jid.split("@")[0].replace(/\D/g, "");
    }
    if (!phone) return null;

    const phoneVariants = params.normalizePhoneForComparison(phone);
    const allNegotiations = await params.storage.getNegotiationsByTenant(params.tenantId);
    const closedNegotiations = allNegotiations.filter((negotiation: any) => negotiation.status === "acordo_fechado");

    for (const negotiation of closedNegotiations) {
      const contacts = await params.storage.getNegotiationContacts(negotiation.id);
      for (const contact of contacts) {
        const contactPhones: string[] = [];
        if (contact.whatsapp) contactPhones.push(...params.normalizePhoneForComparison(contact.whatsapp));
        if (contact.phone) contactPhones.push(...params.normalizePhoneForComparison(contact.phone));

        const hasMatch = phoneVariants.some((variant) => contactPhones.includes(variant));
        if (!hasMatch) continue;

        if (normalizedExtractedText) {
          const normalizedContactName = (contact.name || "").toLowerCase();
          const hasContactName = normalizedContactName.length >= 4 && normalizedExtractedText.includes(normalizedContactName);
          if (!hasContactName && textLooksRelevant) {
            continue;
          }
        }

        const fsModule = await import("fs");
        const pathModule = await import("path");
        const cryptoModule = await import("crypto");

        const signedDir = pathModule.default.join(".", "agreements", "signed");
        if (!fsModule.default.existsSync(signedDir)) {
          fsModule.default.mkdirSync(signedDir, { recursive: true });
        }

        const ext = params.mediaFileName ? pathModule.default.extname(params.mediaFileName) : (params.mediaType === "image" ? ".jpg" : ".pdf");
        const signedFileName = `Acordo_Assinado_${contact.name.replace(/\s+/g, "_").slice(0, 20)}_${negotiation.id}_${Date.now()}${ext}`;
        const signedFilePath = pathModule.default.join(signedDir, signedFileName);

        const buffer = Buffer.from(params.mediaBase64, "base64");
        fsModule.default.writeFileSync(signedFilePath, buffer);
        const fileHash = cryptoModule.default.createHash("md5").update(buffer).digest("hex");

        await params.storage.createDocument({
          tenantId: params.tenantId,
          clientId: negotiation.clientId,
          caseId: negotiation.caseId || null,
          title: `Acordo Assinado - ${contact.name}`,
          type: "acordo_assinado",
          filePath: signedFilePath,
          fileHash,
          fileSize: buffer.length,
          mimeType: params.mediaMimetype || (params.mediaType === "image" ? "image/jpeg" : "application/pdf"),
          aiGenerated: false,
        });

        await params.storage.updateNegotiation(negotiation.id, { status: "finalizado" });
        return { negotiationId: negotiation.id };
      }
    }
  } catch (error) {
    console.error("[Secretary] Error checking for signed agreement:", error);
  }

  return null;
}
