/**
 * Matriz de ingestão: TIPO DE PEÇA × INSTITUIÇÃO
 *
 * Estratégia cirúrgica: em vez de queries genéricas, cada célula da matriz
 * gera uma query específica — ex.: "contestação ANEEL filetype:pdf"
 *
 * Isso garante 10 exemplos reais de cada combinação no corpus.
 * Prioridade alta = indexado primeiro no scraping job.
 */

// ─── Tipos de peça processual ──────────────────────────────────────────────────

export interface PieceType {
  id: string;
  label: string;
  searchTerm: string;  // termo exato para a query
  priority: 1 | 2 | 3; // 3 = mais importante
}

export const TOP_PIECE_TYPES: PieceType[] = [
  { id: "contestacao",         label: "Contestação",              searchTerm: "contestação",              priority: 3 },
  { id: "recurso_apelacao",    label: "Apelação",                 searchTerm: "recurso de apelação",      priority: 3 },
  { id: "contrarrazoes",       label: "Contrarrazões",            searchTerm: "contrarrazões de apelação",priority: 3 },
  { id: "recurso_especial",    label: "Recurso Especial",         searchTerm: "recurso especial",         priority: 3 },
  { id: "agravo_instrumento",  label: "Agravo de Instrumento",    searchTerm: "agravo de instrumento",    priority: 2 },
  { id: "agravo_regimental",   label: "Agravo Regimental",        searchTerm: "agravo regimental",        priority: 2 },
  { id: "mandado_seguranca",   label: "Mandado de Segurança",     searchTerm: "mandado de segurança",     priority: 2 },
  { id: "execucao_fiscal",     label: "Embargos à Exec. Fiscal",  searchTerm: "embargos à execução fiscal", priority: 2 },
  { id: "recurso_extraordinario", label: "Recurso Extraordinário", searchTerm: "recurso extraordinário", priority: 2 },
  { id: "impugnacao",          label: "Impugnação",               searchTerm: "impugnação",               priority: 1 },
  { id: "peticao_inicial",     label: "Petição Inicial",          searchTerm: "petição inicial",          priority: 1 },
  { id: "parecer",             label: "Parecer Jurídico",         searchTerm: "parecer jurídico",         priority: 1 },
];

// ─── Instituições top (Procurador Federal / AGU / PGFN / PGBC) ────────────────

export interface Institution {
  id: string;
  name: string;
  searchTerm: string;  // termo exato para a query
  career: "procurador_federal" | "advogado_uniao" | "pgfn" | "pgbc";
  priority: 1 | 2 | 3; // 3 = mais importante
}

export const TOP_INSTITUTIONS: Institution[] = [
  // ── Procurador Federal (PGF — autarquias) ──────────────────────────────────
  { id: "inss",    name: "INSS",    searchTerm: "INSS",    career: "procurador_federal", priority: 3 },
  { id: "cade",    name: "CADE",    searchTerm: "CADE",    career: "procurador_federal", priority: 3 },
  { id: "aneel",   name: "ANEEL",   searchTerm: "ANEEL",   career: "procurador_federal", priority: 3 },
  { id: "anvisa",  name: "ANVISA",  searchTerm: "ANVISA",  career: "procurador_federal", priority: 3 },
  { id: "ans",     name: "ANS",     searchTerm: "ANS saúde suplementar", career: "procurador_federal", priority: 3 },
  { id: "anp",     name: "ANP",     searchTerm: "ANP petróleo",          career: "procurador_federal", priority: 2 },
  { id: "ibama",   name: "IBAMA",   searchTerm: "IBAMA",   career: "procurador_federal", priority: 2 },
  { id: "incra",   name: "INCRA",   searchTerm: "INCRA",   career: "procurador_federal", priority: 2 },
  { id: "fnde",    name: "FNDE",    searchTerm: "FNDE",    career: "procurador_federal", priority: 2 },
  { id: "inpi",    name: "INPI",    searchTerm: "INPI propriedade industrial", career: "procurador_federal", priority: 2 },
  { id: "anatel",  name: "ANATEL",  searchTerm: "ANATEL",  career: "procurador_federal", priority: 2 },
  { id: "dnit",    name: "DNIT",    searchTerm: "DNIT infraestrutura", career: "procurador_federal", priority: 1 },
  { id: "ana",     name: "ANA",     searchTerm: "ANA recursos hídricos", career: "procurador_federal", priority: 1 },
  { id: "anac",    name: "ANAC",    searchTerm: "ANAC aviação civil",    career: "procurador_federal", priority: 1 },
  // ── Advogado da União (AGU geral — União Federal) ──────────────────────────
  { id: "agu",     name: "AGU",     searchTerm: "Advocacia-Geral da União", career: "advogado_uniao", priority: 3 },
  { id: "uniao",   name: "União Federal", searchTerm: "União Federal",     career: "advogado_uniao", priority: 3 },
  // ── PGFN (Fazenda Nacional — tributário) ────────────────────────────────────
  { id: "pgfn",    name: "PGFN",    searchTerm: "Fazenda Nacional PGFN",  career: "pgfn",            priority: 3 },
  { id: "receita", name: "Receita Federal", searchTerm: "Receita Federal", career: "pgfn",            priority: 2 },
  // ── PGBC (Banco Central) ────────────────────────────────────────────────────
  { id: "pgbc",    name: "PGBC / Banco Central", searchTerm: "Banco Central PGBC", career: "pgbc",   priority: 2 },
];

