/**
 * Biblioteca de queries SerpAPI para descoberta de peças processuais públicas.
 *
 * Cada tipo de peça tem queries específicas com filetype:pdf para encontrar
 * documentos reais protocolados em tribunais e órgãos públicos.
 *
 * Estratégia: "tipo de peça" + "órgão/tribunal" + filetype:pdf
 */

export interface QuerySet {
  pieceType: string;
  label: string;
  queries: string[];
  weight: number; // 1-3, quanto maior mais importante para o corpus
}

export const PIECE_QUERY_SETS: QuerySet[] = [
  {
    pieceType: "peticao_inicial",
    label: "Petição Inicial",
    weight: 3,
    queries: [
      '"petição inicial" filetype:pdf site:*.jus.br',
      '"petição inicial" "excelentíssimo" filetype:pdf',
      '"petição inicial" "INSS" filetype:pdf site:*.gov.br',
      '"petição inicial" "União Federal" filetype:pdf',
      '"petição inicial" trabalhista filetype:pdf site:*.jus.br',
      '"petição inicial" "ação de cobrança" filetype:pdf',
      '"petição inicial" "ação monitória" filetype:pdf',
    ],
  },
  {
    pieceType: "contestacao",
    label: "Contestação",
    weight: 3,
    queries: [
      '"contestação" "AGU" filetype:pdf',
      '"contestação" "União Federal" filetype:pdf site:*.jus.br',
      '"contestação" "INSS" filetype:pdf',
      '"contestação" "Fazenda Nacional" filetype:pdf',
      '"contestação" "prazo para contestar" filetype:pdf site:*.jus.br',
      '"contestação" "impugna os termos" filetype:pdf',
      '"contestação" "PGFN" filetype:pdf',
    ],
  },
  {
    pieceType: "recurso_apelacao",
    label: "Recurso de Apelação",
    weight: 3,
    queries: [
      '"recurso de apelação" "AGU" filetype:pdf',
      '"recurso de apelação" "PGFN" filetype:pdf',
      '"apelação cível" filetype:pdf site:*.jus.br',
      '"recurso de apelação" "União Federal" filetype:pdf',
      '"apelação" "razões recursais" filetype:pdf site:*.jus.br',
      '"recurso de apelação" "INSS" filetype:pdf',
      '"apelação" "colendo tribunal" filetype:pdf',
    ],
  },
  {
    pieceType: "contrarrazoes",
    label: "Contrarrazões",
    weight: 2,
    queries: [
      '"contrarrazões" "AGU" filetype:pdf',
      '"contrarrazões de apelação" filetype:pdf site:*.jus.br',
      '"contrarrazões" "União Federal" filetype:pdf',
      '"contrarrazões" "PGFN" filetype:pdf',
      '"contrarrazões" "recurso de apelação" filetype:pdf',
    ],
  },
  {
    pieceType: "recurso_especial",
    label: "Recurso Especial",
    weight: 3,
    queries: [
      '"recurso especial" "AGU" filetype:pdf',
      '"recurso especial" "PGFN" filetype:pdf',
      '"recurso especial" "violação" filetype:pdf site:*.jus.br',
      '"REsp" "União Federal" filetype:pdf',
      '"recurso especial" "divergência jurisprudencial" filetype:pdf',
      '"recurso especial" "INSS" filetype:pdf',
    ],
  },
  {
    pieceType: "recurso_extraordinario",
    label: "Recurso Extraordinário",
    weight: 2,
    queries: [
      '"recurso extraordinário" "AGU" filetype:pdf',
      '"recurso extraordinário" "repercussão geral" filetype:pdf',
      '"RE" "inconstitucionalidade" "União Federal" filetype:pdf',
      '"recurso extraordinário" "PGFN" filetype:pdf site:*.gov.br',
    ],
  },
  {
    pieceType: "agravo_instrumento",
    label: "Agravo de Instrumento",
    weight: 2,
    queries: [
      '"agravo de instrumento" "AGU" filetype:pdf',
      '"agravo de instrumento" "União Federal" filetype:pdf site:*.jus.br',
      '"agravo de instrumento" "decisão agravada" filetype:pdf',
      '"agravo de instrumento" "INSS" filetype:pdf',
      '"agravo de instrumento" "PGFN" filetype:pdf',
    ],
  },
  {
    pieceType: "execucao_fiscal",
    label: "Execução Fiscal",
    weight: 3,
    queries: [
      '"execução fiscal" "PGFN" filetype:pdf',
      '"execução fiscal" "Fazenda Nacional" filetype:pdf',
      '"embargos à execução fiscal" filetype:pdf site:*.jus.br',
      '"impugnação" "execução fiscal" filetype:pdf',
      '"execução fiscal" "certidão de dívida ativa" filetype:pdf',
      '"execução de título extrajudicial" filetype:pdf site:*.jus.br',
    ],
  },
  {
    pieceType: "cumprimento_sentenca",
    label: "Cumprimento de Sentença",
    weight: 2,
    queries: [
      '"cumprimento de sentença" filetype:pdf site:*.jus.br',
      '"cumprimento de sentença" "União Federal" filetype:pdf',
      '"cumprimento de sentença" "INSS" filetype:pdf',
      '"impugnação ao cumprimento de sentença" filetype:pdf',
    ],
  },
  {
    pieceType: "acao_monitoria",
    label: "Ação Monitória",
    weight: 2,
    queries: [
      '"ação monitória" filetype:pdf site:*.jus.br',
      '"ação monitória" "embargos monitórios" filetype:pdf',
      '"embargos à monitória" filetype:pdf',
      '"impugnação aos embargos monitórios" filetype:pdf',
    ],
  },
  {
    pieceType: "habeas_corpus",
    label: "Habeas Corpus",
    weight: 2,
    queries: [
      '"habeas corpus" "AGU" filetype:pdf',
      '"habeas corpus" "impetrante" filetype:pdf site:*.jus.br',
      '"habeas corpus" "constrangimento ilegal" filetype:pdf',
    ],
  },
  {
    pieceType: "mandado_seguranca",
    label: "Mandado de Segurança",
    weight: 2,
    queries: [
      '"mandado de segurança" "AGU" filetype:pdf',
      '"mandado de segurança" "direito líquido e certo" filetype:pdf site:*.jus.br',
      '"mandado de segurança" "INSS" filetype:pdf',
      '"mandado de segurança" "União Federal" filetype:pdf',
    ],
  },
  {
    pieceType: "contrato",
    label: "Contrato",
    weight: 2,
    queries: [
      '"contrato de prestação de serviços" filetype:pdf site:*.gov.br',
      '"contrato administrativo" filetype:pdf site:*.gov.br',
      '"contrato de locação" filetype:pdf site:*.gov.br',
      '"contrato social" filetype:pdf site:*.gov.br',
      '"contrato de honorários" filetype:pdf',
    ],
  },
  {
    pieceType: "notificacao_extrajudicial",
    label: "Notificação Extrajudicial",
    weight: 2,
    queries: [
      '"notificação extrajudicial" filetype:pdf',
      '"notificação extrajudicial" "prazo" "advogado" filetype:pdf',
      '"notificamos V.Sa." filetype:pdf site:*.gov.br',
    ],
  },
  {
    pieceType: "acordo_extrajudicial",
    label: "Acordo / Termo de Acordo",
    weight: 2,
    queries: [
      '"termo de acordo" filetype:pdf site:*.gov.br',
      '"acordo extrajudicial" filetype:pdf',
      '"termo de composição" filetype:pdf site:*.jus.br',
      '"acordo de renegociação" filetype:pdf',
      '"proposta de acordo" filetype:pdf site:*.gov.br',
    ],
  },
  {
    pieceType: "parecer",
    label: "Parecer Jurídico",
    weight: 3,
    queries: [
      '"parecer jurídico" "AGU" filetype:pdf',
      '"parecer" "PGFN" filetype:pdf site:*.gov.br',
      '"parecer" "Advocacia-Geral da União" filetype:pdf',
      '"parecer jurídico" "OAB" filetype:pdf',
      '"nota técnica" "AGU" filetype:pdf site:*.gov.br',
      '"orientação normativa" "AGU" filetype:pdf',
    ],
  },
];

