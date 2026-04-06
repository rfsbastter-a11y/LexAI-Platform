import { describeSecretaryQueryCapabilities, getSecretaryActionNames, getSecretaryQueryNames } from "./secretaryCapabilities";

export function createSecretaryWebSearchTool() {
  return {
    type: "function" as const,
    function: {
      name: "pesquisar_web",
      description: "Pesquisa informações atualizadas na internet. USE SEMPRE para: dúvidas jurídicas, legislação, jurisprudência, artigos de lei, informações que precisam ser precisas e atualizadas. É melhor pesquisar do que responder de memória.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Termo de busca em português. Ex: 'obrigado soprar bafômetro legislação Brasil CTB'",
          },
        },
        required: ["query"],
      },
    },
  };
}

export function createSecretarySystemQueryTool() {
  return {
    type: "function" as const,
    function: {
      name: "consultar_sistema",
      description: "Consulta dados do sistema LexAI. Use quando o remetente pedir informações sobre clientes, processos, financeiro, prazos, agenda, contratos ou negociações. Sócios podem acessar todos os dados. Clientes só veem seus próprios dados.",
      parameters: {
        type: "object",
        properties: {
          tipo_consulta: {
            type: "string",
            enum: getSecretaryQueryNames(),
            description: `Tipo de consulta: ${describeSecretaryQueryCapabilities()}`,
          },
          nome_cliente: {
            type: "string",
            description: "Nome do cliente (para filtrar). Opcional.",
          },
          debtorName: {
            type: "string",
            description: "Nome do devedor (para consultas de documentos e acordos). Opcional.",
          },
          data: {
            type: "string",
            description: "Data no formato YYYY-MM-DD (para consulta de agenda). Opcional.",
          },
        },
        required: ["tipo_consulta"],
      },
    },
  };
}

export function createSecretaryActionTool() {
  return {
    type: "function" as const,
    function: {
      name: "executar_acao",
      description: "Executa ações no sistema LexAI como agente autônomo. Para sócios: cadastrar devedores/clientes, gerar peças jurídicas, gerar contratos/acordos, gerar relatório executivo do escritório e enviar documentos já arquivados. Para clientes: gerar relatório dos seus dados.",
      parameters: {
        type: "object",
        properties: {
          acao: {
            type: "string",
            enum: getSecretaryActionNames(),
            description: "Tipo de ação disponível no catálogo oficial da secretária. Inclui cadastros, atualizações, geração de peça, geração de contrato e relatórios.",
          },
          clientName: { type: "string", description: "Nome do cliente" },
          debtorName: { type: "string", description: "Nome do devedor ou da parte contrária" },
          name: { type: "string", description: "Nome (para cadastro de cliente)" },
          document: { type: "string", description: "CPF ou CNPJ" },
          phone: { type: "string", description: "Telefone" },
          email: { type: "string", description: "E-mail" },
          address: { type: "string", description: "Endereço completo (rua, número, bairro, cidade/UF, CEP)" },
          notes: { type: "string", description: "Observações/notas adicionais (representante, parentesco, cargo, etc.)" },
          caseNumber: { type: "string", description: "Número do processo (formato CNJ)" },
          title: { type: "string", description: "Título de processo, prazo ou compromisso" },
          caseType: { type: "string", description: "Tipo do processo: civil, trabalhista, tributario, criminal, etc." },
          court: { type: "string", description: "Tribunal/vara competente" },
          dueDate: { type: "string", description: "Data de vencimento ou prazo no formato YYYY-MM-DD" },
          date: { type: "string", description: "Data do compromisso no formato YYYY-MM-DD" },
          timeStart: { type: "string", description: "Horário inicial no formato HH:MM" },
          timeEnd: { type: "string", description: "Horário final no formato HH:MM" },
          responsible: { type: "string", description: "Responsável pelo compromisso/agendamento" },
          amount: { type: "string", description: "Valor monetário relacionado ao contrato/prazo/fatura quando aplicável" },
          status: { type: "string", description: "Status para processo, contrato ou prazo" },
          startDate: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
          endDate: { type: "string", description: "Data final no formato YYYY-MM-DD" },
          reportType: { type: "string", description: "Tipo de relatório: geral, processos, financeiro" },
          documentType: { type: "string", description: "Tipo do documento: procuração, contrato, guia, comprovante, etc." },
          templateType: { type: "string", description: "Tipo exato da peça quando acao=gerar_peca_estudio." },
          description: { type: "string", description: "Descrição completa com os detalhes fornecidos pelo usuário ou sócio." },
          confirmed: { type: "boolean", description: "Use true apenas quando houver confirmação humana explícita para ação sensível." },
        },
        required: ["acao"],
      },
    },
  };
}
