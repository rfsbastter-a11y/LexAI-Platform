import { describeSecretaryActionCapabilities, describeSecretaryQueryCapabilities, getSecretaryQueryNames } from "./secretaryCapabilities";

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
      description: `Executa ações no sistema LexAI como agente autônomo. Sócios podem executar todas as operações de escrita e leitura: clientes, devedores, processos, prazos, agenda, contratos, faturas/cobranças, documentos, relatórios, peças jurídicas e contratos/acordos via Studio. Clientes só podem gerar relatório/consulta dos próprios dados. Ações disponíveis:\n${describeSecretaryActionCapabilities()}`,
      parameters: {
        type: "object",
        properties: {
          acao: {
            type: "string",
            description: "Nome natural da operação a executar. Exemplos: contatar_terceiro, agendar_evento, atualizar_evento, criar_prazo, criar_fatura, atualizar_fatura, criar_contrato, atualizar_processo, cadastrar_cliente, atualizar_cliente, cadastrar_devedor, atualizar_devedor, cadastrar_processo, gerar_peca_estudio, gerar_contrato, gerar_relatorio_executivo.",
          },
          clientName: { type: "string", description: "Nome do cliente" },
          debtorName: { type: "string", description: "Nome do devedor ou da parte contrária" },
          targetName: { type: "string", description: "Nome da pessoa que deve ser contatada por WhatsApp." },
          targetPhone: { type: "string", description: "Telefone/WhatsApp da pessoa que deve ser contatada." },
          targetMessage: { type: "string", description: "Mensagem exata ou sugerida para enviar ao terceiro." },
          objective: { type: "string", description: "Objetivo da tarefa delegada: marcar reunião, confirmar disponibilidade, agendar motorista, cobrar retorno, etc." },
          taskType: { type: "string", description: "Tipo da tarefa delegada: agendamento, motorista, recado, cobranca, outro." },
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
          eventId: { type: "number", description: "ID do evento de agenda quando for atualizar_evento." },
          invoiceId: { type: "number", description: "ID da fatura quando for atualizar_fatura." },
          invoiceNumber: { type: "string", description: "Número da fatura/cobrança." },
          referenceMonth: { type: "string", description: "Mês de referência da fatura no formato YYYY-MM." },
          paidAt: { type: "string", description: "Data de pagamento no formato YYYY-MM-DD." },
          paidAmount: { type: "string", description: "Valor efetivamente pago." },
          contractId: { type: "number", description: "ID do contrato quando conhecido." },
          responsible: { type: "string", description: "Responsável pelo compromisso/agendamento" },
          amount: { type: "string", description: "Valor monetário relacionado ao contrato/prazo/fatura quando aplicável" },
          status: { type: "string", description: "Status para processo, contrato ou prazo" },
          isStrategic: { type: "boolean", description: "Use para marcar/desmarcar processo estratégico." },
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
