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
    const failed = /nao consegui gerar|nÃ£o consegui gerar|nao foi possivel gerar|nÃ£o foi possÃ­vel gerar|erro/i.test(text);
    const delivered = /ENVIADA COM SUCESSO|enviado diretamente/i.test(text);
    const sendFailed = /FALHA AO ENVIAR|falha no envio/i.test(text);
    const saved = /Salv[ao]\s+no\s+(LexAI\s+)?Studio|\bID:\s*\d+\b/i.test(text);

    if (failed) {
      return { verified: false, finalStatus: "failed", checks: { saved: false, delivered: false }, summary: "Falha na geraÃ§Ã£o da peÃ§a" };
    }
    if (delivered) {
      return { verified: true, finalStatus: "completed", checks: { saved: true, wordGenerated: true, delivered: true }, summary: "PeÃ§a gerada e entregue" };
    }
    if (sendFailed && saved) {
      return { verified: true, finalStatus: "partial", checks: { saved: true, wordGenerated: true, delivered: false }, summary: "PeÃ§a gerada sem confirmaÃ§Ã£o de entrega" };
    }
    if (saved) {
      return { verified: true, finalStatus: "partial", checks: { saved: true, delivered: false }, summary: "PeÃ§a salva sem confirmaÃ§Ã£o de entrega" };
    }
    return { verified: false, finalStatus: "failed", checks: { saved: false, delivered: false }, summary: "PeÃ§a sem evidÃªncia de salvamento ou entrega" };
  }

  if (action === "gerar_contrato") {
    const failed = /erro ao gerar|nao foi possivel gerar|nÃ£o foi possÃ­vel gerar/i.test(text);
    const delivered = /foi enviado diretamente nesta conversa/i.test(text);
    const saved = /Salvo no LexAI Studio|Studio/i.test(text);

    if (failed) {
      return { verified: false, finalStatus: "failed", checks: { saved: false, delivered: false }, summary: "Falha na geraÃ§Ã£o do contrato" };
    }
    if (delivered) {
      return { verified: true, finalStatus: "completed", checks: { saved: true, wordGenerated: true, delivered: true }, summary: "Contrato gerado e entregue" };
    }
    if (saved) {
      return { verified: true, finalStatus: "partial", checks: { saved: true, delivered: false }, summary: "Contrato salvo sem confirmaÃ§Ã£o de entrega" };
    }
  }

  return {
    verified: true,
    finalStatus: "completed",
    checks: {},
    summary: "Resultado operacional concluÃ­do",
  };
}
