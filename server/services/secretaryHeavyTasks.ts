import { format } from "date-fns";

export async function generateSimpleLegacyPiece(params: {
  openai: any;
  tenantId: number;
  pieceType: string;
  description: string;
  createGeneratedPiece: (data: any) => Promise<any>;
}) {
  void params;
  return null;
}

export async function sendGeneratedWordDocument(params: {
  jid: string;
  tenantId: number;
  title: string;
  fileName: string;
  contentHtml: string;
  generateWordWithLetterhead: (contentHtml: string, title: string, tenantId: number) => Promise<Buffer | null>;
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
  let wordBuffer = await params.generateWordWithLetterhead(params.contentHtml, params.title, params.tenantId);
  let usedFallbackWord = false;

  if (!wordBuffer) {
    wordBuffer = await params.generatePlainWord(params.contentHtml, params.title);
    usedFallbackWord = true;
  }

  const caption = usedFallbackWord
    ? `ðŸ“„ ${params.title} (sem timbre)\nGerado por LexAI em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`
    : `ðŸ“„ ${params.title}\nGerado por LexAI em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`;

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