// Queries adicionais por instituição/órgão (complementam as por tipo de peça)
export const INSTITUTION_QUERIES: string[] = [
  // AGU
  '"Advocacia-Geral da União" "petição" filetype:pdf',
  '"AGU" "manifestação" filetype:pdf site:*.gov.br',
  '"Procuradoria-Geral Federal" filetype:pdf site:*.gov.br',
  // PGFN
  '"Procuradoria da Fazenda Nacional" filetype:pdf',
  '"PGFN" "recurso" filetype:pdf site:*.gov.br',
  // Autarquias - PGF
  '"Procuradoria Federal" "INSS" filetype:pdf site:*.gov.br',
  '"Procuradoria Federal" "ANEEL" filetype:pdf',
  '"Procuradoria Federal" "CADE" filetype:pdf',
  '"Procuradoria Federal" "IBAMA" filetype:pdf',
  '"Procuradoria Federal" "ANVISA" filetype:pdf',
  // Tribunais diretos
  '"petição" filetype:pdf site:stj.jus.br',
  '"manifestação" filetype:pdf site:stf.jus.br',
  '"recurso" filetype:pdf site:trf1.jus.br',
  '"recurso" filetype:pdf site:trf2.jus.br',
  '"recurso" filetype:pdf site:trf3.jus.br',
  '"recurso" filetype:pdf site:trf4.jus.br',
  '"recurso" filetype:pdf site:trf5.jus.br',
];
