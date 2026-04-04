import { format } from "date-fns";

export async function generateSimpleLegacyPiece(params: {
  openai: any;
  tenantId: number;
  pieceType: string;
  description: string;
  createGeneratedPiece: (data: any) => Promise<any>;
}) {
  const piecePrompt = `Gere uma ${params.pieceType} jurídica completa e profissional para o escritório Marques e Serra.
Advogado responsável: Ronald Ferreira Serra, OAB/DF 23.947.
Descrição do pedido: ${params.description}
Gere o documento completo em formato profissional, com todas as seções necessárias.`;

  const pieceCompletion = await params.openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: piecePrompt }],
    max_tokens: 4000,
    temperature: 0.5,
  });

  const pieceContent = pieceCompletion.choices[0]?.message?.content || "";
  if (!pieceContent) return null;

  return params.createGeneratedPiece({
    tenantId: params.tenantId,
    title: `${params.pieceType} - ${params.description.substring(0, 80)}`,
    pieceType: params.pieceType,
    contentHtml: pieceContent,
    prompt: params.description,
  });
}

export async function sendGeneratedWordDocument(params: {
  jid: string;
  tenantId: number;
  title: string;
  fileName: string;
  contentHtml: string;
  generateWordWithLetterhead: (contentHtml: string, title: string) => Promise<Buffer | null>;
  generatePlainWord: (contentHtml: string, title: string) => Promise<Buffer>;
  sendDocumentToJid: (
    jid: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    caption: string,
    tenantId: number,
  ) => Promise<boolean>;
}) {
  let wordBuffer = await params.generateWordWithLetterhead(params.contentHtml, params.title);
  let usedFallbackWord = false;

  if (!wordBuffer) {
    wordBuffer = await params.generatePlainWord(params.contentHtml, params.title);
    usedFallbackWord = true;
  }

  const caption = usedFallbackWord
    ? `📄 ${params.title} (sem timbre)\nGerado por LexAI em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`
    : `📄 ${params.title}\nGerado por LexAI em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`;

  const sent = await params.sendDocumentToJid(
    params.jid,
    wordBuffer,
    params.fileName,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    caption,
    params.tenantId,
  );

  return { sent, usedFallbackWord };
}
