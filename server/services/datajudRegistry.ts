export interface TribunalInfo {
  sigla: string;
  nome: string;
  endpoint: string;
  segmento: string;
  justicaCode: string;
  segmentoCode: string;
  graus: string[];
}

export const TRIBUNAIS_REGISTRY: TribunalInfo[] = [
  // Justiça Estadual (código 8)
  { sigla: "TJAC", nome: "Tribunal de Justiça do Acre", endpoint: "api_publica_tjac", segmento: "estadual", justicaCode: "8", segmentoCode: "01", graus: ["G1", "G2", "JE"] },
  { sigla: "TJAL", nome: "Tribunal de Justiça de Alagoas", endpoint: "api_publica_tjal", segmento: "estadual", justicaCode: "8", segmentoCode: "02", graus: ["G1", "G2", "JE"] },
  { sigla: "TJAP", nome: "Tribunal de Justiça do Amapá", endpoint: "api_publica_tjap", segmento: "estadual", justicaCode: "8", segmentoCode: "03", graus: ["G1", "G2", "JE"] },
  { sigla: "TJAM", nome: "Tribunal de Justiça do Amazonas", endpoint: "api_publica_tjam", segmento: "estadual", justicaCode: "8", segmentoCode: "04", graus: ["G1", "G2", "JE"] },
  { sigla: "TJBA", nome: "Tribunal de Justiça da Bahia", endpoint: "api_publica_tjba", segmento: "estadual", justicaCode: "8", segmentoCode: "05", graus: ["G1", "G2", "JE"] },
  { sigla: "TJCE", nome: "Tribunal de Justiça do Ceará", endpoint: "api_publica_tjce", segmento: "estadual", justicaCode: "8", segmentoCode: "06", graus: ["G1", "G2", "JE"] },
  { sigla: "TJDFT", nome: "Tribunal de Justiça do Distrito Federal e Territórios", endpoint: "api_publica_tjdft", segmento: "estadual", justicaCode: "8", segmentoCode: "07", graus: ["G1", "G2", "JE"] },
  { sigla: "TJES", nome: "Tribunal de Justiça do Espírito Santo", endpoint: "api_publica_tjes", segmento: "estadual", justicaCode: "8", segmentoCode: "08", graus: ["G1", "G2", "JE"] },
  { sigla: "TJGO", nome: "Tribunal de Justiça de Goiás", endpoint: "api_publica_tjgo", segmento: "estadual", justicaCode: "8", segmentoCode: "09", graus: ["G1", "G2", "JE"] },
  { sigla: "TJMA", nome: "Tribunal de Justiça do Maranhão", endpoint: "api_publica_tjma", segmento: "estadual", justicaCode: "8", segmentoCode: "10", graus: ["G1", "G2", "JE"] },
  { sigla: "TJMT", nome: "Tribunal de Justiça de Mato Grosso", endpoint: "api_publica_tjmt", segmento: "estadual", justicaCode: "8", segmentoCode: "11", graus: ["G1", "G2", "JE"] },
  { sigla: "TJMS", nome: "Tribunal de Justiça de Mato Grosso do Sul", endpoint: "api_publica_tjms", segmento: "estadual", justicaCode: "8", segmentoCode: "12", graus: ["G1", "G2", "JE"] },
  { sigla: "TJMG", nome: "Tribunal de Justiça de Minas Gerais", endpoint: "api_publica_tjmg", segmento: "estadual", justicaCode: "8", segmentoCode: "13", graus: ["G1", "G2", "JE"] },
  { sigla: "TJPA", nome: "Tribunal de Justiça do Pará", endpoint: "api_publica_tjpa", segmento: "estadual", justicaCode: "8", segmentoCode: "14", graus: ["G1", "G2", "JE"] },
  { sigla: "TJPB", nome: "Tribunal de Justiça da Paraíba", endpoint: "api_publica_tjpb", segmento: "estadual", justicaCode: "8", segmentoCode: "15", graus: ["G1", "G2", "JE"] },
  { sigla: "TJPR", nome: "Tribunal de Justiça do Paraná", endpoint: "api_publica_tjpr", segmento: "estadual", justicaCode: "8", segmentoCode: "16", graus: ["G1", "G2", "JE"] },
  { sigla: "TJPE", nome: "Tribunal de Justiça de Pernambuco", endpoint: "api_publica_tjpe", segmento: "estadual", justicaCode: "8", segmentoCode: "17", graus: ["G1", "G2", "JE"] },
  { sigla: "TJPI", nome: "Tribunal de Justiça do Piauí", endpoint: "api_publica_tjpi", segmento: "estadual", justicaCode: "8", segmentoCode: "18", graus: ["G1", "G2", "JE"] },
  { sigla: "TJRJ", nome: "Tribunal de Justiça do Rio de Janeiro", endpoint: "api_publica_tjrj", segmento: "estadual", justicaCode: "8", segmentoCode: "19", graus: ["G1", "G2", "JE"] },
  { sigla: "TJRN", nome: "Tribunal de Justiça do Rio Grande do Norte", endpoint: "api_publica_tjrn", segmento: "estadual", justicaCode: "8", segmentoCode: "20", graus: ["G1", "G2", "JE"] },
  { sigla: "TJRS", nome: "Tribunal de Justiça do Rio Grande do Sul", endpoint: "api_publica_tjrs", segmento: "estadual", justicaCode: "8", segmentoCode: "21", graus: ["G1", "G2", "JE"] },
  { sigla: "TJRO", nome: "Tribunal de Justiça de Rondônia", endpoint: "api_publica_tjro", segmento: "estadual", justicaCode: "8", segmentoCode: "22", graus: ["G1", "G2", "JE"] },
  { sigla: "TJRR", nome: "Tribunal de Justiça de Roraima", endpoint: "api_publica_tjrr", segmento: "estadual", justicaCode: "8", segmentoCode: "23", graus: ["G1", "G2", "JE"] },
  { sigla: "TJSC", nome: "Tribunal de Justiça de Santa Catarina", endpoint: "api_publica_tjsc", segmento: "estadual", justicaCode: "8", segmentoCode: "24", graus: ["G1", "G2", "JE"] },
  { sigla: "TJSE", nome: "Tribunal de Justiça de Sergipe", endpoint: "api_publica_tjse", segmento: "estadual", justicaCode: "8", segmentoCode: "25", graus: ["G1", "G2", "JE"] },
  { sigla: "TJSP", nome: "Tribunal de Justiça de São Paulo", endpoint: "api_publica_tjsp", segmento: "estadual", justicaCode: "8", segmentoCode: "26", graus: ["G1", "G2", "JE"] },
  { sigla: "TJTO", nome: "Tribunal de Justiça do Tocantins", endpoint: "api_publica_tjto", segmento: "estadual", justicaCode: "8", segmentoCode: "27", graus: ["G1", "G2", "JE"] },

  // Justiça do Trabalho (código 5)
  { sigla: "TRT1", nome: "Tribunal Regional do Trabalho da 1ª Região (RJ)", endpoint: "api_publica_trt1", segmento: "trabalho", justicaCode: "5", segmentoCode: "01", graus: ["G1", "G2"] },
  { sigla: "TRT2", nome: "Tribunal Regional do Trabalho da 2ª Região (SP)", endpoint: "api_publica_trt2", segmento: "trabalho", justicaCode: "5", segmentoCode: "02", graus: ["G1", "G2"] },
  { sigla: "TRT3", nome: "Tribunal Regional do Trabalho da 3ª Região (MG)", endpoint: "api_publica_trt3", segmento: "trabalho", justicaCode: "5", segmentoCode: "03", graus: ["G1", "G2"] },
  { sigla: "TRT4", nome: "Tribunal Regional do Trabalho da 4ª Região (RS)", endpoint: "api_publica_trt4", segmento: "trabalho", justicaCode: "5", segmentoCode: "04", graus: ["G1", "G2"] },
  { sigla: "TRT5", nome: "Tribunal Regional do Trabalho da 5ª Região (BA)", endpoint: "api_publica_trt5", segmento: "trabalho", justicaCode: "5", segmentoCode: "05", graus: ["G1", "G2"] },
  { sigla: "TRT6", nome: "Tribunal Regional do Trabalho da 6ª Região (PE)", endpoint: "api_publica_trt6", segmento: "trabalho", justicaCode: "5", segmentoCode: "06", graus: ["G1", "G2"] },
  { sigla: "TRT7", nome: "Tribunal Regional do Trabalho da 7ª Região (CE)", endpoint: "api_publica_trt7", segmento: "trabalho", justicaCode: "5", segmentoCode: "07", graus: ["G1", "G2"] },
  { sigla: "TRT8", nome: "Tribunal Regional do Trabalho da 8ª Região (PA/AP)", endpoint: "api_publica_trt8", segmento: "trabalho", justicaCode: "5", segmentoCode: "08", graus: ["G1", "G2"] },
  { sigla: "TRT9", nome: "Tribunal Regional do Trabalho da 9ª Região (PR)", endpoint: "api_publica_trt9", segmento: "trabalho", justicaCode: "5", segmentoCode: "09", graus: ["G1", "G2"] },
  { sigla: "TRT10", nome: "Tribunal Regional do Trabalho da 10ª Região (DF/TO)", endpoint: "api_publica_trt10", segmento: "trabalho", justicaCode: "5", segmentoCode: "10", graus: ["G1", "G2"] },
  { sigla: "TRT11", nome: "Tribunal Regional do Trabalho da 11ª Região (AM/RR)", endpoint: "api_publica_trt11", segmento: "trabalho", justicaCode: "5", segmentoCode: "11", graus: ["G1", "G2"] },
  { sigla: "TRT12", nome: "Tribunal Regional do Trabalho da 12ª Região (SC)", endpoint: "api_publica_trt12", segmento: "trabalho", justicaCode: "5", segmentoCode: "12", graus: ["G1", "G2"] },
  { sigla: "TRT13", nome: "Tribunal Regional do Trabalho da 13ª Região (PB)", endpoint: "api_publica_trt13", segmento: "trabalho", justicaCode: "5", segmentoCode: "13", graus: ["G1", "G2"] },
  { sigla: "TRT14", nome: "Tribunal Regional do Trabalho da 14ª Região (RO/AC)", endpoint: "api_publica_trt14", segmento: "trabalho", justicaCode: "5", segmentoCode: "14", graus: ["G1", "G2"] },
  { sigla: "TRT15", nome: "Tribunal Regional do Trabalho da 15ª Região (Campinas)", endpoint: "api_publica_trt15", segmento: "trabalho", justicaCode: "5", segmentoCode: "15", graus: ["G1", "G2"] },
  { sigla: "TRT16", nome: "Tribunal Regional do Trabalho da 16ª Região (MA)", endpoint: "api_publica_trt16", segmento: "trabalho", justicaCode: "5", segmentoCode: "16", graus: ["G1", "G2"] },
  { sigla: "TRT17", nome: "Tribunal Regional do Trabalho da 17ª Região (ES)", endpoint: "api_publica_trt17", segmento: "trabalho", justicaCode: "5", segmentoCode: "17", graus: ["G1", "G2"] },
  { sigla: "TRT18", nome: "Tribunal Regional do Trabalho da 18ª Região (GO)", endpoint: "api_publica_trt18", segmento: "trabalho", justicaCode: "5", segmentoCode: "18", graus: ["G1", "G2"] },
  { sigla: "TRT19", nome: "Tribunal Regional do Trabalho da 19ª Região (AL)", endpoint: "api_publica_trt19", segmento: "trabalho", justicaCode: "5", segmentoCode: "19", graus: ["G1", "G2"] },
  { sigla: "TRT20", nome: "Tribunal Regional do Trabalho da 20ª Região (SE)", endpoint: "api_publica_trt20", segmento: "trabalho", justicaCode: "5", segmentoCode: "20", graus: ["G1", "G2"] },
  { sigla: "TRT21", nome: "Tribunal Regional do Trabalho da 21ª Região (RN)", endpoint: "api_publica_trt21", segmento: "trabalho", justicaCode: "5", segmentoCode: "21", graus: ["G1", "G2"] },
  { sigla: "TRT22", nome: "Tribunal Regional do Trabalho da 22ª Região (PI)", endpoint: "api_publica_trt22", segmento: "trabalho", justicaCode: "5", segmentoCode: "22", graus: ["G1", "G2"] },
  { sigla: "TRT23", nome: "Tribunal Regional do Trabalho da 23ª Região (MT)", endpoint: "api_publica_trt23", segmento: "trabalho", justicaCode: "5", segmentoCode: "23", graus: ["G1", "G2"] },
  { sigla: "TRT24", nome: "Tribunal Regional do Trabalho da 24ª Região (MS)", endpoint: "api_publica_trt24", segmento: "trabalho", justicaCode: "5", segmentoCode: "24", graus: ["G1", "G2"] },
  { sigla: "TST", nome: "Tribunal Superior do Trabalho", endpoint: "api_publica_tst", segmento: "trabalho", justicaCode: "5", segmentoCode: "00", graus: ["G3"] },

  // Justiça Federal (código 4)
  { sigla: "TRF1", nome: "Tribunal Regional Federal da 1ª Região", endpoint: "api_publica_trf1", segmento: "federal", justicaCode: "4", segmentoCode: "01", graus: ["G1", "G2"] },
  { sigla: "TRF2", nome: "Tribunal Regional Federal da 2ª Região", endpoint: "api_publica_trf2", segmento: "federal", justicaCode: "4", segmentoCode: "02", graus: ["G1", "G2"] },
  { sigla: "TRF3", nome: "Tribunal Regional Federal da 3ª Região", endpoint: "api_publica_trf3", segmento: "federal", justicaCode: "4", segmentoCode: "03", graus: ["G1", "G2"] },
  { sigla: "TRF4", nome: "Tribunal Regional Federal da 4ª Região", endpoint: "api_publica_trf4", segmento: "federal", justicaCode: "4", segmentoCode: "04", graus: ["G1", "G2"] },
  { sigla: "TRF5", nome: "Tribunal Regional Federal da 5ª Região", endpoint: "api_publica_trf5", segmento: "federal", justicaCode: "4", segmentoCode: "05", graus: ["G1", "G2"] },
  { sigla: "TRF6", nome: "Tribunal Regional Federal da 6ª Região", endpoint: "api_publica_trf6", segmento: "federal", justicaCode: "4", segmentoCode: "06", graus: ["G1", "G2"] },

  // Justiça Eleitoral (código 6)
  { sigla: "TSE", nome: "Tribunal Superior Eleitoral", endpoint: "api_publica_tse", segmento: "eleitoral", justicaCode: "6", segmentoCode: "00", graus: ["G3"] },
  { sigla: "TRE-AC", nome: "Tribunal Regional Eleitoral do Acre", endpoint: "api_publica_tre-ac", segmento: "eleitoral", justicaCode: "6", segmentoCode: "01", graus: ["G1", "G2"] },
  { sigla: "TRE-AL", nome: "Tribunal Regional Eleitoral de Alagoas", endpoint: "api_publica_tre-al", segmento: "eleitoral", justicaCode: "6", segmentoCode: "02", graus: ["G1", "G2"] },
  { sigla: "TRE-AP", nome: "Tribunal Regional Eleitoral do Amapá", endpoint: "api_publica_tre-ap", segmento: "eleitoral", justicaCode: "6", segmentoCode: "03", graus: ["G1", "G2"] },
  { sigla: "TRE-AM", nome: "Tribunal Regional Eleitoral do Amazonas", endpoint: "api_publica_tre-am", segmento: "eleitoral", justicaCode: "6", segmentoCode: "04", graus: ["G1", "G2"] },
  { sigla: "TRE-BA", nome: "Tribunal Regional Eleitoral da Bahia", endpoint: "api_publica_tre-ba", segmento: "eleitoral", justicaCode: "6", segmentoCode: "05", graus: ["G1", "G2"] },
  { sigla: "TRE-CE", nome: "Tribunal Regional Eleitoral do Ceará", endpoint: "api_publica_tre-ce", segmento: "eleitoral", justicaCode: "6", segmentoCode: "06", graus: ["G1", "G2"] },
  { sigla: "TRE-DF", nome: "Tribunal Regional Eleitoral do Distrito Federal", endpoint: "api_publica_tre-df", segmento: "eleitoral", justicaCode: "6", segmentoCode: "07", graus: ["G1", "G2"] },
  { sigla: "TRE-ES", nome: "Tribunal Regional Eleitoral do Espírito Santo", endpoint: "api_publica_tre-es", segmento: "eleitoral", justicaCode: "6", segmentoCode: "08", graus: ["G1", "G2"] },
  { sigla: "TRE-GO", nome: "Tribunal Regional Eleitoral de Goiás", endpoint: "api_publica_tre-go", segmento: "eleitoral", justicaCode: "6", segmentoCode: "09", graus: ["G1", "G2"] },
  { sigla: "TRE-MA", nome: "Tribunal Regional Eleitoral do Maranhão", endpoint: "api_publica_tre-ma", segmento: "eleitoral", justicaCode: "6", segmentoCode: "10", graus: ["G1", "G2"] },
  { sigla: "TRE-MT", nome: "Tribunal Regional Eleitoral de Mato Grosso", endpoint: "api_publica_tre-mt", segmento: "eleitoral", justicaCode: "6", segmentoCode: "11", graus: ["G1", "G2"] },
  { sigla: "TRE-MS", nome: "Tribunal Regional Eleitoral de Mato Grosso do Sul", endpoint: "api_publica_tre-ms", segmento: "eleitoral", justicaCode: "6", segmentoCode: "12", graus: ["G1", "G2"] },
  { sigla: "TRE-MG", nome: "Tribunal Regional Eleitoral de Minas Gerais", endpoint: "api_publica_tre-mg", segmento: "eleitoral", justicaCode: "6", segmentoCode: "13", graus: ["G1", "G2"] },
  { sigla: "TRE-PA", nome: "Tribunal Regional Eleitoral do Pará", endpoint: "api_publica_tre-pa", segmento: "eleitoral", justicaCode: "6", segmentoCode: "14", graus: ["G1", "G2"] },
  { sigla: "TRE-PB", nome: "Tribunal Regional Eleitoral da Paraíba", endpoint: "api_publica_tre-pb", segmento: "eleitoral", justicaCode: "6", segmentoCode: "15", graus: ["G1", "G2"] },
  { sigla: "TRE-PR", nome: "Tribunal Regional Eleitoral do Paraná", endpoint: "api_publica_tre-pr", segmento: "eleitoral", justicaCode: "6", segmentoCode: "16", graus: ["G1", "G2"] },
  { sigla: "TRE-PE", nome: "Tribunal Regional Eleitoral de Pernambuco", endpoint: "api_publica_tre-pe", segmento: "eleitoral", justicaCode: "6", segmentoCode: "17", graus: ["G1", "G2"] },
  { sigla: "TRE-PI", nome: "Tribunal Regional Eleitoral do Piauí", endpoint: "api_publica_tre-pi", segmento: "eleitoral", justicaCode: "6", segmentoCode: "18", graus: ["G1", "G2"] },
  { sigla: "TRE-RJ", nome: "Tribunal Regional Eleitoral do Rio de Janeiro", endpoint: "api_publica_tre-rj", segmento: "eleitoral", justicaCode: "6", segmentoCode: "19", graus: ["G1", "G2"] },
  { sigla: "TRE-RN", nome: "Tribunal Regional Eleitoral do Rio Grande do Norte", endpoint: "api_publica_tre-rn", segmento: "eleitoral", justicaCode: "6", segmentoCode: "20", graus: ["G1", "G2"] },
  { sigla: "TRE-RS", nome: "Tribunal Regional Eleitoral do Rio Grande do Sul", endpoint: "api_publica_tre-rs", segmento: "eleitoral", justicaCode: "6", segmentoCode: "21", graus: ["G1", "G2"] },
  { sigla: "TRE-RO", nome: "Tribunal Regional Eleitoral de Rondônia", endpoint: "api_publica_tre-ro", segmento: "eleitoral", justicaCode: "6", segmentoCode: "22", graus: ["G1", "G2"] },
  { sigla: "TRE-RR", nome: "Tribunal Regional Eleitoral de Roraima", endpoint: "api_publica_tre-rr", segmento: "eleitoral", justicaCode: "6", segmentoCode: "23", graus: ["G1", "G2"] },
  { sigla: "TRE-SC", nome: "Tribunal Regional Eleitoral de Santa Catarina", endpoint: "api_publica_tre-sc", segmento: "eleitoral", justicaCode: "6", segmentoCode: "24", graus: ["G1", "G2"] },
  { sigla: "TRE-SE", nome: "Tribunal Regional Eleitoral de Sergipe", endpoint: "api_publica_tre-se", segmento: "eleitoral", justicaCode: "6", segmentoCode: "25", graus: ["G1", "G2"] },
  { sigla: "TRE-SP", nome: "Tribunal Regional Eleitoral de São Paulo", endpoint: "api_publica_tre-sp", segmento: "eleitoral", justicaCode: "6", segmentoCode: "26", graus: ["G1", "G2"] },
  { sigla: "TRE-TO", nome: "Tribunal Regional Eleitoral do Tocantins", endpoint: "api_publica_tre-to", segmento: "eleitoral", justicaCode: "6", segmentoCode: "27", graus: ["G1", "G2"] },

  // Justiça Militar (código 7)
  { sigla: "STM", nome: "Superior Tribunal Militar", endpoint: "api_publica_stm", segmento: "militar", justicaCode: "7", segmentoCode: "00", graus: ["G3"] },
  { sigla: "TJMMG", nome: "Tribunal de Justiça Militar de Minas Gerais", endpoint: "api_publica_tjmmg", segmento: "militar_estadual", justicaCode: "7", segmentoCode: "13", graus: ["G1", "G2"] },
  { sigla: "TJMRS", nome: "Tribunal de Justiça Militar do Rio Grande do Sul", endpoint: "api_publica_tjmrs", segmento: "militar_estadual", justicaCode: "7", segmentoCode: "21", graus: ["G1", "G2"] },
  { sigla: "TJMSP", nome: "Tribunal de Justiça Militar de São Paulo", endpoint: "api_publica_tjmsp", segmento: "militar_estadual", justicaCode: "7", segmentoCode: "26", graus: ["G1", "G2"] },

  // Tribunais Superiores
  { sigla: "STF", nome: "Supremo Tribunal Federal", endpoint: "api_publica_stf", segmento: "superior", justicaCode: "1", segmentoCode: "00", graus: ["STF"] },
  { sigla: "STJ", nome: "Superior Tribunal de Justiça", endpoint: "api_publica_stj", segmento: "superior", justicaCode: "2", segmentoCode: "00", graus: ["STJ"] },
  { sigla: "CNJ", nome: "Conselho Nacional de Justiça", endpoint: "api_publica_cnj", segmento: "superior", justicaCode: "9", segmentoCode: "00", graus: ["CNJ"] },
];

export function getTribunalByCode(justicaCode: string, segmentoCode: string): TribunalInfo | undefined {
  return TRIBUNAIS_REGISTRY.find(t => t.justicaCode === justicaCode && t.segmentoCode === segmentoCode);
}

export function getTribunalBySigla(sigla: string): TribunalInfo | undefined {
  return TRIBUNAIS_REGISTRY.find(t => t.sigla.toUpperCase() === sigla.toUpperCase());
}

export function getTribunalsBySegmento(segmento: string): TribunalInfo[] {
  return TRIBUNAIS_REGISTRY.filter(t => t.segmento === segmento);
}

export function getAllTribunais(): TribunalInfo[] {
  return TRIBUNAIS_REGISTRY;
}

export function parseCaseNumber(caseNumber: string): { justicaCode: string; segmentoCode: string; tribunal: TribunalInfo | undefined } | null {
  const cleanNumber = caseNumber.replace(/\D/g, "");
  if (cleanNumber.length !== 20) return null;
  
  const justicaCode = cleanNumber.charAt(13);
  const segmentoCode = cleanNumber.substring(14, 16);
  
  const tribunal = getTribunalByCode(justicaCode, segmentoCode);
  
  return { justicaCode, segmentoCode, tribunal };
}