// ─── Célula da matriz ──────────────────────────────────────────────────────────

export interface MatrixCell {
  pieceTypeId: string;
  institutionId: string;
  career: string;
  query: string;
  priority: number; // soma das prioridades — ordena a execução
}

/**
 * Gera a matriz completa tipo × instituição, ordenada por prioridade.
 * O scraping job itera por célula, buscando `resultsPerCell` resultados cada.
 *
 * @param onlyPieceTypes  filtra tipos de peça (opcional)
 * @param onlyInstitutions filtra instituições (opcional)
 */
export function buildQueryMatrix(options: {
  onlyPieceTypes?: string[];
  onlyInstitutions?: string[];
} = {}): MatrixCell[] {
  const pieces = options.onlyPieceTypes
    ? TOP_PIECE_TYPES.filter((p) => options.onlyPieceTypes!.includes(p.id))
    : TOP_PIECE_TYPES;

  const institutions = options.onlyInstitutions
    ? TOP_INSTITUTIONS.filter((i) => options.onlyInstitutions!.includes(i.id))
    : TOP_INSTITUTIONS;

  const cells: MatrixCell[] = [];

  for (const piece of pieces) {
    for (const inst of institutions) {
      // query cirúrgica: "tipo de peça" "Instituição" filetype:pdf
      const query = `"${piece.searchTerm}" "${inst.searchTerm}" filetype:pdf`;

      cells.push({
        pieceTypeId: piece.id,
        institutionId: inst.id,
        career: inst.career,
        query,
        priority: piece.priority + inst.priority,
      });
    }
  }

  // Ordena: maior prioridade primeiro
  return cells.sort((a, b) => b.priority - a.priority);
}

// ─── Compatibilidade com o ingestionWorker legado ──────────────────────────────
// (mantém PIECE_QUERY_SETS e INSTITUTION_QUERIES para não quebrar imports antigos)

export interface QuerySet {
  pieceType: string;
  label: string;
  queries: string[];
  weight: number;
}

// Gera PIECE_QUERY_SETS sinteticamente a partir da matriz
export const PIECE_QUERY_SETS: QuerySet[] = TOP_PIECE_TYPES.map((p) => ({
  pieceType: p.id,
  label: p.label,
  weight: p.priority,
  queries: TOP_INSTITUTIONS
    .filter((i) => i.priority >= 2)
    .map((i) => `"${p.searchTerm}" "${i.searchTerm}" filetype:pdf`),
}));

export const INSTITUTION_QUERIES: string[] = TOP_INSTITUTIONS.map(
  (i) => `"${i.searchTerm}" "petição" filetype:pdf`
);
