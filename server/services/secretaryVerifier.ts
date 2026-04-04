export type SecretaryVerificationResult = {
  verified: boolean;
  finalStatus: "completed" | "partial" | "failed";
  checks: {
    saved?: boolean;
    wordGenerated?: boolean;
    delivered?: boolean;
  };
  summary: string;
};

export function verifySecretaryActionResult(action: string, rawResult: string): SecretaryVerificationResult {
  const text = (rawResult || "").trim();

  if (!text) {
    return {
      verified: false,
      finalStatus: "failed",
      checks: {},
      summary: "Resultado vazio",
    };
  }

  if (action === "gerar_peca_estudio") {
    const failed = /nao consegui gerar|não consegui gerar|nao foi possivel gerar|não foi possível gerar|erro/i.test(text);
    const delivered = /ENVIADA COM SUCESSO|enviado diretamente/i.test(text);
    const sendFailed = /FALHA AO ENVIAR|falha no envio/i.test(text);
    const saved = /Salvo no LexAI Studio|Studio/i.test(text);

    if (failed) {
      return { verified: false, finalStatus: "failed", checks: { saved: false, delivered: false }, summary: "Falha na geração da peça" };
    }
    if (delivered) {
      return { verified: true, finalStatus: "completed", checks: { saved: true, wordGenerated: true, delivered: true }, summary: "Peça gerada e entregue" };
    }
    if (sendFailed || saved) {
      return { verified: true, finalStatus: "partial", checks: { saved: true, wordGenerated: true, delivered: false }, summary: "Peça gerada sem confirmação de entrega" };
    }
    return { verified: false, finalStatus: "partial", checks: { saved: false, delivered: false }, summary: "Peça processada sem evidência suficiente" };
  }

  if (action === "gerar_contrato") {
    const failed = /erro ao gerar|nao foi possivel gerar|não foi possível gerar/i.test(text);
    const delivered = /foi enviado diretamente nesta conversa/i.test(text);
    const saved = /Salvo no LexAI Studio|Studio/i.test(text);

    if (failed) {
      return { verified: false, finalStatus: "failed", checks: { saved: false, delivered: false }, summary: "Falha na geração do contrato" };
    }
    if (delivered) {
      return { verified: true, finalStatus: "completed", checks: { saved: true, wordGenerated: true, delivered: true }, summary: "Contrato gerado e entregue" };
    }
    if (saved) {
      return { verified: true, finalStatus: "partial", checks: { saved: true, delivered: false }, summary: "Contrato salvo sem confirmação de entrega" };
    }
  }

  return {
    verified: true,
    finalStatus: "completed",
    checks: {},
    summary: "Resultado operacional concluído",
  };
}
