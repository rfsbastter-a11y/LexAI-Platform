
// Simulation of backend data and services for LexAI

export type Case = {
  id: string;
  number: string;
  title: string;
  court: string;
  status: "Ativo" | "Arquivado" | "Suspenso";
  lastUpdate: string;
  nextDeadline?: string;
  client: string;
  tags: string[];
  type: "Civil" | "Trabalhista" | "Tributário" | "Penal";
};

export const MOCK_CASES: Case[] = [
  {
    id: "1",
    number: "5001234-56.2025.8.13.0024",
    title: "Ação de Cobrança Indevida c/c Danos Morais",
    court: "TJMG - 12ª Vara Cível da Comarca de Belo Horizonte",
    status: "Ativo",
    lastUpdate: "2025-12-28T14:30:00",
    nextDeadline: "2026-01-15T18:00:00",
    client: "Indústrias Horizonte Ltda",
    tags: ["Urgente", "Liminar"],
    type: "Civil",
  },
  {
    id: "2",
    number: "1009876-43.2024.5.03.0001",
    title: "Reclamação Trabalhista - Horas Extras",
    court: "TRT3 - 1ª Vara do Trabalho de Belo Horizonte",
    status: "Ativo",
    lastUpdate: "2025-12-20T09:15:00",
    client: "Roberto Silva (Ex-funcionário)",
    tags: ["Audiência Marcada"],
    type: "Trabalhista",
  },
  {
    id: "3",
    number: "0023456-78.2023.4.01.3800",
    title: "Execução Fiscal - ICMS",
    court: "TRF1 - 5ª Vara Federal",
    status: "Suspenso",
    lastUpdate: "2025-11-10T11:00:00",
    client: "Comércio Varejista Central S.A.",
    tags: ["Complexo", "Tributário"],
    type: "Tributário",
  },
];

export const DATAJUD_TIMELINE_MOCK = [
  {
    date: "2025-12-28",
    description: "Expedição de intimação para manifestação sobre laudo pericial",
    type: "Intimação",
    source: "DJe",
  },
  {
    date: "2025-12-15",
    description: "Juntada de Petição de Quesitos",
    type: "Movimentação",
    source: "PJe",
  },
  {
    date: "2025-12-01",
    description: "Despacho ordenando perícia contábil",
    type: "Decisão",
    source: "Magistrado",
  },
];

export const DASHBOARD_STATS = {
  urgentDeadlines: 3,
  activeCases: 142,
  monthlyBilling: "R$ 45.230,00",
  newCasesThisMonth: 8,
};

export const RECENT_DOCS = [
  { title: "Contestação - Indústrias Horizonte.docx", type: "DOCX", date: "Há 2 horas" },
  { title: "Procuração - Aditivo.pdf", type: "PDF", date: "Há 5 horas" },
  { title: "Relatório de Auditoria.xlsx", type: "XLSX", date: "Ontem" },
];
