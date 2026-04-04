function normalizeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(str: string): string {
  return normalizeAccents(str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function inferTemplateTypeFromLegalRequestText(text: string): string {
  const t = normalizeForMatch(text);
  if (!t) return "outro";

  if (/contrarrazoes/.test(t)) return "contrarrazoes";
  if (/agravo de instrumento|agravo/.test(t)) return "agravo_instrumento";
  if (/recurso de apelacao|apelacao/.test(t)) return "recurso_apelacao";
  if (/contestacao/.test(t)) return "contestacao";
  if (/cumprimento de sentenca/.test(t)) return "cumprimento_sentenca";
  if (/execucao de titulo|execucao extrajudicial|execucao/.test(t)) return "execucao";
  if (/acao monitoria|monitoria/.test(t)) return "acao_monitoria";
  if (/habeas corpus/.test(t)) return "habeas_corpus";
  if (/mandado de seguranca/.test(t)) return "mandado_seguranca";
  if (/notificacao extrajudicial/.test(t)) return "notificacao_extrajudicial";
  if (/acordo extrajudicial/.test(t)) return "acordo_extrajudicial";
  if (/peticao inicial/.test(t)) return "peticao_inicial";
  if (/peticao|peca juridica|peca processual|recurso|embargo/.test(t)) return "outro";
  return "outro";
}
