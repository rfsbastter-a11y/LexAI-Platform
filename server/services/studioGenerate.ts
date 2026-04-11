import { aiService } from "./ai";
import { storage } from "../storage";
import { getPromptForType, promptMestreRecursal, travasModeloPadraoHonestidade, regrasCompletudeInteligente } from "./studioPromptLibrary";

interface StudioGenerateParams {
  prompt: string;
  templateType: string;
  attorney?: string;
  attorneys?: string[];
  systemContext?: string;
  files?: Array<{
    name: string;
    type: string;
    data: string;
    extractedText?: string;
    isReferenceModel?: boolean;
  }>;
  selectedJurisprudence?: Array<{
    title: string;
    summary?: string;
    ementa?: string;
    legalThesis?: string;
    court?: string;
    caseNumber?: string;
    citationABNT?: string;
  }>;
  selectedDoctrine?: Array<{
    title: string;
    summary?: string;
    citationABNT?: string;
  }>;
  tenantId?: number;
}

interface StudioGenerateResult {
  contentHtml: string;
  content: string;
  citations: any[];
  tokensUsed: number;
}

  export async function generateStudioPiece(params: StudioGenerateParams): Promise<StudioGenerateResult> {
    const { prompt, templateType, attorney, systemContext } = params;
    const files = params.files || [];
    const selectedJurisprudence = params.selectedJurisprudence || [];
    const selectedDoctrine = params.selectedDoctrine || [];

    const attorneyMap: Record<string, { name: string; oab: string }> = {
    ronald: { name: "Ronald Ferreira Serra", oab: "OAB/DF 23.947" },
    pedro: { name: "Pedro César N. F. Marques de Sousa", oab: "OAB/DF 57.058" },
  };
  const selectedAtty = attorneyMap[attorney || "pedro"] || attorneyMap.pedro;
  const multipleAttorneys = params.attorneys && params.attorneys.length > 1
    ? params.attorneys.map(a => attorneyMap[a] || attorneyMap.pedro).filter((v, i, arr) => arr.findIndex(x => x.name === v.name) === i)
    : null;

  const brasiliaDate = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });
  let contextBuilder = `TIPO DE PEÇA: ${templateType}\nDATA DE HOJE (Brasília): ${brasiliaDate}\nLOCAL: Brasília/DF\n\nINSTRUÇÕES DO USUÁRIO:\n${prompt}\n\n`;

  interface PartyFieldMap {
    nome?: string;
    cpfCnpj?: string;
    endereco?: string;
    cidadeUf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
    tipo?: string;
  }
  const extractedClientFields: PartyFieldMap = {};
  const extractedDebtorFields: PartyFieldMap = {};
  let partiesSystemBlock = "";

  if (systemContext) {
    const parseFieldsFromLines = (lines: string[], target: PartyFieldMap) => {
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || /^===/.test(trimmed)) continue;

        const tipoM = trimmed.match(/^Tipo:\s*(.+)/i);
        if (tipoM) { target.tipo = tipoM[1].trim(); continue; }
        const docM = trimmed.match(/^Documento\s*\(CPF\/CNPJ\):\s*(.+)/i);
        if (docM) { target.cpfCnpj = docM[1].trim(); continue; }
        const docM2 = trimmed.match(/^Documento:\s*(.+)/i);
        if (docM2 && !target.cpfCnpj) { target.cpfCnpj = docM2[1].trim(); continue; }
        const emailM = trimmed.match(/^Email:\s*(.+)/i);
        if (emailM) { target.email = emailM[1].trim(); continue; }
        const phoneM = trimmed.match(/^Telefone:\s*(.+)/i);
        if (phoneM) { target.telefone = phoneM[1].trim(); continue; }
        const addrM = trimmed.match(/^Endere[çc]o(?:\s+completo)?:\s*(.+)/i);
        if (addrM) { target.endereco = addrM[1].trim(); continue; }
        const cityM = trimmed.match(/^Cidade:\s*(.+)/i);
        if (cityM) { target.cidadeUf = cityM[1].trim(); continue; }
        const stateM = trimmed.match(/^Estado:\s*(.+)/i);
        if (stateM) { target.cidadeUf = (target.cidadeUf || "") + (target.cidadeUf ? "/" : "") + stateM[1].trim(); continue; }
        const cepM = trimmed.match(/^CEP:\s*(.+)/i);
        if (cepM) { target.cep = cepM[1].trim(); continue; }
        const nameExecM = trimmed.match(/^NOME\s+(?:COMPLETO\s+)?(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (nameExecM) { target.nome = nameExecM[1].trim(); continue; }
        const cpfExecM = trimmed.match(/^CPF\/CNPJ\s+(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (cpfExecM) { target.cpfCnpj = cpfExecM[1].trim(); continue; }
        const addrExecM = trimmed.match(/^ENDERE[ÇC]O\s+(?:COMPLETO\s+)?(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (addrExecM) { target.endereco = addrExecM[1].trim(); continue; }
        const cityExecM = trimmed.match(/^CIDADE\/UF\s+(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (cityExecM) { target.cidadeUf = cityExecM[1].trim(); continue; }
        const cepExecM = trimmed.match(/^CEP\s+(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (cepExecM) { target.cep = cepExecM[1].trim(); continue; }
        const phoneExecM = trimmed.match(/^TELEFONE\s+(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (phoneExecM) { target.telefone = phoneExecM[1].trim(); continue; }
        const emailExecM = trimmed.match(/^EMAIL\s+(?:DO\s+)?EXECUTADO:\s*(.+)/i);
        if (emailExecM) { target.email = emailExecM[1].trim(); continue; }
        const nameM = trimmed.match(/^Nome:\s*(.+)/i);
        if (nameM && !target.nome) { target.nome = nameM[1].trim(); continue; }
      }
    };

    const sections = systemContext.split(/(?=^===\s)/m);
    for (const section of sections) {
      const lines = section.trim().split('\n');
      if (lines.length === 0) continue;
      const header = lines[0].trim();

      if (/^===.*(?:DEVEDOR|EXECUTADO|RÉU)/i.test(header)) {
        parseFieldsFromLines(lines.slice(1), extractedDebtorFields);
        continue;
      }
      if (/^===.*(?:CLIENTE|AUTOR|EXEQUENTE)/i.test(header)) {
        parseFieldsFromLines(lines.slice(1), extractedClientFields);
        continue;
      }
    }

    if (!extractedClientFields.nome && !extractedDebtorFields.nome) {
      const entityBlocks = systemContext.split(/\n\n+/);
      for (const block of entityBlocks) {
        const lines = block.trim().split('\n');
        if (lines.length === 0) continue;
        const firstLine = lines[0].trim();

        const isClient = /^CLIENTE:/i.test(firstLine);
        const isDebtor = /^DEVEDOR:/i.test(firstLine) || /^EXECUTADO:/i.test(firstLine);
        if (!isClient && !isDebtor) continue;

        const target = isClient ? extractedClientFields : extractedDebtorFields;
        const nameMatch = firstLine.match(/^(?:CLIENTE|DEVEDOR|EXECUTADO):\s*(.+)/i);
        if (nameMatch) target.nome = nameMatch[1].trim();
        parseFieldsFromLines(lines.slice(1), target);
      }
    }

    const buildPartyBlock = (label: string, fields: PartyFieldMap): string => {
      const parts: string[] = [];
      if (fields.nome) parts.push(`NOME: ${fields.nome}`);
      if (fields.tipo) parts.push(`TIPO: ${fields.tipo}`);
      if (fields.cpfCnpj) parts.push(`CPF/CNPJ: ${fields.cpfCnpj}`);
      if (fields.endereco) parts.push(`ENDEREÇO: ${fields.endereco}`);
      if (fields.cidadeUf) parts.push(`CIDADE/UF: ${fields.cidadeUf}`);
      if (fields.cep) parts.push(`CEP: ${fields.cep}`);
      if (fields.telefone) parts.push(`TELEFONE: ${fields.telefone}`);
      if (fields.email) parts.push(`EMAIL: ${fields.email}`);
      if (parts.length === 0) return "";
      return `\n${label}:\n${parts.join('\n')}\n`;
    };

    const hasClientData = Object.values(extractedClientFields).some(v => v);
    const hasDebtorData = Object.values(extractedDebtorFields).some(v => v);

    const clientIsMobilar = hasClientData && ((extractedClientFields.nome || '').toUpperCase().includes('MOBILAR') || (extractedClientFields.cpfCnpj || '').replace(/\D/g, '') === '01583236000160');

    if (hasClientData || hasDebtorData) {
      let block = `\n\nDADOS REAIS DAS PARTES (VERIFICADOS NO BANCO DE DADOS):`;
      if (hasClientData && !clientIsMobilar) {
        block += buildPartyBlock("PARTE AUTORA/EXEQUENTE/EMBARGADA (CLIENTE)", extractedClientFields);
      }
      if (clientIsMobilar) {
        block += `\nPARTE AUTORA (MOBILAR MÓVEIS LTDA): Os dados do autor/exequente JÁ ESTÃO CORRETOS no template/modelo de referência. NÃO altere a qualificação do autor — mantenha EXATAMENTE como está no modelo.\n`;
      }
      if (hasDebtorData) block += buildPartyBlock("PARTE RÉ/EXECUTADA/EMBARGANTE (DEVEDOR)", extractedDebtorFields);
      if (clientIsMobilar) {
        block += `\nREGRA ABSOLUTA: Substitua APENAS os dados do DEVEDOR/EXECUTADO/RÉ acima. A qualificação do autor Mobilar deve permanecer INTACTA como no template. NÃO invente dados. Se inventar dados fictícios, a peça será REJEITADA.\n`;
      } else {
        block += `\nREGRA ABSOLUTA: USE EXATAMENTE os dados acima na qualificação das partes. COPIE literalmente cada CPF/CNPJ, endereço e CEP. NÃO invente dados. Se inventar dados fictícios, a peça será REJEITADA.\n`;
      }
      partiesSystemBlock = block;
    }

    const hasAnyPartyFields = Object.values(extractedClientFields).some(v => v) || Object.values(extractedDebtorFields).some(v => v);
    if (!hasAnyPartyFields) {
      contextBuilder += `\n=== DADOS REAIS DO CADASTRO DO SISTEMA — USO OBRIGATÓRIO ===\n`;
      contextBuilder += `ATENÇÃO: Os dados abaixo são REAIS e VERIFICADOS do banco de dados. USE-OS na qualificação das partes.\n\n`;
      contextBuilder += `${systemContext}\n\n`;
    } else {
      const nonPartyContent = systemContext
        .replace(/===\s*(?:DEVEDOR|EXECUTADO|RÉU|CLIENTE|AUTOR|EXEQUENTE|DADOS\s+DO\s+CLIENTE)[^=]*===[\s\S]*?(?=\n===|\n\n\n|$)/gi, '')
        .replace(/^(?:CLIENTE|DEVEDOR|EXECUTADO):.*(?:\n(?!\n).*)*\n*/gim, '')
        .trim();
      if (nonPartyContent.length > 20) {
        contextBuilder += `\n=== CONTEXTO ADICIONAL DO SISTEMA ===\n${nonPartyContent}\n\n`;
      }
    }
  }

  // Separate reference models from source files
  const referenceModels = files.filter(f => f.isReferenceModel);
  const sourceFiles = files.filter(f => !f.isReferenceModel);

  const isMobilarClient = (fields: PartyFieldMap): boolean => {
    const nome = (fields.nome || '').toUpperCase();
    const cnpj = (fields.cpfCnpj || '').replace(/\D/g, '');
    return nome.includes('MOBILAR') || cnpj === '01583236000160';
  };

  const prefillBuiltInTemplate = (text: string, clientFields: PartyFieldMap, debtorFields: PartyFieldMap): string => {
    let result = text;
    const skipClient = isMobilarClient(clientFields);

    if (skipClient) {
      console.log(`[Studio] Mobilar detectada como cliente — mantendo qualificação do autor intacta no template`);
    }

    const replaceGenericPlaceholders = (block: string, fields: PartyFieldMap): string => {
      let r = block;
      if (fields.cpfCnpj) {
        r = r.replace(/\[CNPJ\]/gi, fields.cpfCnpj);
        r = r.replace(/\[CPF\]/gi, fields.cpfCnpj);
      }
      if (fields.endereco) r = r.replace(/\[ENDERE[ÇC]O\s*(?:COMPLETO)?\]/gi, fields.endereco);
      if (fields.email) r = r.replace(/\[EMAIL\]/gi, fields.email);
      if (fields.cep) r = r.replace(/\[CEP\]/gi, fields.cep);
      if (fields.telefone) r = r.replace(/\[TELEFONE\]/gi, fields.telefone);
      if (fields.cidadeUf) r = r.replace(/\[CIDADE\]/gi, fields.cidadeUf);
      return r;
    };

    const clientNamePat = /\[NOME\s*(?:DO\s*)?(?:EXEQUENTE|AUTOR|AUTORA|EMBARGADO)(?:\/(?:EMPRESA|EXEQUENTE|AUTOR))?\]/gi;
    const debtorNamePat = /\[NOME\s*(?:DO\s*)?(?:EXECUTADO|RÉU|REQUERIDO|EMBARGANTE)(?:\/(?:EXECUTADO|RÉU))?\]/gi;

    if (!skipClient) {
      const clientQualPat = new RegExp(
        `(${clientNamePat.source}[\\s\\S]*?)(?=</p>|em\\s+face\\s+de)`,
        'i'
      );
      const clientMatch = result.match(clientQualPat);
      if (clientMatch) {
        let clientBlock = clientMatch[0];
        if (clientFields.nome) clientBlock = clientBlock.replace(clientNamePat, clientFields.nome);
        clientBlock = replaceGenericPlaceholders(clientBlock, clientFields);
        result = result.replace(clientMatch[0], clientBlock);
      }
    }

    const debtorQualPat = new RegExp(
      `(em\\s+face\\s+de\\s+${debtorNamePat.source}[\\s\\S]*?)(?=</p>)`,
      'i'
    );
    const debtorMatch = result.match(debtorQualPat);
    if (debtorMatch) {
      let debtorBlock = debtorMatch[0];
      if (debtorFields.nome) debtorBlock = debtorBlock.replace(debtorNamePat, debtorFields.nome);
      debtorBlock = replaceGenericPlaceholders(debtorBlock, debtorFields);
      result = result.replace(debtorMatch[0], debtorBlock);
    }

    if (!skipClient && clientFields.nome) result = result.replace(clientNamePat, clientFields.nome);
    if (debtorFields.nome) result = result.replace(debtorNamePat, debtorFields.nome);

    return result;
  };

  const prefillTemplateWithPartyData = (text: string, clientFields: PartyFieldMap, debtorFields: PartyFieldMap): string => {
    let result = text;
    const skipClient = isMobilarClient(clientFields);

    if (skipClient) {
      console.log(`[Studio] Mobilar detectada como cliente — mantendo qualificação do autor intacta no modelo de referência`);
    }

    if (debtorFields.nome) {
      result = result
        .replace(/\[(?:NOME\s*(?:COMPLETO\s*)?(?:DO\s*)?(?:EXECUTADO|RÉU|REQUERIDO|DEVEDOR))\]/gi, debtorFields.nome)
        .replace(/\[(?:RÉU|EXECUTADO|REQUERIDO|DEVEDOR)\]/gi, debtorFields.nome)
        .replace(/\[NOME\s*(?:DO\s*)?(?:EMBARGANTE(?:\/EXECUTADO)?)\]/gi, debtorFields.nome);
    }
    if (debtorFields.cpfCnpj) {
      result = result
        .replace(/\[(?:CPF|CNPJ|CPF\/CNPJ|DOCUMENTO)\s*(?:DO\s*)?(?:EXECUTADO|RÉU|REQUERIDO|DEVEDOR)\]/gi, debtorFields.cpfCnpj)
        .replace(/XXX\.XXX\.XXX-XX/g, debtorFields.cpfCnpj)
        .replace(/000\.000\.000-00/g, debtorFields.cpfCnpj)
        .replace(/\d{3}\.000\.000-00/g, debtorFields.cpfCnpj)
        .replace(/XX\.XXX\.XXX\/XXXX-XX/g, debtorFields.cpfCnpj)
        .replace(/00\.000\.000\/0000-00/g, debtorFields.cpfCnpj);
    }
    if (debtorFields.endereco) {
      result = result
        .replace(/\[(?:ENDERE[ÇC]O\s*(?:COMPLETO\s*)?(?:DO\s*)?(?:EXECUTADO|RÉU|REQUERIDO|DEVEDOR))\]/gi, debtorFields.endereco)
        .replace(/\[(?:endere[çc]o)\]/gi, debtorFields.endereco)
        .replace(/Rua\s+\[[^\]]+\]/gi, debtorFields.endereco);
    }
    if (debtorFields.cidadeUf) {
      result = result
        .replace(/\[(?:CIDADE\s*(?:\/\s*UF|\/\s*ESTADO)?\s*(?:DO\s*)?(?:EXECUTADO|RÉU|DEVEDOR))\]/gi, debtorFields.cidadeUf);
    }
    if (debtorFields.cep) {
      result = result
        .replace(/\[(?:CEP\s*(?:DO\s*)?(?:EXECUTADO|RÉU|REQUERIDO|DEVEDOR)?)\]/gi, debtorFields.cep)
        .replace(/00\.?000-000/g, debtorFields.cep)
        .replace(/XXXXX-XXX/g, debtorFields.cep);
    }
    if (debtorFields.telefone) {
      result = result
        .replace(/\[(?:TELEFONE\s*(?:DO\s*)?(?:EXECUTADO|RÉU|DEVEDOR)?)\]/gi, debtorFields.telefone);
    }
    if (!skipClient) {
      if (clientFields.nome) {
        result = result
          .replace(/\[(?:NOME\s*(?:DO\s*)?(?:AUTOR|AUTORA|EXEQUENTE|EMBARGADO)(?:\/EMPRESA)?)\]/gi, clientFields.nome)
          .replace(/\[(?:NOME\s*(?:DO\s*)?(?:EMBARGADO(?:\/(?:EXEQUENTE|AUTOR))?))\]/gi, clientFields.nome);
      }
      if (clientFields.cpfCnpj) {
        result = result
          .replace(/\[(?:CNPJ|CPF|CPF\/CNPJ|DOCUMENTO)\s*(?:DO\s*)?(?:AUTOR|AUTORA|EXEQUENTE|EMBARGADO|EMPRESA)\]/gi, clientFields.cpfCnpj);
      }
      if (clientFields.endereco) {
        result = result
          .replace(/\[(?:ENDERE[ÇC]O\s*(?:COMPLETO\s*)?(?:DO\s*)?(?:AUTOR|AUTORA|EXEQUENTE|EMBARGADO|EMPRESA))\]/gi, clientFields.endereco);
      }
      if (clientFields.email) {
        result = result
          .replace(/\[(?:EMAIL\s*(?:DO\s*)?(?:AUTOR|AUTORA|EXEQUENTE|EMBARGADO|EMPRESA)?)\]/gi, clientFields.email);
      }
      if (clientFields.cep) {
        result = result
          .replace(/\[(?:CEP\s*(?:DO\s*)?(?:AUTOR|AUTORA|EXEQUENTE|EMBARGADO|EMPRESA))\]/gi, clientFields.cep);
      }
    }

    const emFaceSplit = result.split(/(em\s+face\s+de)/i);
    if (emFaceSplit.length >= 3) {
      let clientPart = emFaceSplit[0];
      let debtorPart = emFaceSplit.slice(1).join('');
      if (!skipClient && clientFields.cpfCnpj) {
        clientPart = clientPart.replace(/\[(?:CNPJ|CPF|CPF\/CNPJ)\]/gi, clientFields.cpfCnpj);
        clientPart = clientPart.replace(/\[(?:ENDERE[ÇC]O\s*(?:COMPLETO)?)\]/gi, clientFields.endereco || '');
        clientPart = clientPart.replace(/\[CEP\]/gi, clientFields.cep || '');
      }
      if (debtorFields.cpfCnpj) {
        debtorPart = debtorPart.replace(/\[(?:CNPJ|CPF|CPF\/CNPJ)\]/gi, debtorFields.cpfCnpj);
        debtorPart = debtorPart.replace(/\[(?:ENDERE[ÇC]O\s*(?:COMPLETO)?)\]/gi, debtorFields.endereco || '');
        debtorPart = debtorPart.replace(/\[CEP\]/gi, debtorFields.cep || '');
      }
      result = clientPart + debtorPart;
    }

    return result;
  };

  if (referenceModels.length > 0) {
    const hasHtmlModel = referenceModels.some(f => f.extractedText && /<[a-z][^>]*>/i.test(f.extractedText));
    contextBuilder += `\n=== MODELO(S) DE REFERÊNCIA (${referenceModels.length}) ===\n`;
    contextBuilder += `INSTRUÇÃO CRÍTICA: Você DEVE seguir EXATAMENTE a estrutura, profundidade, estilo de argumentação e nível de detalhamento do(s) modelo(s) abaixo.\n`;
    contextBuilder += `Analise cuidadosamente: seções, subseções, formato de citações, extensão dos argumentos, linguagem técnica, e replique essa qualidade.\n`;
    if (hasHtmlModel) {
      contextBuilder += `FORMATAÇÃO: O modelo abaixo está em formato HTML. PRESERVE TODAS as tags HTML, estilos inline (style=""), estrutura de headings (h1/h2/h3), listas (ul/ol/li), tabelas, negrito (<strong>), itálico (<em>), sublinhado (<u>), e alinhamento de texto. A saída DEVE manter a mesma formatação HTML do modelo.\n`;
    }
    contextBuilder += `\n`;

    const hasPartyForPrefill = Object.values(extractedClientFields).some(v => v) || Object.values(extractedDebtorFields).some(v => v);
    referenceModels.forEach((file, i) => {
      contextBuilder += `[MODELO DE REFERÊNCIA ${i + 1}] ${file.name}\n`;
      contextBuilder += `------- INÍCIO DO MODELO -------\n`;
      if (file.extractedText && file.extractedText.trim()) {
        let modelText = file.extractedText;
        if (hasPartyForPrefill) {
          const before = modelText;
          modelText = prefillTemplateWithPartyData(modelText, extractedClientFields, extractedDebtorFields);
          if (modelText !== before) {
            console.log(`[Studio] Pre-filled reference model "${file.name}" with party data from system context`);
          }
        }
        contextBuilder += `${modelText}\n`;
      }
      contextBuilder += `------- FIM DO MODELO -------\n\n`;
    });
  }

  // Process source files - these contain the facts for the case
  if (sourceFiles.length > 0) {
    contextBuilder += `ARQUIVOS FONTE DO CASO (${sourceFiles.length}):\n\n`;
    sourceFiles.forEach((file, i) => {
      contextBuilder += `[ARQUIVO ${i + 1}] ${file.name} (${file.type})\n`;
      if (file.extractedText && file.extractedText.trim()) {
        contextBuilder += `Texto extraído:\n${file.extractedText}\n`;
      }
      contextBuilder += "\n";
    });
  }

  if (selectedJurisprudence.length > 0) {
    contextBuilder += `JURISPRUDÊNCIA SELECIONADA (${selectedJurisprudence.length}):\n\n`;
    selectedJurisprudence.forEach((j, i) => {
      contextBuilder += `[JURISPRUDÊNCIA ${i + 1}]\n`;
      contextBuilder += `Título: ${j.title}\n`;
      if (j.court) contextBuilder += `Tribunal: ${j.court}\n`;
      if (j.caseNumber) contextBuilder += `Número: ${j.caseNumber}\n`;
      if (j.ementa) contextBuilder += `Ementa: ${j.ementa}\n`;
      if (j.legalThesis) contextBuilder += `Tese: ${j.legalThesis}\n`;
      if (j.citationABNT) contextBuilder += `Citação ABNT: ${j.citationABNT}\n`;
      contextBuilder += "\n";
    });
  }

  if (selectedDoctrine.length > 0) {
    contextBuilder += `DOUTRINA SELECIONADA (${selectedDoctrine.length}):\n\n`;
    selectedDoctrine.forEach((d, i) => {
      contextBuilder += `[DOUTRINA ${i + 1}]\n`;
      contextBuilder += `Título: ${d.title}\n`;
      if (d.summary) contextBuilder += `Resumo: ${d.summary}\n`;
      if (d.citationABNT) contextBuilder += `Citação ABNT: ${d.citationABNT}\n`;
      contextBuilder += "\n";
    });
  }

  const pieceTypeLabels: Record<string, string> = {
    peticao_inicial: "Petição Inicial",
    acao_monitoria: "Ação Monitória",
    execucao: "Execução de Título Extrajudicial",
    cumprimento_sentenca: "Cumprimento de Sentença",
    contestacao: "Contestação",
    impugnacao_embargos_execucao: "Impugnação aos Embargos à Execução",
    impugnacao_embargos_monitoria: "Impugnação aos Embargos à Monitória",
    habeas_corpus: "Habeas Corpus",
    mandado_seguranca: "Mandado de Segurança",
    recurso_apelacao: "Recurso de Apelação",
    agravo_instrumento: "Agravo de Instrumento",
    recurso_especial: "Recurso Especial",
    recurso_extraordinario: "Recurso Extraordinário",
    contrarrazoes: "Contrarrazões ao Recurso de Apelação",
    acordo_extrajudicial: "Acordo Extrajudicial",
    notificacao_extrajudicial: "Notificação Extrajudicial",
    pesquisa_sistemas: "Pesquisa de Sistemas",
    indicacao_enderecos: "Indicação de Novos Endereços",
    contrato: "Contrato",
    renegociacao_divida: "Renegociação de Dívida",
    proposta_acordo: "Proposta de Acordo",
    termo_acordo: "Termo de Acordo/Composição",
    outro: "Outro",
  };

  const pieceLabel = pieceTypeLabels[templateType] || templateType;

  const petitionTypes = [
    "peticao_inicial", "cumprimento_sentenca", "contestacao",
    "habeas_corpus", "mandado_seguranca", "recurso_apelacao",
    "agravo_instrumento", "embargos_declaracao",
  ];
  const isPetition = petitionTypes.includes(templateType);

  const hasReferenceModel = referenceModels.length > 0;

  const htmlBaseRules = `
  REGRAS GERAIS (violação = falha total):
  1. NÃO escreva NADA antes do documento (nenhuma introdução, explicação ou comentário)
  2. NÃO escreva NADA depois do documento (nenhuma conclusão ou oferta de ajuda)
  3. NÃO use markdown: PROIBIDO **, ##, ###, ---, *, _
  4. Use APENAS HTML para formatação: <strong> para negrito, <p> para parágrafos
  5. NÃO inclua seções como "OBSERVAÇÕES", "NOTAS", "IMPORTANTE", "ANÁLISE"
  6. NÃO diga "posso orientar", "esqueleto padrão", "deve ser adaptado", "conforme as regras que sigo"
  7. Cada parágrafo deve estar em tags <p>...</p>
  8. Títulos e cabeçalhos em <p><strong>TÍTULO</strong></p>
  9. SEMPRE obedeça as instruções específicas do usuário quando fornecidas

  REGRA CRÍTICA DE ASSINATURA:
  - A assinatura no final da peça DEVE SEMPRE usar EXATAMENTE os placeholders [ADVOGADO_NOME] e [ADVOGADO_OAB]
  - NUNCA substitua [ADVOGADO_NOME] ou [ADVOGADO_OAB] por nenhum outro nome — nem do cliente, nem do representante, nem de qualquer parte
  - O sistema substituirá automaticamente esses placeholders pelo advogado correto
  - Formato obrigatório da assinatura: <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  REGRA CRÍTICA DE DADOS:
  - Use APENAS dados que estejam EXPLICITAMENTE nos documentos fonte ou nos DADOS DO CADASTRO DO SISTEMA
  - NUNCA invente, fabrique ou gere números de CPF, CNPJ, RG, telefone, CEP ou endereço
  - Se um dado não for encontrado nos documentos nem no cadastro, mantenha um placeholder descritivo entre colchetes (ex: [CPF DO AUTOR], [ENDEREÇO DO RÉU], [CNPJ DA EMPRESA])
  - NUNCA use números genéricos como 000.000.000-00, 00.000.000/0000-00, 0000000, 70000-000

  CONTROLE DE VERACIDADE DAS FONTES:
  - Toda legislação, doutrina ou jurisprudência citada deve ser REAL e verificável
  - Verificar antes de citar: se a lei existe, se o autor é real, se a obra existe, se o precedente é de tribunal real
  - É PROIBIDO inventar doutrina, precedentes, número de processo ou citações doutrinárias
  - Caso não seja possível confirmar a fonte com segurança, NÃO citar — é melhor não citar do que citar algo falso
  - Priorizar fontes amplamente reconhecidas na doutrina e jurisprudência brasileiras
  - PROIBIDO citar jurisprudência com placeholders (ex: "nº XXXXXXX", "Rel. Des. [NOME]", "j. [DATA]") — se não tem os dados completos do julgado (número real, relator real, data real, tribunal real), NÃO cite esse julgado
  - Toda jurisprudência citada DEVE ter TODOS os campos preenchidos com dados reais: tribunal, tipo e número do recurso, relator com nome completo, órgão julgador, data de julgamento, data de publicação
  - Se não houver jurisprudência segura e completa disponível: NÃO invente — fundamente a tese apenas com legislação e doutrina. É perfeitamente aceitável uma seção sem jurisprudência, desde que tenha forte fundamentação legal e doutrinária

  DENSIDADE DA FUNDAMENTAÇÃO:
  - Sempre que possível, cada tese jurídica deve ser sustentada por: dispositivo legal + doutrina + jurisprudência
  - A argumentação deve demonstrar convergência entre legislação, doutrina e entendimento dos tribunais
  - Cada subtítulo/tópico jurídico deve conter desenvolvimento SUBSTANCIAL: mínimo de 3-4 parágrafos argumentativos com profundidade real
  - PROIBIDO subtítulos com apenas 1-2 parágrafos introdutórios — cada tese deve ser explorada a fundo
  - Cada argumento deve vincular: FATO narrado → PROVA documental (referência ao documento) → CONSEQUÊNCIA jurídica

  COERÊNCIA ENTRE FUNDAMENTAÇÃO E PEDIDOS:
  - Cada pedido formulado deve decorrer logicamente da fundamentação jurídica apresentada
  - Evitar pedidos que não estejam previamente fundamentados na argumentação
  - Os pedidos devem ser processualmente completos e tecnicamente consistentes

  PADRÃO DE QUALIDADE DA REDAÇÃO:
  - Linguagem jurídica técnica, formal e persuasiva — escreva como advogado experiente litigando perante tribunais brasileiros
  - Clareza argumentativa com encadeamento lógico entre parágrafos
  - Parágrafos bem estruturados e persuasivos
  - Evitar repetições desnecessárias
  - PROIBIDO texto genérico, escolar ou padronizado que serviria para qualquer ação
  - PROIBIDO parágrafos vagos sem conexão com o caso concreto
  - PROIBIDO frases clichê vazias como "o autor foi surpreendido" sem contextualização específica
  - Toda afirmação fática deve estar apoiada nos documentos do caso, com menção ao documento correspondente quando possível
  - Tom firme, técnico e persuasivo

  SUBTÍTULOS DA SEÇÃO DO DIREITO:
  - Os subtítulos devem representar teses jurídicas específicas do caso concreto
  - Evitar subtítulos genéricos como "Da Responsabilidade Civil" ou "Do Direito Aplicável"
  - Preferir subtítulos que expressem diretamente o argumento (ex: "Da Responsabilidade Objetiva da Instituição Financeira", "Da Inexistência de Contratação Válida")

  CHECAGEM DE QUALIDADE INTERNA (obrigatória antes de entregar):
  Antes de finalizar o texto, verifique internamente se a peça atende a TODOS os critérios:
  1. Forte aderência ao caso concreto — os argumentos se referem especificamente aos fatos e documentos do caso
  2. Cronologia clara — os fatos estão narrados em ordem temporal com datas específicas
  3. Densidade jurídica real — cada tese tem desenvolvimento substancial com múltiplos parágrafos
  4. Pedidos completos — todos os pedidos são processualmente adequados e fundamentados
  5. Ausência de jurisprudência inventada — toda jurisprudência tem dados completos e reais (sem XXXXXXX ou placeholders)
  6. Ausência de parágrafos genéricos — nenhum trecho poderia ser copiado para outra ação sem alteração
  Se algum critério não for atendido, reescreva a parte deficiente antes de entregar.
  `;

  const citationRules = `
  FORMATO OBRIGATÓRIO PARA CITAÇÕES (ordem dentro de cada tópico: legislação → doutrina → jurisprudência):

  REGRA DE RECUO: TODAS as citações de artigos de lei, doutrina e jurisprudência DEVEM ter recuo de 4cm à esquerda. Use SEMPRE: <blockquote style="margin-left: 4cm;">

  LEGISLAÇÃO - citar o dispositivo legal com indicação da lei e do artigo. Transcrever literalmente o trecho legal em parágrafo próprio com recuo de 4cm:
  Formato HTML: <blockquote style="margin-left: 4cm;"><p>"Art. [número] da Lei nº [número]: [texto literal do dispositivo legal]"</p></blockquote>

  DOUTRINA - citação literal entre aspas com referência bibliográfica completa entre parênteses (SOBRENOME, Nome. Título. Editora, ano, página), com recuo de 4cm:
  Exemplo: <blockquote style="margin-left: 4cm;"><p>"Ao admitir o pagamento a prazo de uma venda, o empresário não precisa registrar em papel o crédito concedido; pode fazê-lo exclusivamente na fita magnética de seu microcomputador." (COELHO, Fábio Ulhoa. Curso de Direito Empresarial, volume 1. 15ª ed. São Paulo: Saraiva, 2011, p. 490)</p></blockquote>

  JURISPRUDÊNCIA - ementa ou trecho relevante entre aspas, seguido dos dados completos do acórdão, com recuo de 4cm. Ordem de preferência: STF → STJ → Tribunal local (TJDFT, TJSP etc.):
  Exemplo: <blockquote style="margin-left: 4cm;"><p>"EMBARGOS DO DEVEDOR - EXECUÇÃO - TÍTULO EXECUTIVO EXTRAJUDICIAL - PROTESTO POR INDICAÇÃO - LEI 5.474/68. A execução poderá ser promovida sem a apresentação da duplicata, desde que acompanhada do comprovante do protesto e documento hábil a comprovar a entrega da mercadoria, com fulcro no art. 15, § 2º, da Lei 5.474/68. Recurso não provido." (TJMG, Apelação Cível 1.0313.07.230871-8/001, Rel. Des. Alvimar de Ávila, 12ª Câmara Cível, j. 25/01/2012, DJe 06/02/2012)</p></blockquote>
  `;

  const mobilarPreservationRule = `
  REGRA ESPECIAL MOBILAR (OBRIGATÓRIA): Se o caso envolver a empresa MOBILAR MOVEIS LTDA (ou Mobilar Móveis) como autora/exequente/embargada:
  1. NÃO ALTERE NADA na qualificação do autor/exequente — CNPJ, endereço, email, representante, sócio administrador já estão CORRETOS no template/modelo. Copie-os EXATAMENTE como estão, sem modificar um único caractere.
  2. NÃO ALTERE o endereçamento da peça (cabeçalho com foro/circunscrição/vara) — mantenha exatamente como está no modelo de referência.
  3. Substitua APENAS os dados da parte RÉ/EXECUTADA/EMBARGANTE pelos dados fornecidos no contexto do sistema.
  4. Se os dados do autor Mobilar já estiverem preenchidos no template (CNPJ 01.583.236/0001-60, SAUS Quadra 01 Bloco M, etc.), NÃO os substitua por dados do sistema — eles já são os corretos.

  REGRA DE DATA E LOCAL: A data da peça deve ser SEMPRE "Brasília/DF, [data de hoje]". Use a data atual do dia em que a peça está sendo gerada. Formato: "Brasília, [dia] de [mês por extenso] de [ano]."
  `;

  const modelPreservationRules = `
  REGRA CRÍTICA DE PRESERVAÇÃO DO MODELO:
  Este tipo de peça possui um MODELO PADRÃO com doutrina, jurisprudência, citações e argumentação jurídica pré-definidas.
  Você DEVE REPRODUZIR INTEGRALMENTE toda a fundamentação jurídica do modelo padrão, incluindo:
  - TODA a doutrina citada (autores, obras, edições, páginas) — copie na íntegra
  - TODA a jurisprudência citada (tribunais, números, ementas, relatores, datas) — copie na íntegra
  - TODOS os artigos de lei e dispositivos normativos mencionados — copie na íntegra
  - TODA a argumentação jurídica e raciocínio lógico-jurídico — reproduza integralmente
  - TODAS as seções, subseções e parágrafos do modelo — não omita nenhum
  - TODA a formatação visual do modelo (negrito, recuo, espaçamento, alinhamento, maiúsculas/minúsculas em títulos) — replique EXATAMENTE como está no modelo

  O que você DEVE SUBSTITUIR pelos dados do caso concreto (extraídos dos ARQUIVOS FONTE DO CASO ou das instruções do usuário):
  - Qualificação completa das partes: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo (rua, número, bairro, cidade, UF, CEP), telefone, email, nacionalidade, estado civil, profissão
  - Nomes das partes (autor, réu, exequente, executado, embargante, embargado)
  - Número do processo
  - Vara/Tribunal/Comarca
  - Valores (débito, causa, honorários)
  - Datas específicas
  - Fatos narrados (adaptar ao caso concreto)

  PROIBIDO:
  - Resumir ou condensar a argumentação do modelo
  - Omitir citações de doutrina ou jurisprudência que constam no modelo
  - Substituir doutrina/jurisprudência do modelo por outras inventadas
  - Encurtar seções ou parágrafos
  - Adicionar seções que não existem no modelo (a menos que o usuário peça expressamente)
  `;


  const referenceModelInstructions = `
  VOCÊ É UM PREENCHEDOR DE MODELO JURÍDICO.

  REGRA FUNDAMENTAL: NÃO RESUMA. NÃO CONDENSE. NÃO OMITA SEÇÕES OU PARÁGRAFOS.

  ENTRADA:
  - MODELO DE REFERÊNCIA: documento base a ser copiado integralmente (fornecido abaixo)
  - ARQUIVOS DO CASO: fonte dos dados para preenchimento (fornecidos abaixo)

  PROCESSO OBRIGATÓRIO (siga exatamente):

  ETAPA 1 - COPIE O MODELO INTEGRALMENTE:
  Copie o texto completo do modelo de referência, seção por seção, parágrafo por parágrafo.
  PROIBIDO: resumir, condensar, encurtar, omitir qualquer parte.
  Este é seu documento base - use TODO o conteúdo.

  ETAPA 2 - IDENTIFIQUE NO MODELO as partes específicas do caso original:
  - Nomes das partes (autor, réu, recorrente, recorrido, contratante, contratado, notificante, notificado)
  - Número do processo (se aplicável)
  - Tribunal/Vara/Turma (se aplicável)
  - Datas específicas
  - Fatos narrados
  - Jurisprudência citada (se não aplicável ao caso atual)
  - Valores, quantias, prazos específicos

  ETAPA 3 - EXTRAIA DOS ARQUIVOS DO CASO os dados correspondentes:
  - Qualificação completa das partes do caso atual: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo (rua, número, bairro, cidade, UF, CEP), telefone, email, nacionalidade, estado civil, profissão. Busque esses dados em TODOS os documentos fornecidos (RG, CPF, procuração, nota promissória, contrato social, etc.)
  - Número do processo atual (se aplicável)
  - Tribunal/Vara do caso atual (se aplicável)
  - Datas relevantes do caso atual
  - Fatos do caso atual
  - Valores e quantias
  - Decisões anteriores (se houver)

  ETAPA 4 - SUBSTITUA os elementos identificados pelos dados extraídos:
  - Troque nome por nome
  - Troque número por número
  - Troque fatos por fatos
  - Troque datas por datas
  IMPORTANTE: Substitua APENAS esses elementos. O restante do texto permanece.

  ETAPA 5 - ADAPTE MUTATIS MUTANDIS o restante do texto:
  - Adapte termos processuais ou contratuais ao contexto do documento sendo gerado
  - Adapte argumentação jurídica à matéria do caso/contrato atual

  REGRAS CRÍTICAS:
  1. NÃO escreva NADA antes do documento (nenhuma introdução ou comentário)
  2. NÃO escreva NADA depois do documento (nenhuma conclusão ou oferta de ajuda)
  3. NÃO use markdown: PROIBIDO **, ##, ###, ---, *, _
  4. Use HTML para formatação. REPLIQUE EXATAMENTE as tags HTML presentes no modelo de referência. Se o modelo contém <h1>, <h2>, <h3>, <em>, <ul>, <ol>, <li>, <table>, <tr>, <td>, <th>, <u>, <sup>, <sub>, ou quaisquer outras tags HTML, use EXATAMENTE as mesmas tags na saída. Se o modelo usa apenas <p> e <strong>, use apenas <p> e <strong>.
  5. NÃO INVENTE informações que não existam no modelo ou nos arquivos
  6. NÃO ADICIONE seções que não existam no modelo
  7. COPIE TODAS as seções do modelo - não omita nenhuma
  8. Parágrafos de texto corrido devem estar em tags <p>...</p>. Porém, se o modelo usar outras tags HTML como <ul>, <ol>, <li>, <table>, <h1>, <h2>, <h3>, use as MESMAS tags — NÃO force tudo dentro de <p>.
  9. REPLIQUE EXATAMENTE a formatação visual do modelo: negrito (<strong>), itálico (<em>), sublinhado (<u>), recuo (blockquote com margin-left), espaçamento entre parágrafos, alinhamento de texto (text-align), maiúsculas/minúsculas nos títulos, listas (<ul>/<ol>), tabelas (<table>). A peça gerada deve ser visualmente idêntica ao modelo.
  10. Se o modelo de referência contiver atributos style="" nas tags HTML, PRESERVE esses estilos inline na saída.

  LEMBRETE FINAL: Você deve produzir o modelo de referência COMPLETO, com todas as suas seções, parágrafos e FORMATAÇÃO HTML, apenas substituindo os dados específicos do caso original pelos dados do caso atual e adaptando mutatis mutandis. NÃO resuma. NÃO omita. NÃO encurte. NÃO altere a formatação. PRESERVE todas as tags HTML e estilos do modelo original.
  `;

  const promptMestreJudicial = `
  PROMPT-MESTRE UNIVERSAL PARA PEÇAS JURÍDICAS

  Você é um advogado sênior extremamente experiente, com atuação em contencioso cível, administrativo, tributário, empresarial e regulatório, especializado em redação forense de alto nível.
  Sua tarefa é redigir uma peça jurídica completa, robusta, técnica, estratégica e persuasiva, como se fosse elaborada por um advogado muito experiente, com domínio de processo, argumentação e técnica forense.

  1. OBJETIVO

  Redija uma ${pieceLabel} com base:
  - nos fatos do caso concreto;
  - nos documentos anexados;
  - no modelo eventualmente fornecido;
  - nas teses jurídicas indicadas pelo usuário;
  - na estratégia processual mais favorável à parte representada.

  A peça deve estar pronta para protocolo, com redação formal, técnica, persuasiva e aprofundada.

  2. COMPORTAMENTO OBRIGATÓRIO

  Antes de redigir a peça, siga obrigatoriamente esta sequência lógica:

  Etapa 1 – Identificação da peça e da posição processual
  Primeiro, identifique com precisão:
  - qual é a peça a ser redigida;
  - quem é a parte representada;
  - qual é a posição processual da parte;
  - qual é o objetivo jurídico central da manifestação;
  - quais são as teses principais;
  - quais são as teses subsidiárias;
  - quais são os pedidos correspondentes a cada tese.

  Etapa 2 – Delimitação estratégica prévia
  Antes da redação final, organize internamente:
  - fatos incontroversos;
  - fatos controvertidos;
  - preliminares processuais;
  - prejudiciais de mérito, se houver;
  - teses de mérito;
  - teses subsidiárias;
  - pedidos;
  - provas relevantes;
  - riscos argumentativos;
  - pontos documentais fortes e fracos.

  Etapa 3 – Só então redigir a peça
  Depois dessa organização lógica, redija a peça completa.

  3. DIRETRIZES DE REDAÇÃO

  - Escrever como advogado sênior, não como resumo acadêmico.
  - Usar linguagem técnica, elegante, densa e persuasiva.
  - Não fazer texto raso, genérico ou padronizado demais.
  - Não economizar desenvolvimento.
  - Não inventar fatos.
  - Não afirmar que existe documento se ele não estiver nos autos ou nos anexos.
  - Quando houver lacuna documental, registrar isso com prudência técnica.
  - Sempre ligar: fato → prova → norma → tese → consequência jurídica → pedido.
  - Fazer transições inteligentes entre os tópicos.
  - Não usar argumentação decorativa.
  - Evitar adjetivos vazios e exageros retóricos sem utilidade.
  - Sempre demonstrar: o que aconteceu; por que isso juridicamente importa; qual norma foi violada ou aplicada; qual é a consequência processual ou material disso.

  4. ESTRUTURA PADRÃO DA PEÇA

  Adapte conforme o tipo de peça, mas em regra siga esta estrutura:
  - Endereçamento
  - Qualificação das partes
  - Síntese da demanda ou do contexto processual
  - Cabimento e tempestividade, se pertinente
  - Delimitação objetiva da controvérsia
  - Exposição detalhada dos fatos
  - Preliminares processuais, se houver
  - Prejudiciais de mérito, se houver
  - Mérito, com subtópicos bem separados
  - Fundamentos constitucionais e legais pertinentes
  - Jurisprudência útil e articulada
  - Pedidos
  - Requerimentos finais
  - Valor da causa, se aplicável
  - Fechamento

  5. SOBRE O USO DE MODELO FORNECIDO

  Se o usuário anexar uma peça-modelo:
  - Preserve ao máximo a estrutura, a lógica, a ordem dos tópicos e o estilo do modelo.
  - Mude apenas o que for necessário para adaptar ao novo caso.
  - Não descaracterize a peça-base.
  - Não reescreva tudo desnecessariamente.
  - Se houver trechos muito bons no modelo, aproveite-os e adapte-os.
  - Se houver fundamento aproveitável, transponha-o ao novo caso com os ajustes indispensáveis.
  - Se o usuário disser que determinado modelo deve ser mantido quase integralmente, respeite isso com rigor.

  6. TRATAMENTO DOS FATOS

  Na narrativa fática:
  - Organize cronologicamente os acontecimentos.
  - Dê destaque aos fatos juridicamente relevantes.
  - Aponte datas, documentos, comunicações, omissões, pagamentos, notificações, decisões e atos processuais relevantes.
  - Sempre que possível, amarre os fatos aos documentos.
  - Não fazer narrativa solta.
  - Não resumir excessivamente os fatos se eles forem importantes para a tese.
  - Se houver contradição da parte adversa, destaque com precisão.
  - Se houver nulidade procedimental, demonstrar: o ato; o vício; o prejuízo; a consequência jurídica.

  7. TRATAMENTO DAS TESES JURÍDICAS

  No desenvolvimento jurídico:
  - Separar cada tese em tópico próprio.
  - Começar pela tese mais forte.
  - Trabalhar teses subsidiárias depois.
  - Se houver preliminar ou prejudicial, tratar antes do mérito.
  - Em cada tópico: indicar a norma aplicável; explicar sua incidência no caso concreto; demonstrar a violação ou enquadramento; expor a consequência jurídica; conectar com o pedido.
  - Não apenas citar artigos: explicar por que eles importam.
  - Se houver jurisprudência útil, integrá-la ao raciocínio, e não apenas "jogar" ementas no texto.

  8. JURISPRUDÊNCIA

  Ao utilizar jurisprudência, siga rigorosamente:
  - Selecionar precedentes realmente pertinentes.
  - Priorizar tribunais competentes para o caso.
  - Priorizar precedentes recentes e úteis.
  - Não citar jurisprudência genérica.
  - Não usar jurisprudência meramente ornamental.
  - Sempre que possível, inserir: trecho curto e útil; ementa relevante; referência completa do julgado.
  - A jurisprudência deve reforçar a tese, não substituir a argumentação.
  - Se houver divergência possível, adotar a linha mais favorável à parte, sem ocultar fragilidade relevante.

  9. QUANDO HOUVER LACUNAS OU RISCO

  Se houver insuficiência documental, controvérsia fática ou algum ponto frágil:
  - não invente;
  - não omita o problema de forma infantil;
  - trate o ponto com técnica;
  - formule a redação de maneira prudente e estratégica;
  - quando possível, converta a lacuna em ônus da parte contrária;
  - quando pertinente, peça exibição de documento, inversão do ônus, diligência, produção de prova, esclarecimento ou complementação.

  10. SOBRE OS PEDIDOS

  Os pedidos devem ser: completos; coerentes com os fundamentos; organizados em ordem lógica; compatíveis com a natureza da peça; específicos, e não vagos.

  Se for petição inicial, incluir: tutela de urgência (se cabível); pedido principal; pedidos subsidiários; pedido de provas; condenações acessórias; valor da causa.
  Se for recurso, incluir: conhecimento; provimento; reforma, anulação, integração ou modificação da decisão; pedidos subsidiários (se cabíveis).
  Se for contestação, incluir: preliminares; impugnação específica; improcedência; pedidos subsidiários; provas.

  11. ESTILO OBRIGATÓRIO

  A redação deve seguir este padrão:
  - tom de advogado sênior;
  - argumentação firme, mas sem afetação;
  - texto corrido e bem articulado;
  - subtítulos claros;
  - densidade argumentativa alta;
  - sem linguagem telegráfica;
  - sem superficialidade;
  - sem floreios inúteis.

  Evite: repetir a mesma ideia muitas vezes; citar artigo sem explicar; fazer petição escolar; escrever como parecer genérico; usar expressões vazias como "data maxima venia" em excesso; inventar jurisprudência ou fatos.

  12. COMANDO FINAL

  Com base em tudo isso, redija a peça completa, pronta para protocolo, com alto nível técnico, profundidade argumentativa, coerência estratégica e aderência máxima ao caso concreto.
  `;

  const judicialContextualInstructions = (() => {
    const instructions: string[] = [];
    if (referenceModels.length > 0) {
      instructions.push("Mantenha ao máximo a estrutura do modelo anexo.");
      instructions.push("Não altere trechos do modelo que não precisem de adaptação.");
    }
    instructions.push("Aprofunde os fatos em nível máximo.");
    instructions.push("Traga artigos de lei transcritos literalmente quando relevantes.");
    instructions.push("Inclua jurisprudência com referência completa.");
    instructions.push("Escreva como peça de escritório de alto padrão.");
    if (templateType === "peticao_inicial") {
      instructions.push("OBRIGATÓRIO: Inclua seção específica de TUTELA ANTECIPADA / TUTELA DE URGÊNCIA (art. 300 do CPC), com fundamentação detalhada sobre probabilidade do direito e perigo de dano ou risco ao resultado útil do processo. Desenvolva em tópico próprio antes dos pedidos.");
    }
    if (templateType === "contestacao") {
      instructions.push("Explore nulidades formais, processuais e materiais em tópicos separados.");
    }
    if (["recurso_apelacao", "agravo_instrumento", "contrarrazoes"].includes(templateType)) {
      instructions.push("Transforme os argumentos do recurso administrativo em linguagem judicial.");
    }

    const libraryPrompt = getPromptForType(templateType);
    const isRecursal = ["recurso_apelacao", "agravo_instrumento", "contrarrazoes", "recurso_especial", "recurso_extraordinario", "embargos_declaracao"].includes(templateType);

    let supplemental = `\nINSTRUÇÕES CONTEXTUAIS FINAIS:\n${instructions.map(i => `- ${i}`).join('\n')}\n`;

    if (isRecursal) {
      supplemental += `

=== DIAGNÓSTICO PROCESSUAL OBRIGATÓRIO (FAZER ANTES DE QUALQUER REDAÇÃO) ===
ATENÇÃO: Antes de escrever uma única linha da peça, leia o prompt do usuário com atenção máxima e responda explicitamente às perguntas abaixo. Escreva o diagnóstico no início da sua resposta, imediatamente antes da peça, sob o título [DIAGNÓSTICO PROCESSUAL]:

1. Resultado da 1ª instância: quem ganhou? (ex: "Sentença procedente — banco condenado a indenizar" OU "Sentença improcedente — pedido do autor negado")
2. Resultado do acórdão recorrido: o tribunal manteve ou reformou a sentença? Quem se beneficiou?
3. Quem é o RECORRENTE neste recurso? (a parte que perdeu no acórdão recorrido e quer reformá-lo)
4. O que exatamente este recurso pede ao tribunal superior? (reforma total, reforma parcial, anulação, restabelecimento da sentença?)
5. Qual é a tese jurídica central?

SE O USUÁRIO NÃO ESPECIFICAR quem ganhou ou perdeu, DEDUZA a partir do contexto descrito. Se ainda assim for impossível determinar com segurança, APONTE a ambiguidade no diagnóstico e adote a interpretação mais lógica, explicando o raciocínio.
NUNCA inverta a lógica do caso. NUNCA escreva o recorrente errado. O diagnóstico é o mapa — a peça deve ser coerente com ele.
`;
    }

    if (libraryPrompt) {
      supplemental += `\n\n--- GUIA ESPECÍFICO PARA ESTE TIPO DE PEÇA ---\n${libraryPrompt}\n`;
    }

    if (isRecursal) {
      supplemental += `\n\n--- PROTOCOLO RECURSAL OBRIGATÓRIO ---\n${promptMestreRecursal}\n`;
    }

    supplemental += `\n\n--- REGRAS DE COMPLETUDE E INTEGRIDADE ---\n${travasModeloPadraoHonestidade}\n`;

    return supplemental;
  })();

  const petitionInstructions = `
  TAREFA: Redigir uma ${pieceLabel} completa, técnica e pronta para protocolo judicial.

  ${htmlBaseRules}

  ${promptMestreJudicial}

  ${judicialContextualInstructions}

  FORMATAÇÃO HTML OBRIGATÓRIA:
  - Endereçamento: <p><strong>EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA CÍVEL DA COMARCA DE BRASÍLIA - DF</strong></p>
  - Qualificação das partes: em <p> normal — extraia dos ARQUIVOS FONTE DO CASO e DADOS DO CADASTRO DO SISTEMA todos os dados: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo, telefone, email, nacionalidade, estado civil, profissão. Se um dado não estiver disponível, manter placeholder entre colchetes.
  - Nome da ação: <p><strong>${pieceLabel.toUpperCase()}</strong></p>
  - Títulos de seção: <p><strong>DOS FATOS</strong></p>, <p><strong>DO DIREITO</strong></p>, <p><strong>DOS PEDIDOS</strong></p>
  - Subtítulos do direito: <p><strong>Da Tese Jurídica Específica</strong></p>
  - Citações legais com recuo: <blockquote style="margin-left: 4cm;"><p>"texto do dispositivo"</p></blockquote>
  - Parágrafos normais: <p>texto do parágrafo</p>
  - Fecho: <p>Nestes termos, pede deferimento.</p>
  - Local/data: <p>Brasília, nesta data.</p>
  - Advogado: <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  ESTRUTURA OBRIGATÓRIA DA PEÇA:
  1. Endereçamento (em negrito)
  2. Qualificação completa das partes (com TODOS os dados extraídos)
  3. Nome da ação (em negrito)
  4. DOS FATOS (título em negrito) — narrar os fatos de forma clara, cronológica e objetiva, amarrando aos documentos
  5. DO DIREITO (título em negrito) — desenvolver os subtítulos definidos no planejamento, respeitando dentro de cada tópico a ordem: legislação → doutrina → jurisprudência. Demonstrar como os fatos se enquadram nas normas.
  6. DOS PEDIDOS (título em negrito) — pedidos numerados, claros, juridicamente decorrentes da fundamentação. Incluir pedidos principais e subsidiários quando cabível. Sempre incluir quando aplicável: citação do réu, procedência da ação, condenação, honorários, produção de provas, valor da causa.
  7. "Nestes termos, pede deferimento."
  8. "Brasília, nesta data."
  9. [ADVOGADO_NOME] - [ADVOGADO_OAB]

  ${citationRules}

  IMPORTANTE: Para peças com MODELO PADRÃO DE REFERÊNCIA embutido, NÃO aplique estas regras de citação — use APENAS a doutrina e jurisprudência que já constam no modelo.

  === REQUISITO MÍNIMO DE PROFUNDIDADE (OBRIGATÓRIO) ===

  ${["recurso_apelacao", "agravo_instrumento", "contrarrazoes", "embargos_declaracao"].includes(templateType) ? `
  Esta é uma peça recursal. Cada subtópico de mérito deve ter ao mínimo 5 (cinco) parágrafos de desenvolvimento real, substancial e específico para o caso. Parágrafos genéricos não contam.

  Para peças recursais, os seguintes subtópicos são obrigatórios, cada um com 5+ parágrafos:
  A) Síntese da decisão recorrida e os capítulos que serão impugnados
  B) Desenvolvimento da tese principal de reforma (com fundamento normativo, doutrinário e jurisprudencial)
  C) Desenvolvimento de tese subsidiária, se houver
  D) Pedidos (conhecimento, provimento, subsidiário)

  PROIBIDO entregar qualquer subtópico com menos de 5 parágrafos reais. Desenvolva completamente antes de entregar.
  ` : `
  Cada subtópico de mérito deve ter ao mínimo 5 (cinco) parágrafos de desenvolvimento real, específico e substancial para o caso concreto. Parágrafos meramente introdutórios, de transição ou genéricos não contam para o mínimo. Se qualquer subtópico tiver menos de 5 parágrafos reais — complete-o antes de entregar.
  `}
  `;

  const acaoMonitoriaInstructions = `
  TAREFA: Redigir uma AÇÃO MONITÓRIA completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Reproduza TODA a doutrina, jurisprudência e argumentação EXATAMENTE como consta no modelo. Substitua APENAS os dados variáveis (nomes das partes, valores, datas, endereços, número do processo, vara/comarca, CPF/CNPJ) pelos dados do caso concreto fornecidos pelo usuário.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA _____ VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DE [COMARCA] – TJDFT.</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>[NOME DO AUTOR/EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o número [CNPJ] (Doc. 1), com sede na [ENDEREÇO COMPLETO], endereço eletrônico [EMAIL], nesta feita representada por seu sócio administrador (Doc. 2) [NOME DO REPRESENTANTE], [nacionalidade], [estado civil], [profissão], CPF nº [CPF], RG nº [RG] – [ÓRGÃO EMISSOR], vem perante a honrosa presença de Vossa Excelência, por seu advogado legalmente constituído (Doc. 3), com escritório profissional, para os fins do art. 77, V, do CPC, no SAUS Quadra 01 Bloco M Sala 1301 – Edifício Libertas – Brasília/DF, com fulcro nos arts. 700 e seguintes do CPC, propor:</p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>AÇÃO MONITÓRIA</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>em face de [NOME DO RÉU], [nacionalidade], inscrito no CPF sob o nº [CPF], residente e domiciliado na [ENDEREÇO COMPLETO], CEP [CEP], com base nos fatos e fundamentos jurídicos a seguir dispostos.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DOS FATOS</strong></p>
  <p>A autora é credora de nota promissória emitida em [DATA DE EMISSÃO], com vencimento em [DATA DE VENCIMENTO] (Doc. 4), no valor original de R$ [VALOR] ([valor por extenso]).</p>
  <p>A referida nota promissória não mais se reveste de eficácia de título executivo extrajudicial, pelo prazo decorrido. Entretanto, comprova a obrigação de pagar inadimplida pelo Réu.</p>
  <p>Diante do descumprimento da obrigação, bem como de diversas tentativas frustradas na seara extrajudicial, medida que se impõe é o ajuizamento da presente ação monitória.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>VIABILIDADE DA AÇÃO MONITÓRIA</strong></p>
  <p>A ação monitória é instrumento de cobrança de quantia certa, de coisa determinada ou fungível, que tenha documento por escrito da obrigação, sem eficácia de título executivo, para efetuar a cobrança judicial do que é devido.</p>
  <p>Os requisitos da referida ação estão elencados no artigo 700 do Código de Processo Civil, quais sejam:</p>
  <blockquote style="margin-left: 4cm;">Art. 700. A ação monitória pode ser proposta por aquele que afirmar, com base em prova escrita sem eficácia de título executivo, ter direito de exigir do devedor capaz:
  I - o pagamento de quantia em dinheiro;
  II - a entrega de coisa fungível ou infungível ou de bem móvel ou imóvel;
  III - o adimplemento de obrigação de fazer ou de não fazer.</blockquote>
  <p>Nos termos do art. 784, inc. I, do Código de Processo Civil, a nota promissória é título executivo extrajudicial, porém, o prazo prescricional, para fins executivos, é de 3 (três) anos (Lei Uniforme de Genebra, Art. 70, Anexo I).</p>
  <p>Nesse contexto, a Súmula 504 do Superior Tribunal de Justiça (STJ) assim estabelece:</p>
  <p>Nesse sentido, ainda, o art. 206, § 5º, I do Código Civil, prevê que a pretensão de cobrança de dívidas líquidas constantes de instrumento particular prescreve no prazo de cinco anos, e o termo inicial da contagem do lapso temporal é o dia seguinte ao vencimento do título, consoante precedente do STJ acima transcrito.</p>
  <p>No caso concreto, considerando o vencimento do título em [DATA DE VENCIMENTO], a presente demanda é cabível e tempestiva.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>CAUSA DEBENDI: PRESCINDIBILIDADE DE SUA DEMONSTRAÇÃO</strong></p>
  <p>Por outro lado, de se destacar que, tratando-se de ação monitória, prescindível que a autora comprove os fatos constitutivos de seu direito.</p>
  <p>Aqui, a pretensão é fundada em nota promissória prescrita, devidamente assinada pelo réu. Dessarte, dispensa demonstração da causa debendi, consoante, além do mais, reiterada jurisprudência.</p>
  <p>A cobrança de dívida, por meio da monitória, limita-se a exigir "prova escrita sem eficácia de título executivo" (art. 700, caput, do CPC). Assim, é desnecessário que o autor/credor comprove a causa debendi da origem da cártula perseguida.</p>
  <p>Destaca-se, nesse ponto, precedente firmado no âmbito do STJ:</p>
  <blockquote style="margin-left: 4cm;">PROCESSUAL CIVIL. AGRAVO INTERNO NO AGRAVO EM RECURSO ESPECIAL. NEGATIVA DE PRESTAÇÃO JURISDICIONAL. INEXISTÊNCIA. AÇÃO MONITÓRIA. CAUSA DEBENDI. DESNECESSIDADE. DECISÃO MANTIDA.
  1. Inexiste afronta aos arts. 489 e 1.022 do CPC/2015 quando o acórdão recorrido pronuncia-se, de forma clara e suficiente, acerca das questões suscitadas nos autos, manifestando-se sobre todos os argumentos que, em tese, poderiam infirmar a conclusão adotada pelo Juízo.
  2. É desnecessária a demonstração da causa debendi de emissão da nota promissória para o ajuizamento da ação monitória (AgInt no AREsp n. 368.484/PR, relator Ministro João Otávio de Noronha, Terceira Turma, julgado em 23/6/2016, DJe de 30/6/2016).
  3. Agravo interno a que se nega provimento.
  (STJ - AgInt no AREsp: 1825496 GO 2021/0015332-5, Relator: Ministro ANTONIO CARLOS FERREIRA, Data de Julgamento: 12/12/2022, T4 - QUARTA TURMA, Data de Publicação: DJe 15/12/2022)</blockquote>
  <p>Incorporando essa compreensão, este é o entendimento jurisprudencial do TJDFT:</p>
  <blockquote style="margin-left: 4cm;">PROCESSO CIVIL, CIVIL E EMPRESARIAL. APELAÇÃO CÍVEL. AÇÃO MONITÓRIA. NOTAS PROMISSÓRIAS. AUTONOMIA. DISCUSSÃO DA CAUSA DEBENDI. IMPOSSIBILIDADE. OBRIGAÇÃO POSITIVA E LÍQUIDA. JUROS DE MORA. CORREÇÃO MONETÁRIA. TERMO INICIAL. VALOR ATUALIZADO DA DÍVIDA. ART. 397 DO CC. MORA EX RE.
  1. A nota promissória é um título executivo extrajudicial autônomo e abstrato, que documenta a existência de um crédito líquido e certo, exigível a partir de seu vencimento e circulável por endosso.
  2. De acordo com o Princípio da Autonomia, a nota promissória configura documento constitutivo de direito novo, autônomo, originário e completamente desvinculado da relação que lhe deu origem e, por essa razão, o legítimo portador do título pode exercer seu direito de crédito sem depender das relações que o antecederam.
  3. No caso em tela, diante da ausência de vinculação da nota promissória a contrato e da circulação do título por endosso prescindi de discussão da causa debendi.
  4. Nos termos dos incisos I, II e III do § 2º do artigo 700 do Código de Processo Civil, cabe ao autor instruir o feito monitório com o valor atualizado do débito.
  5. Levando-se em conta o que determinam o artigo 397, caput, do Código Civil e o artigo 1º, §1º, da Lei n. 6.899/1981, em regra, sobre as obrigações positivas, líquidas e com data de vencimento certo incidirão juros de mora e correção monetária a partir do vencimento do débito. Entretanto, tal regra é excetuada nos casos em que a inicial vem acompanhada de planilha de cálculo do débito, com aplicação de correção monetária e juros de mora, e a sentença, ao julgar procedente o pedido, condena o devedor ao pagamento do valor atualizado presente na planilha.
  6. A mora configura-se ex re, ou seja, decorre do simples vencimento da obrigação, nos termos dos artigos 394 e 397, caput, do Código Civil, sendo devidos juros de mora a partir de seu vencimento.
  7. Considerando que os juros de mora devem incidir a partir do vencimento de cada título e, observando-se que o título judicial já foi constituído com os juros moratórios calculados conforme planilha acostada à inicial, a sentença não carece de qualquer reparo.
  8. Negou-se provimento ao apelo.
  (Acórdão 1879611, 07066777820208070019, Relator(a): ARQUIBALDO CARNEIRO PORTELA, 6ª Turma Cível, data de julgamento: 12/6/2024, publicado no DJE: 27/6/2024.)</blockquote>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DIES A QUO DOS JUROS E CORREÇÃO MONETÁRIA. DAS PARCELAS VINCENDAS</strong></p>
  <p>Na ação monitória, para cobrança de nota promissória, mesmo prescrita, a correção monetária corre a contar da data do seu vencimento. É que, malgrado carecer de força executiva, a nota promissória, não paga, é título líquido e certo. Incide, por isso, na diretriz estatuída no art. 1º, § 1º, da Lei 6.899/81.</p>
  <p>No caso concreto, considerando o parcelamento do valor devido mediante acordo, a correção monetária e os juros incidem a contar da primeira parcela inadimplida, conforme jurisprudência do TJDFT:</p>
  <blockquote style="margin-left: 4cm;">APELAÇÃO. EMPRESARIAL. CIVIL. EMBARGOS À EXECUÇÃO. NOTA PROMISSÓRIA. PAGAMENTO PARCELADO. JUROS DE MORA. CORREÇÃO MONETÁRIA. TERMO INICIAL. VENCIMENTO ANTECIPADO. SENTENÇA MANTIDA.
  1. O inadimplemento da obrigação, positiva e líquida, no seu termo, constitui de pleno direito em mora o devedor (CC/02, art. 396).
  2. Tratando-se de Execução de nota promissória, cujo pagamento estampado na cártula foi estipulado em 10 (dez) parcelas, o inadimplemento de uma das prestações acarreta o vencimento antecipado de todo o débito. Logo, os juros e correção monetária relativos ao restante da dívida devem incidir a partir do vencimento da primeira parcela inadimplida.
  3. Apelação conhecida e não provida.
  (Acórdão 1658388, 0701210-29.2021.8.07.0005, Relator(a): ROBSON TEIXEIRA DE FREITAS, 8ª TURMA CÍVEL, data de julgamento: 31/01/2023, publicado no PJe: 10/02/2023.)</blockquote>
  <p>No que se refere às parcelas vincendas, medida que se impõe é a antecipação de seu vencimento:</p>
  <blockquote style="margin-left: 4cm;">AGRAVO DE INSTRUMENTO. COBRANÇA TAXAS CONDOMINIAIS. PRESTAÇÕES SUCESSIVAS. PARCELAS VINCENDAS INADIMPLIDAS. INCLUSÃO NO DÉBITO. POSSIBILIDADE. PEDIDO IMPLICITO. ART. 323 CPC. RECURSO PROVIDO.
  1. Em se tratando de prestações periódicas, ainda que o credor deixe de formular pedido específico de inclusão das parcelas vincendas, consideram-se requeridas implicitamente, porque dizem respeito a débitos decorrentes da mesma relação jurídica obrigacional.
  2. A jurisprudência do Superior Tribunal de Justiça é assente no sentido de que a execução pode abranger as parcelas vencidas e vincendas até o efetivo cumprimento integral da obrigação.
  3. Deu-se provimento ao recurso.
  (TJ-DF 07198985420218070000 DF 0719898-54.2021.8.07.0000, Relator: FABRÍCIO FONTOURA BEZERRA, Data de Julgamento: 02/02/2022, 5ª Turma Cível, Data de Publicação: Publicado no DJE: 16/02/2022.)</blockquote>
  <blockquote style="margin-left: 4cm;">APELAÇÃO. DIREITO CIVIL E PROCESSUAL CIVIL. EMBARGOS À EXECUÇÃO. EXCESSO. TERMO DE CONFISSÃO DE DÍVIDA. INADIMPLEMENTO. VENCIMENTO ANTECIPADO. ANTECIPAÇÃO DAS PARCELAS NÃO PAGAS. CUMPRIMENTO INTEGRAL DO DÉBITO. AMORTIZAÇÃO. REDUÇÃO DO VALOR TOTAL DA DÍVIDA. PRINCÍPIOS DA INTERVENÇÃO MÍNIMA, DA EXCEPCIONALIDADE DA REVISÃO CONTRATUAL, DA FORÇA OBRIGATÓRIA DOS CONTRATOS E DA IGUALDADE. AUSÊNCIA DE VIOLAÇÃO. SUCUMBÊNCIA RECÍPROCA.
  1. O vencimento antecipado é o fenômeno contratual que antecipa a data do vencimento das parcelas não pagas, possibilitando ao credor exigir o cumprimento integral do débito, a fim de protegê-lo de maiores prejuízos. A exigibilidade integral do débito, no entanto, refere-se ao montante das parcelas vincendas, as quais foram antecipadas, e não àquilo que já foi pago ao tempo e modo acordado pelas partes.
  2. A amortização constitui processo de redução do valor total da dívida mediante pagamentos periódicos, resultando em sua quitação.
  3. O vencimento antecipado é instrumento garantidor das boas relações creditórias e, revestindo-se de finalidade social, não pode transformar-se em ferramenta para legitimar o enriquecimento indevido de um dos contratantes.
  4. De acordo com o artigo 86 do Código de Processo Civil, se um litigante sucumbir em parte mínima do pedido, o outro responderá, por inteiro, pelas custas e pelos honorários advocatícios.
  5. Recursos conhecidos e não providos.
  (TJ-DF 07259774620218070001 1427492, Relator: EUSTÁQUIO DE CASTRO, Data de Julgamento: 31/05/2022, 8ª Turma Cível, Data de Publicação: 13/06/2022)</blockquote>
  <p>Pelo exposto, o valor atualizado da dívida, consoante planilha anexa (Doc. 5), perfaz o total de R$ [VALOR ATUALIZADO] ([valor por extenso]).</p>
  <p class="empty-lines"></p>
  <p>Ante o exposto, requer a Vossa Excelência:</p>
  <p>1. A citação do réu, na forma do art. 701 do CPC, para que, no prazo de 15 (quinze) dias, efetue o pagamento do valor total de R$ [VALOR ATUALIZADO] ([valor por extenso]), e 5% (cinco por cento) de honorários advocatícios, conforme planilha anexa, do valor atribuído a causa (art. 701, CPC) ou, no mesmo prazo, ofereça embargos.</p>
  <p>2. Em não havendo pagamento voluntário da obrigação, que seja ao final julgada procedente a presente ação monitória, condenando o réu ao pagamento da quantia total, acrescida de correção monetária, e juros de mora, este a contar da data da citação.</p>
  <p>3. A condenação do requerido ao pagamento das despesas processuais e honorários advocatícios, fixados no percentual máximo previsto pelo artigo 85, § 2º, do Código de Processo Civil.</p>
  <p>4. A juntada de toda a documentação acostada à presente.</p>
  <p>5. Considerando o disposto no art. 319, VII, a autora opta pela realização de audiência de conciliação.</p>
  <p>A autora protesta provar suas alegações por todos os meios de prova admitidas em juízo.</p>
  <p>Dá-se à causa o valor de R$ [VALOR ATUALIZADO] ([valor por extenso]).</p>
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo (rua, número, bairro, cidade, UF, CEP), telefone, email, nacionalidade, estado civil, profissão. Preencha cada campo correspondente no modelo com os dados encontrados. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Mantenha TODA a fundamentação jurídica, doutrina e jurisprudência EXATAMENTE como no modelo
  - Mantenha TODAS as citações de acórdãos com números, relatores, turmas e datas IDÊNTICOS ao modelo
  - Se o caso concreto não envolver parcelamento/parcelas vincendas, omita apenas o trecho sobre parcelas vincendas na seção DIES A QUO
  - Adapte a narrativa dos FATOS ao caso concreto, mas mantenha a mesma estrutura argumentativa
  - NÃO adicione, remova ou substitua jurisprudência
  - NÃO resuma ou condense qualquer seção
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  ${mobilarPreservationRule}
  `;

  const execucaoInstructions = `
  TAREFA: Redigir uma AÇÃO DE EXECUÇÃO FUNDADA EM TÍTULO EXECUTIVO EXTRAJUDICIAL completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Reproduza TODA a doutrina, jurisprudência e argumentação EXATAMENTE como consta no modelo. Substitua APENAS os dados variáveis (nomes das partes, valores, datas, endereços, número do processo, vara/comarca, CPF/CNPJ) pelos dados do caso concreto fornecidos pelo usuário.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA ____ VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DA CIRCUNSCRIÇÃO JUDICIÁRIA DE [COMARCA] – DISTRITO FEDERAL</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>[NOME DO EXEQUENTE/EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o número [CNPJ] (doc. 1), com sede na [ENDEREÇO COMPLETO], endereço eletrônico [EMAIL], nesta feita representada por seu sócio administrador [NOME DO REPRESENTANTE], [nacionalidade], [estado civil], [profissão], CPF nº [CPF], RG nº [RG] – [ÓRGÃO EMISSOR] (doc. 2), vem perante a honrosa presença de Vossa Excelência, por seus advogados legalmente constituídos (doc. 3), com escritório profissional, para os fins do art. 77, V, do CPC, no SAUS Quadra 01 Bloco M Sala 1301 – Edifício Libertas – Brasília/DF, com fulcro nos arts. 700 e seguintes do Código de Processo Civil (CPC), propor:</p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>AÇÃO DE EXECUÇÃO FUNDADA EM TÍTULO EXECUTIVO EXTRAJUDICIAL</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>em face de [NOME DO EXECUTADO], [nacionalidade], inscrito no CPF sob o n° [CPF], residente e domiciliado na [ENDEREÇO COMPLETO], CEP n° [CEP], telefone [TELEFONE], com base nos fatos e fundamentos jurídicos a seguir dispostos.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DOS FATOS</strong></p>
  <p>A autora é credora de nota promissória emitida no dia [DATA DE EMISSÃO], com vencimento em [DATA DE VENCIMENTO], no valor original de R$ [VALOR] ([valor por extenso]) (doc. 4).</p>
  <p>A referida nota promissória se reveste de eficácia de título executivo extrajudicial e comprova a obrigação de pagar inadimplida pela Ré.</p>
  <p>Diante do inadimplemento da obrigação, bem como de diversas tentativas frustradas na seara extrajudicial, não restou uma alternativa ao Exequente senão buscar a tutela jurisdicional para promover a execução integral do valor devido.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DOS FUNDAMENTOS JURÍDICOS</strong></p>
  <p>A presente execução encontra fundamento no art. 784, inciso I, do Código de Processo Civil, que qualifica a nota promissória como título executivo extrajudicial, uma vez que se trata de documento hábil a comprovar a obrigação de pagar quantia certa, líquida e exigível.</p>
  <p>O art. 783 do CPC estabelece que o credor de título executivo tem o direito de promover a execução contra o devedor inadimplente, como é o caso em questão.</p>
  <p>Ainda, o art. 786 do CPC dispõe que o inadimplemento de obrigação certificada em título executivo autoriza o credor a exigir, judicialmente, o cumprimento forçado da obrigação.</p>
  <p>Dessa forma, está configurado o direito da Exequente em proceder com a presente execução forçada, a fim de ver satisfeito seu crédito.</p>
  <p>Atualmente o total da dívida, líquida, certa e exigível, corresponde a R$ [VALOR ATUALIZADO] ([valor por extenso]), conforme atualização monetária anexa (doc. 5).</p>
  <p>Os cálculos foram realizados com base no usualmente aceito pela jurisprudência no Tribunal de Justiça do Distrito Federal e Territórios (TJDFT), vejamos:</p>
  <blockquote style="margin-left: 4cm;">CIVIL. PROCESSO CIVIL. COBRANÇA. CONTRATO DE ABERTURA DE CRÉDITO. JUROS DE MORA. TERMO INICIAL. INADIMPLEMENTO. MORA EX RE. ARTIGO 397, CAPUT, DO CÓDIGO CIVIL. RECURSO CONHECIDO E PROVIDO. Sendo o caso de obrigação positiva e líquida, a falta de pagamento na data estipulada já é suficiente para constituir, de pleno direito, a mora dos devedores (artigo 397, caput, do Código Civil). Assim, os juros moratórios são devidos desde o momento em que a obrigação foi descumprida. Apelação conhecida e, no mérito, provida. (Acórdão n.828177, 20120111896640APC, Relator: GILBERTO PEREIRA DE OLIVEIRA, Revisor: ALFEU MACHADO, 3ª Turma Cível, Data de Julgamento: 22/10/2014, Publicado no DJE: 03/11/2014. Pág.: 149).</blockquote>
  <p>Conforme exposto, e esgotadas todas as formas de acordo com o Executado, não houve alternativa, senão fazer valer-se do Poder Judiciário no sentido de ver o seu direito satisfeito com o pagamento da importância demandada.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DOS PEDIDOS</strong></p>
  <p>Diante do exposto, requer o Exequente:</p>
  <p>a) que a parte executada seja citada para que pague no prazo legal a importância R$ [VALOR ATUALIZADO] ([valor por extenso]), a qual corresponde o valor total da dívida acrescida de juros e correção monetária desde a data do vencimento da nota promissória ([DATA DE VENCIMENTO]);</p>
  <p>b) em caso de não satisfação do crédito naquele prazo, o deferimento de bloqueio de valores disponíveis em contas bancárias e/ou aplicações financeiras que a parte executada mantém junto à rede bancária por meio do sistema SISBAJUD até a totalidade do crédito, com a consequente conversão em penhora em caso de não impugnação ou do seu desprovimento;</p>
  <p>c) não sendo encontrado dinheiro, em espécie ou em depósito ou aplicação em instituição financeira, desde já, a expedição de mandado de penhora e avaliação, sobre tantos outros bens quanto bastem para garantir a satisfação do crédito exequendo, nos termos do art. 835 do CPC;</p>
  <p>d) a condenação do réu ao pagamento dos honorários advocatícios, com base no art. 85 do CPC;</p>
  <p>e) seja expedida certidão comprobatória da presente ação de execução para fins de averbação premonitória nos Cartórios de Registro de Imóveis, registro de veículos, bem como na Junta Comercial.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DAS PROVAS</strong></p>
  <p>Protesta-se provar o alegado por todas as provas em Direito admitidas, notadamente a documental, testemunhal e o depoimento pessoal da parte requerente.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DO VALOR DA CAUSA</strong></p>
  <p>Dá-se à causa o valor de R$ [VALOR ATUALIZADO] ([valor por extenso]), acrescido de juros e correção monetária.</p>
  <p>Nestes termos, pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo (rua, número, bairro, cidade, UF, CEP), telefone, email, nacionalidade, estado civil, profissão. Preencha cada campo correspondente no modelo com os dados encontrados. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Mantenha TODA a fundamentação jurídica, doutrina e jurisprudência EXATAMENTE como no modelo
  - Mantenha o Acórdão n.828177 com todos os dados (relator, revisor, turma, data) IDÊNTICOS ao modelo
  - Adapte a narrativa dos FATOS ao caso concreto, mas mantenha a mesma estrutura argumentativa
  - NÃO adicione, remova ou substitua jurisprudência
  - NÃO resuma ou condense qualquer seção
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  ${mobilarPreservationRule}
  `;

  const impugnacaoEmbargosExecucaoInstructions = `
  TAREFA: Redigir uma IMPUGNAÇÃO AOS EMBARGOS À EXECUÇÃO completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Reproduza TODA a argumentação jurídica EXATAMENTE como consta no modelo. Substitua APENAS os dados variáveis (nomes das partes, valores, datas, endereços, número do processo, vara/comarca) pelos dados do caso concreto. Adapte as subseções de DAS RAZÕES DA IMPUGNAÇÃO ao caso concreto seguindo o mesmo padrão argumentativo do modelo.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA [Nº] VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DA CIRCUNSCRIÇÃO JUDICIÁRIA DE [COMARCA] - TJDFT</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p><strong>Processo nº:</strong> [NÚMERO] (Exec. de Título Extrajudicial)</p>
  <p><strong>Apenso:</strong> [NÚMERO] (Embargos à Execução)</p>
  <p class="empty-lines"></p>
  <p>[NOME DO EMBARGADO/EXEQUENTE], já qualificada nos autos da execução em epígrafe, que move em face de [NOME DO EMBARGANTE/EXECUTADO], assistida por seu advogado, em cumprimento ao disposto na decisão Id nº [ID_DECISÃO], na forma do art. 920, I do CPC, apresentar:</p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>IMPUGNAÇÃO AOS EMBARGOS À EXECUÇÃO</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>frente aos embargos opostos pelo Executado, consoante razões fáticas, jurídicas e jurisprudenciais a seguir dispostas.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA SÍNTESE DOS EMBARGOS</strong></p>
  <p>O Embargante opôs os presentes Embargos à Execução alegando, em síntese, que a Nota Promissória que embasa a execução (Processo nº [NÚMERO]) estaria desprovida de certeza, liquidez e exigibilidade, sob o argumento de que o título estaria vinculado a um contrato de compra e venda (relação de consumo).</p>
  <p>Sustenta a aplicação do Código de Defesa do Consumidor e a inversão do ônus da prova, alegando genericamente não se recordar do valor exato da dívida e questionando a entrega dos bens e a correção dos valores cobrados.</p>
  <p>Ao final, pleiteou a concessão da gratuidade de justiça e apresentou proposta de acordo para pagamento do débito em [NÚMERO] parcelas de R$ [VALOR].</p>
  <p>Contudo, conforme restará demonstrado, os argumentos do Embargante não merecem prosperar, devendo a execução prosseguir em seus ulteriores termos.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DAS RAZÕES DA IMPUGNAÇÃO</strong></p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA EXIGIBILIDADE DA NOTA PROMISSÓRIA</strong></p>
  <p>Ao contrário do alegado pelo Embargante, a execução está lastreada em título executivo extrajudicial hábil, qual seja, uma nota promissória, nos termos do artigo 784, inciso I, do Código de Processo Civil. O título preenche todos os requisitos legais, contendo a assinatura do emitente e o valor certo da dívida.</p>
  <p>A alegação de que a vinculação da nota promissória a um contrato de compra e venda retiraria sua autonomia e exigibilidade é equivocada. A jurisprudência pátria é pacífica no sentido de que a nota promissória vinculada a contrato mantém sua força executiva, desde que o título seja líquido, certo e exigível, o que ocorre no presente caso.</p>
  <p>Ademais, o próprio Embargante confessa a existência da relação jurídica e a aquisição dos bens, limitando-se a dizer que "não se recorda" do valor exato. Tal confissão corrobora a causa debendi e a legitimidade da cobrança.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA AUSÊNCIA DE PROVA DE INADIMPLEMENTO CONTRATUAL PELA EXEQUENTE</strong></p>
  <p>O embargante limita-se a afirmar, de forma genérica, que não teria havido comprovação da entrega dos bens, sem juntar qualquer elemento mínimo de prova que sustente tal narrativa.</p>
  <p>Não há reclamação administrativa, notificação extrajudicial, comunicação contemporânea aos fatos ou qualquer documento que indique a inexistência da entrega dos produtos adquiridos.</p>
  <p>Ao contrário, o próprio embargante reconhece a existência do negócio jurídico, circunstância que foi expressamente considerada por esse douto Juízo ao indeferir o pedido de efeito suspensivo, fazendo consignar que o devedor confirma a relação negocial e apenas atribui o inadimplemento a razões indefinidas.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA IMPROCEDÊNCIA DA ALEGAÇÃO DE FALHA BANCÁRIA</strong></p>
  <p>A tentativa de imputar o inadimplemento a suposta falha operacional da instituição financeira não veio acompanhada de comprovante de tentativa de pagamento, estorno, protocolo bancário ou qualquer documento idôneo.</p>
  <p>Trata-se, portanto, de mera alegação desacompanhada de prova, incapaz de afastar a mora do devedor ou a exigibilidade do título executivo.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA INAPLICABILIDADE DAS TESES DE INEXIGIBILIDADE E DE INVERSÃO AUTOMÁTICA DO ÔNUS DA PROVA</strong></p>
  <p>Ainda que se reconheça a incidência do Código de Defesa do Consumidor, tal circunstância não implica, automaticamente, a inexigibilidade do título nem dispensa o consumidor do dever mínimo de comprovação dos fatos que alega.</p>
  <p>A inversão do ônus da prova não pode servir como instrumento de substituição integral da atividade probatória da parte, especialmente quando ausente qualquer indício concreto de irregularidade na formação do crédito.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA PROPOSTA DE PARCELAMENTO</strong></p>
  <p>Embora os embargos à execução não constituam a via processual adequada para a formulação de proposta de parcelamento do débito, matéria que pressupõe consenso entre as partes e deve ser tratada em sede própria, a embargada, em atenção aos princípios da efetividade da execução e da solução consensual dos conflitos, manifesta aceite à proposta apresentada, nos termos a seguir delimitados.</p>
  <p>O aceite é formulado sem que isso importe em reconhecimento de qualquer das teses defensivas deduzidas nos embargos, especialmente quanto à alegada inexigibilidade do título, e fica expressamente condicionado ao atendimento cumulativo das seguintes condições:</p>
  <p>a) reconhecimento expresso da integral exigibilidade do débito executado, tal como apurado nos autos da Execução nº [NÚMERO], com renúncia a qualquer alegação dos embargos;</p>
  <p>b) imputação à dívida do valor de R$ [VALOR] ([valor por extenso]), correspondente à quantia já bloqueada via SISBAJUD, conforme Id nº [ID] da execução em referência, a título de entrada;</p>
  <p>c) pagamento do saldo remanescente em [NÚMERO] parcelas mensais, sucessivas e fixas, no valor de R$ [VALOR] ([valor por extenso]) cada, com vencimento da primeira parcela no dia [DIA] do mês subsequente à homologação do acordo;</p>
  <p>d) previsão de cláusula de vencimento antecipado, de modo que o inadimplemento de qualquer parcela acarretará o vencimento imediato das demais, autorizando o prosseguimento da execução pelo saldo devedor, independentemente de nova intimação.</p>
  <p>A execução somente deverá ser suspensa após a formalização e homologação judicial do acordo, permanecendo hígidos, até então, todos os atos executivos já praticados.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DOS PEDIDOS</strong></p>
  <p>Ante o exposto, requer a Vossa Excelência:</p>
  <p>a) o julgamento de improcedência dos embargos à execução, mantendo-se íntegra a exigibilidade do título executivo;</p>
  <p>b) o regular prosseguimento da execução, ressalvada a hipótese de homologação do acordo nos termos acima;</p>
  <p>c) a condenação do embargante ao pagamento das custas processuais e honorários advocatícios, na forma do art. 85, § 2º, do CPC.</p>
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo (rua, número, bairro, cidade, UF, CEP), telefone, email, nacionalidade, estado civil, profissão. Preencha cada campo correspondente no modelo com os dados encontrados. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Mantenha TODA a argumentação jurídica EXATAMENTE como no modelo
  - Adapte a SÍNTESE DOS EMBARGOS ao resumo dos argumentos reais do embargante
  - Adapte as subseções de DAS RAZÕES DA IMPUGNAÇÃO para rebater os argumentos específicos do caso, seguindo o mesmo padrão argumentativo
  - Se não houver proposta de parcelamento no caso, omita a seção DA PROPOSTA DE PARCELAMENTO
  - NÃO resuma ou condense qualquer seção
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  ${mobilarPreservationRule}
  `;

  const impugnacaoEmbargosMonitoriaInstructions = `
  TAREFA: Redigir uma IMPUGNAÇÃO AOS EMBARGOS À MONITÓRIA completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Reproduza TODA a doutrina, jurisprudência e argumentação EXATAMENTE como consta no modelo. Substitua APENAS os dados variáveis (nomes das partes, valores, datas, endereços, número do processo, vara/comarca) pelos dados do caso concreto fornecidos pelo usuário.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA [Nº] VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DE [COMARCA] – TJDFT.</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p><strong>Processo nº</strong> [NÚMERO]</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>[NOME DO EMBARGADO/AUTOR], já qualificada nos autos da execução em epígrafe, que move em face de [NOME DO EMBARGANTE/RÉU], assistida por seu advogado, com fundamento no art. 702, § 5º, do Código de Processo Civil, apresentar:</p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>IMPUGNAÇÃO AOS EMBARGOS À MONITÓRIA</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>frente aos embargos opostos pelo Réu, consoante razões fáticas, jurídicas e jurisprudenciais a seguir dispostas.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA SÍNTESE DOS EMBARGOS</strong></p>
  <p>O réu, citado por edital, apresentou embargos à monitória por meio da Defensoria Pública, que, no exercício da curadoria especial, opôs contestação por negativa geral, conforme permitido pelo artigo 341, parágrafo único, do Código de Processo Civil.</p>
  <p>Os embargos apresentados não trouxeram qualquer elemento probatório ou argumentação específica que pudesse infirmar os fatos e fundamentos apresentados na inicial, limitando-se à negativa geral, o que não afasta a presunção de veracidade dos documentos apresentados pela autora.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DO DIREITO</strong></p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA LEGISLAÇÃO APLICADA À MATÉRIA</strong></p>
  <p>Nos termos do artigo 700 do Código de Processo Civil, a ação monitória é cabível quando o autor possui prova escrita sem eficácia de título executivo, como é o caso da nota promissória apresentada nos autos.</p>
  <p>A presunção de veracidade dos documentos apresentados pela autora não foi afastada, uma vez que o réu não trouxe qualquer elemento probatório em sentido contrário.</p>
  <p>Ademais, o artigo 702, § 5º, do CPC, estabelece que, em caso de embargos à monitória, cabe ao embargante demonstrar a inexistência do débito ou a improcedência do pedido, o que não ocorreu no presente caso.</p>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DA JURISPRUDÊNCIA</strong></p>
  <p>A jurisprudência é pacífica no sentido de que a contestação por negativa geral, apresentada pelo Curador Especial, não exige especificação de defesa, mas também não afasta a presunção de veracidade dos documentos apresentados pelo autor. Nesse sentido:</p>
  <blockquote style="margin-left: 4cm;">Ementa: DIREITO PROCESSUAL CIVIL. APELAÇÃO CÍVEL. AÇÃO MONITÓRIA. CHEQUE SEM FUNDO. EMBARGOS POR NEGATIVA GERAL. SENTENÇA MANTIDA. RECURSO DESPROVIDO.

  I. CASO EM EXAME
  Apelação cível interposta contra sentença que julgou procedente pedido formulado em ação monitória fundada em dois cheques devolvidos por insuficiência de fundos, reconhecendo a constituição do título executivo judicial.

  II. QUESTÃO EM DISCUSSÃO
  A questão em discussão consiste em definir se a contestação por negativa geral apresentada pela Curadoria Especial é suficiente para afastar os efeitos da revelia e impedir a presunção de veracidade dos fatos alegados na petição inicial.

  III. RAZÕES DE DECIDIR
  A ação monitória é cabível com base em prova escrita sem eficácia de título executivo, conforme o art. 700 do CPC. 4. No caso, os cheques apresentados atendem aos requisitos legais e foram devolvidos por motivo 11, indicando insuficiência de saldo.
  5. A citação foi realizada por edital, com nomeação de curador especial, que apresentou contestação por negativa geral. Nos termos do art. 341, parágrafo único, do CPC, a negativa geral apresentada por curador especial afasta os efeitos da revelia, tornando controvertidos os fatos da inicial.
  6. Todavia, a documentação apresentada pela parte autora comprova a existência da obrigação, não havendo elementos que indiquem fato impeditivo, modificativo ou extintivo do direito alegado.

  IV. DISPOSITIVO E TESE
  6. Apelação conhecida e desprovida.
  Tese de julgamento: "1. A contestação por negativa geral apresentada por curador especial afasta os efeitos da revelia, tornando controvertidos os fatos alegados na petição inicial, nos termos do art. 341, parágrafo único, do CPC. 2. A prova documental consistente em cheques devolvidos por insuficiência de fundos é suficiente para embasar a procedência da ação monitória. 3. A ausência de impugnação específica não impede o julgamento com base em prova escrita idônea, quando ausentes fatos impeditivos, modificativos ou extintivos do direito alegado."
  Dispositivos relevantes citados: CPC, arts. 85, § 2º e § 11; 341, parágrafo único; 344; 373, I; 700. Jurisprudência relevante citada: TJDFT, Acórdão 1966998, ApCiv 0722337-58.2023.8.07.0003, Rel. Des. Rômulo de Araújo Mendes, 1ª Turma Cível, j. 05/02/2025, p. 20/02/2025.

  (Acórdão 2059966, 0707247-73.2024.8.07.0003, Relator(a): ROBSON BARBOSA DE AZEVEDO, 7ª TURMA CÍVEL, data de julgamento: 22/10/2025, publicado no DJe: 05/11/2025.)</blockquote>
  <p class="empty-lines"></p>
  <p style="text-align:left"><strong>DOS PEDIDOS</strong></p>
  <p>Ante o exposto, requer a Vossa Excelência:</p>
  <p>1. A rejeição dos embargos à monitória, com a consequente procedência da ação monitória, convertendo-se o mandado inicial em título executivo judicial;</p>
  <p>2. A condenação do réu ao pagamento das custas processuais e honorários advocatícios, nos termos do artigo 85, § 2º, do Código de Processo Civil;</p>
  <p>3. A intimação do réu para, querendo, apresentar réplica no prazo legal.</p>
  <p>Protesta provar o alegado por todos os meios de prova em direito admitidos, especialmente a documental.</p>
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes: nome completo, CPF/CNPJ, RG com órgão emissor, endereço completo (rua, número, bairro, cidade, UF, CEP), telefone, email, nacionalidade, estado civil, profissão. Preencha cada campo correspondente no modelo com os dados encontrados. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Mantenha TODA a fundamentação jurídica, doutrina e jurisprudência EXATAMENTE como no modelo
  - Mantenha o Acórdão 2059966 com TODA a ementa (I a IV), tese de julgamento e dados IDÊNTICOS ao modelo
  - Adapte a SÍNTESE DOS EMBARGOS ao caso concreto (se curador especial por negativa geral, manter; se outra defesa, adaptar mantendo a estrutura)
  - NÃO adicione, remova ou substitua jurisprudência
  - NÃO resuma ou condense qualquer seção
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  ${mobilarPreservationRule}
  `;

  const acordoExtrajudicialInstructions = `
  TAREFA: Redigir uma PETIÇÃO DE HOMOLOGAÇÃO DE ACORDO EXTRAJUDICIAL completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Esta peça é SIMPLES e DIRETA — NÃO use títulos de seção (DOS FATOS, DO DIREITO). O texto flui em parágrafos corridos. Substitua APENAS os dados variáveis pelos dados do caso concreto.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA [Nº] VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DE [COMARCA] – TJDFT.</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p><strong>Processo nº</strong> [NÚMERO]</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>[NOME DA PARTE], já devidamente qualificado(a) nos autos do processo em epígrafe, por intermédio de seu advogado que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência, apresentar PEDIDO DE HOMOLOGAÇÃO DE ACORDO EXTRAJUDICIAL, nos termos que se seguem.</p>
  <p>Trata-se de [breve descrição do processo e objeto].</p>
  <p>Nesse contexto, as partes chegaram a um consenso e firmaram acordo extrajudicial, conforme instrumento em anexo, com as seguintes condições: [descrever condições do acordo — valor, parcelas, forma de pagamento, prazos].</p>
  <p>O referido acordo encontra respaldo nos arts. 840 e seguintes do Código Civil, que regem a transação, e no art. 515, III, do Código de Processo Civil, que prevê a homologação judicial de acordo extrajudicial como título executivo judicial.</p>
  <p>Ademais, o art. 725, VIII, do CPC autoriza a homologação de acordo extrajudicial, de qualquer natureza ou valor, pela via judicial.</p>
  <p>Pelo exposto, requer a Vossa Excelência a homologação do acordo extrajudicial anexo, para que produza seus regulares efeitos jurídicos, nos termos do art. 515, III, e art. 725, VIII, do CPC.</p>
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes e preencha nos campos correspondentes. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Mantenha a fundamentação legal (arts. 840+ CC, art. 515 III CPC, art. 725 VIII CPC) EXATAMENTE como no modelo
  - NÃO adicione títulos de seção — esta peça é texto corrido
  - NÃO resuma ou condense qualquer parágrafo
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  ${mobilarPreservationRule}
  `;

  const renegociacaoDividaInstructions = `
  TAREFA: Redigir um CONTRATO DE NOVAÇÃO DE DÍVIDA COM CONFISSÃO E GARANTIAS completo e pronto para assinatura.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. A qualificação da CREDORA está FIXA e NÃO DEVE SER ALTERADA sob nenhuma circunstância. Substitua APENAS os dados variáveis do DEVEDOR (e do FIADOR, se aplicável) pelos dados do caso concreto.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:center"><strong>CONTRATO DE NOVAÇÃO DE DÍVIDA COM CONFISSÃO E GARANTIAS</strong></p>
  <p class="empty-lines"></p>
  <p>Pelo presente instrumento particular, de um lado, MOBILAR MÓVEIS LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 01.583.236/0001-60, localizada na Quadra 3, Bloco A, Setor Norte, Brazlândia, Brasília-DF, 72.705-531, neste ato representada por DIONE DA SILVA FERREIRA, portador do RG n.º 1.550.907 e do CPF n.º 693.204.541-91, residente e domiciliado na Quadra 02, Conjunto F, Casa 119, Setor Sul, Brazlândia/DF, doravante denominada simplesmente CREDORA;</p>
  <p class="empty-lines"></p>
  <p><strong>DEVEDOR:</strong></p>
  <p><strong>NOME:</strong> [NOME_DEVEDOR]</p>
  <p><strong>NACIONALIDADE:</strong> [NACIONALIDADE_DEVEDOR]</p>
  <p><strong>CPF:</strong> [CPF_DEVEDOR]</p>
  [SE HOUVER DATA DE NASCIMENTO:]<p><strong>DN:</strong> [DATA_NASCIMENTO_DEVEDOR]</p>[FIM SE HOUVER DN]
  <p><strong>ENDEREÇO:</strong> [ENDEREÇO_DEVEDOR]</p>
  <p><strong>TELEFONE:</strong> [TELEFONE_DEVEDOR]</p>
  <p class="empty-lines"></p>
  <p>Têm entre si, justo e contratado, o presente CONTRATO DE NOVAÇÃO DE DÍVIDA, que se regerá pelas cláusulas e condições seguintes:</p>
  <p class="empty-lines"></p>
  <p><strong>CLÁUSULA PRIMEIRA – DO DÉBITO ANTERIOR</strong></p>
  <p class="empty-lines"></p>
  <p>1.1 A CREDORA é titular de crédito vencido e exigível decorrente de [ORIGEM_DÍVIDA], no valor original de R$ [VALOR_ORIGINAL] ([VALOR_ORIGINAL_EXTENSO]), relativo a [DOCUMENTO_REFERÊNCIA] vencido em [DATA_VENCIMENTO_ORIGINAL].</p>
  <p>1.2. As partes, de comum acordo, optam por extinguir a obrigação anterior, com fundamento no art. 360, I, do Código Civil, substituindo-a pela obrigação ora assumida, em caráter irrevogável e irretratável.</p>
  <p class="empty-lines"></p>
  <p><strong>CLÁUSULA SEGUNDA – DA NOVAÇÃO</strong></p>
  <p class="empty-lines"></p>
  <p>2.1. O DEVEDOR reconhece dever à CREDORA, a título de novação, o valor de R$ [VALOR_NOVADO] ([VALOR_NOVADO_EXTENSO]), referente ao saldo da dívida anterior e atualização monetária até a presente data, que será quitado da seguinte forma:</p>
  <p>- [CONDIÇÕES_PAGAMENTO_ENTRADA_E_PARCELAS]</p>
  <p>2.2. Como garantia adicional da obrigação ora novada, o DEVEDOR emitirá, nesta data, em favor da CREDORA, uma nota promissória correspondente ao saldo devedor.</p>
  <p>2.3 O inadimplemento de qualquer das parcelas importará em vencimento antecipado da totalidade do débito, autorizando desde já a CREDORA a promover a cobrança judicial imediata.</p>
  <p class="empty-lines"></p>
  <p><strong>CLÁUSULA TERCEIRA – DA CONFISSÃO DE DÍVIDA</strong></p>
  <p class="empty-lines"></p>
  <p>3.1. O DEVEDOR, de forma livre e consciente, reconhece e confessa expressamente ser devedor do valor acima referido, renunciando a qualquer alegação futura de inexigibilidade, prescrição, pagamento ou qualquer outro meio extintivo da obrigação anterior.</p>
  <p class="empty-lines"></p>

  [INÍCIO BLOCO CONDICIONAL — FIANÇA]
  <p><strong>CLÁUSULA QUARTA – DA FIANÇA</strong></p>
  <p class="empty-lines"></p>
  <p>4.1. O Sr. [NOME_FIADOR], [NACIONALIDADE_FIADOR], portador do RG nº [RG_FIADOR] e inscrito no CPF nº [CPF_FIADOR], residente e domiciliado à [ENDEREÇO_FIADOR], doravante denominado FIADOR, comparece ao presente instrumento na qualidade de garantidor da obrigação ora novada, obrigando-se, de forma irrevogável e irretratável, como fiador e principal pagador da dívida objeto deste contrato.</p>
  <p>4.1.1. O FIADOR declara ter pleno conhecimento do conteúdo do presente contrato de novação, aderindo integralmente às suas cláusulas e condições, responsabilizando-se pelo fiel cumprimento de todas as obrigações assumidas pelo DEVEDOR, incluindo o pagamento do valor principal, juros, correção monetária, multa, encargos moratórios, honorários advocatícios e demais despesas decorrentes de eventual inadimplemento.</p>
  <p>4.1.2. A fiança ora prestada é concedida em caráter solidário, nos termos dos arts. 264 e 275 do Código Civil, podendo a CREDORA exigir do FIADOR, independentemente de prévia cobrança do DEVEDOR, o cumprimento integral da obrigação.</p>
  <p>4.1.3. O FIADOR renuncia expressamente aos benefícios de ordem, divisão e excussão previstos nos arts. 827, 828 e 835 do Código Civil, obrigando-se solidariamente com o DEVEDOR até a quitação integral da dívida novada.</p>
  <p>4.1.4. A presente fiança subsistirá até o integral cumprimento de todas as obrigações assumidas neste instrumento, permanecendo válida e eficaz mesmo em caso de prorrogação de prazo, parcelamento, renegociação ou qualquer outra forma de modificação da dívida, independentemente de anuência expressa do FIADOR.</p>
  <p>4.1.5. O FIADOR responde, ainda, por todos os encargos decorrentes de mora ou inadimplemento, inclusive custas judiciais e extrajudiciais, despesas de cobrança e honorários advocatícios.</p>
  <p>4.1.6. Em caso de falecimento do FIADOR, a obrigação ora assumida transmite-se aos seus herdeiros e sucessores, na forma da lei, até o limite das forças da herança.</p>
  <p class="empty-lines"></p>
  [FIM BLOCO CONDICIONAL — FIANÇA]

  <p><strong>CLÁUSULA [PRÓXIMA] – DO VENCIMENTO ANTECIPADO</strong></p>
  <p class="empty-lines"></p>
  <p>[PRÓXIMA].1. O não pagamento de qualquer parcela no prazo estabelecido ensejará o vencimento antecipado de toda a dívida, independentemente de notificação judicial ou extrajudicial, autorizando a CREDORA a promover a cobrança integral do saldo devedor, acrescido de multa de 10%, juros e correção monetária pelo IPCA.</p>
  <p class="empty-lines"></p>
  <p><strong>CLÁUSULA [PRÓXIMA+1] – DA EXECUTIVIDADE</strong></p>
  <p class="empty-lines"></p>
  <p>[PRÓXIMA+1].1. O presente instrumento constitui título executivo extrajudicial, nos termos do art. 784, III, do Código de Processo Civil, podendo ser exigido judicialmente a qualquer tempo, em caso de inadimplemento.</p>
  <p class="empty-lines"></p>
  <p><strong>CLÁUSULA [PRÓXIMA+2] – DO FORO</strong></p>
  <p class="empty-lines"></p>
  <p>[PRÓXIMA+2].1. As partes elegem a Circunscrição Judiciária de Brazlândia/DF como o único competente Foro para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
  <p>E por estarem justas e contratadas, firmam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de testemunhas.</p>
  <p class="empty-lines"></p>
  <p>Brazlândia/DF, [DATA].</p>
  <p class="empty-lines"></p>
  <p><strong>CREDORA:</strong></p>
  <p>___________________________________________</p>
  <p>MOBILAR MÓVEIS LTDA</p>
  <p class="empty-lines"></p>
  <p><strong>DEVEDOR:</strong></p>
  <p>___________________________________________</p>
  <p>[NOME_DEVEDOR]</p>
  <p class="empty-lines"></p>

  [SE HOUVER FIADOR:]
  <p><strong>FIADOR:</strong></p>
  <p>___________________________________________</p>
  <p>[NOME_FIADOR]</p>
  <p class="empty-lines"></p>
  [FIM SE HOUVER FIADOR]

  <p><strong>TESTEMUNHAS:</strong></p>
  <p>___________________________________________</p>
  <p>TESTEMUNHA 1</p>
  <p>___________________________________________</p>
  <p>TESTEMUNHA 2</p>

  === FIM DO MODELO PADRÃO ===

  REGRA ABSOLUTA — QUALIFICAÇÃO DA CREDORA:
  NÃO MUDE NADA em relação à qualificação da CREDORA. Os dados da credora (MOBILAR MÓVEIS LTDA, CNPJ 01.583.236/0001-60, representada por DIONE DA SILVA FERREIRA, RG 1.550.907, CPF 693.204.541-91, endereço na Quadra 02 Conjunto F Casa 119 Setor Sul Brazlândia/DF) já estão CORRETOS e FIXOS no modelo. NUNCA os altere, mesmo que o usuário ou os documentos forneçam dados diferentes para a credora. Substitua APENAS os dados do DEVEDOR e, se aplicável, do FIADOR.

  REGRA DE FIADOR CONDICIONAL:
  - Se o usuário NÃO mencionar fiador nas instruções ou nos dados do caso, EXCLUA integralmente o bloco [INÍCIO BLOCO CONDICIONAL — FIANÇA] até [FIM BLOCO CONDICIONAL — FIANÇA], e EXCLUA também o bloco de assinatura [SE HOUVER FIADOR:] até [FIM SE HOUVER FIADOR]. Nesse caso, renumere as cláusulas seguintes: QUARTA (Vencimento Antecipado), QUINTA (Executividade), SEXTA (Foro) — ou seja, [PRÓXIMA]=QUARTA, [PRÓXIMA+1]=QUINTA, [PRÓXIMA+2]=SEXTA, com subcláusulas 4.1, 5.1, 6.1.
  - Se o usuário MENCIONAR fiador, MANTENHA a cláusula da fiança normalmente e preencha os dados do fiador. Nesse caso: [PRÓXIMA]=QUINTA, [PRÓXIMA+1]=SEXTA, [PRÓXIMA+2]=SÉTIMA, com subcláusulas 5.1, 6.1, 7.1.
  - Remova os marcadores [INÍCIO BLOCO CONDICIONAL], [FIM BLOCO CONDICIONAL], [SE HOUVER FIADOR:], [FIM SE HOUVER FIADOR], [PRÓXIMA], [PRÓXIMA+1], [PRÓXIMA+2] do documento final — eles são apenas instruções internas.

  REGRA DE DATA DE NASCIMENTO CONDICIONAL:
  - Se a data de nascimento do devedor NÃO estiver disponível nos dados do caso (não informada, ausente dos documentos, ou campo vazio), EXCLUA inteiramente a linha "<p><strong>DN:</strong> [DATA_NASCIMENTO_DEVEDOR]</p>" do documento final. NÃO deixe placeholder nem linha em branco no lugar.
  - Se a data de nascimento ESTIVER disponível, preencha normalmente.
  - Remova os marcadores [SE HOUVER DATA DE NASCIMENTO:] e [FIM SE HOUVER DN] do documento final.

  REGRA DE ATUALIZAÇÃO MONETÁRIA AUTOMÁTICA:
  - O valor original da dívida ([VALOR_ORIGINAL]) é o valor registrado no sistema na data de vencimento original.
  - Você DEVE calcular a atualização monetária do valor original até a data de elaboração do contrato (hoje), aplicando correção pelo IPCA (Índice Nacional de Preços ao Consumidor Amplo).
  - O valor novado ([VALOR_NOVADO]) deve ser o valor original ATUALIZADO monetariamente até a data de hoje.
  - Na Cláusula Segunda, descreva: "o valor de R$ [VALOR_NOVADO] ([VALOR_NOVADO_EXTENSO]), referente ao saldo da dívida anterior acrescido de atualização monetária pelo IPCA até a presente data".
  - Se o período entre o vencimento original e hoje for conhecido, calcule a correção usando taxa média anual do IPCA de aproximadamente 4,5% ao ano (0,367% ao mês), aplicando juros compostos sobre o valor original pelo número de meses transcorridos.
  - Fórmula: VALOR_NOVADO = VALOR_ORIGINAL × (1 + 0,00367)^(meses entre vencimento e hoje)
  - Arredonde o valor final para 2 casas decimais.
  - Escreva o valor por extenso entre parênteses.

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] do DEVEDOR e FIADOR pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação do DEVEDOR (nome, CPF, RG, endereço, etc.) e preencha nos campos correspondentes. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes
  - Para [CONDIÇÕES_PAGAMENTO_ENTRADA_E_PARCELAS], descreva fielmente os termos de pagamento (entrada, parcelas, vencimentos) conforme os dados do caso
  - Mantenha a fundamentação legal (art. 360 I CC, arts. 264, 275, 784 III CPC, arts. 827, 828, 835 CC) EXATAMENTE como no modelo
  - NÃO resuma ou condense qualquer cláusula ou subcláusula
  - NÃO adicione novas cláusulas ou subcláusulas além das previstas no modelo
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  - NÃO inclua assinatura de advogado ou OAB ao final do documento
  - NÃO inclua nome de sócio ao final do documento — apenas CREDORA, DEVEDOR, FIADOR (se houver) e TESTEMUNHAS
  - O foro é SEMPRE Brazlândia/DF — não altere
  - O local de assinatura é SEMPRE Brazlândia/DF — não altere

  REGRA DE DATA E LOCAL: A data da peça deve ser SEMPRE "Brazlândia/DF, [data de hoje]". Use a data atual do dia em que a peça está sendo gerada. Formato: "Brazlândia/DF, [dia] de [mês por extenso] de [ano]."
  `;

  const pesquisaSistemasInstructions = `
  TAREFA: Redigir uma PETIÇÃO DE PESQUISA DE SISTEMAS DISPONÍVEIS completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Esta peça é SIMPLES e DIRETA — NÃO use títulos de seção. O texto flui em parágrafos corridos. Substitua APENAS os dados variáveis pelos dados do caso concreto.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA [Nº] VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DE [COMARCA] – TJDFT.</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p><strong>Processo nº</strong> [NÚMERO]</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>[NOME DA PARTE], devidamente qualificada nos autos do processo em referência, vem, respeitosamente, à presença de Vossa Excelência, por meio de seu advogado legalmente constituído, em cumprimento à intimação constante na certidão Id nº [ID_CERTIDÃO], considerando não ter sido localizado o réu [NOME DO RÉU] no endereço indicado pela parte autora, requerer a realização de pesquisa acerca do atual paradeiro através dos sistemas à disposição desse douto Juízo (SISBAJUD, INFOSEG e SIEL), para encontrar o endereço do executado.</p>
  <p>Em sendo localizados endereços ainda não diligenciados, serão devidamente recolhidas as custas complementares respectivas.</p>
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes e preencha nos campos correspondentes. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Mantenha a referência aos sistemas SISBAJUD, INFOSEG e SIEL EXATAMENTE como no modelo
  - NÃO adicione títulos de seção — esta peça é texto corrido e curta
  - NÃO expanda ou adicione parágrafos extras — mantenha a petição concisa como no modelo

  ${citationRules}
  `;

  const indicacaoEnderecosInstructions = `
  TAREFA: Redigir uma PETIÇÃO DE INDICAÇÃO DE NOVOS ENDEREÇOS completa e pronta para protocolo.

  ${htmlBaseRules}

  INSTRUÇÃO FUNDAMENTAL: Use o MODELO PADRÃO DE REFERÊNCIA abaixo como base INTEGRAL. Esta peça é SIMPLES e DIRETA — NÃO use títulos de seção. O texto flui em parágrafos corridos. Substitua APENAS os dados variáveis pelos dados do caso concreto.

  === MODELO PADRÃO DE REFERÊNCIA (REPRODUZIR INTEGRALMENTE) ===

  <p style="text-align:left"><strong>AO JUÍZO DA [Nº] VARA CÍVEL, DE FAMÍLIA E DE ÓRFÃOS E SUCESSÕES DE [COMARCA] – TJDFT.</strong></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p><strong>Processo nº</strong> [NÚMERO]</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p>[NOME DA PARTE], devidamente qualificada nos autos do processo em referência, vem, respeitosamente, à presença de Vossa Excelência, por meio de seu advogado legalmente constituído, em cumprimento à intimação constante na certidão Id nº [ID_CERTIDÃO], considerando não ter sido localizada a Ré [NOME DO RÉU] no local indicado pela parte autora, requerer a CITAÇÃO no endereço a seguir elencado e na forma solicitada, ainda não diligenciado e relacionado na pesquisa Id nº [ID_PESQUISA]:</p>
  <p class="empty-lines"></p>
  <p>[ENDEREÇO COMPLETO]</p>
  <p>CEP [CEP]</p>
  <p class="empty-lines"></p>
  <p>Requer a parte autora, por oportuno, a juntada das guias de custas relativas às diligências, bem como dos respectivos comprovantes de pagamento.</p>
  <p class="empty-lines"></p>
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>
  <p>[CIDADE], [DATA].</p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === FIM DO MODELO PADRÃO ===

  REGRAS DE SUBSTITUIÇÃO:
  - Substitua APENAS os campos entre colchetes [CAMPO] pelos dados do caso concreto
  - Extraia dos ARQUIVOS FONTE DO CASO todos os dados de qualificação das partes e preencha nos campos correspondentes. Se um dado não estiver nos documentos, mantenha o placeholder entre colchetes.
  - Se houver mais de um endereço, liste cada um em parágrafo separado com CEP
  - NÃO adicione títulos de seção — esta peça é texto corrido e curta
  - NÃO expanda ou adicione parágrafos extras — mantenha a petição concisa como no modelo
  - NÃO cite novos artigos de lei ou jurisprudência — use APENAS os que já constam no modelo
  ${mobilarPreservationRule}
  `;

  const contrarrazoesInstructions = `
  ⚠️ PRIORIDADE ABSOLUTA — LEIA ANTES DE TUDO:
  As INSTRUÇÕES DO USUÁRIO (campo "INSTRUÇÕES DO USUÁRIO" no contexto) têm PRIORIDADE MÁXIMA sobre qualquer padrão estrutural definido abaixo.
  - Se o usuário pediu para mudar o nome da peça → use EXATAMENTE o nome solicitado em TODOS os títulos e referências (capa e corpo).
  - Se o usuário especificou quantos argumentos/temas criar → crie EXATAMENTE aquele número de seções numeradas (2.1, 2.2, 2.3, 2.4...), nem mais nem menos.
  - Se o usuário pediu mínimo de parágrafos por item → respeite esse mínimo em CADA seção numerada.
  - NÃO limite a produção de conteúdo. Se o usuário pede peça longa, escreva tudo sem cortar.

  TAREFA: Redigir peça de contrarrazões/contraminuta completa e pronta para protocolo, atuando como verdadeiro redator jurídico especialista. O nome exato da peça é definido pelas instruções do usuário — se não especificado, use "CONTRARRAZÕES AO RECURSO DE APELAÇÃO".

  ${htmlBaseRules}

  ${promptMestreJudicial}

  ${judicialContextualInstructions}

  METODOLOGIA ESPECÍFICA PARA CONTRARRAZÕES/CONTRAMINUTA (seguir rigorosamente nesta ordem):
  1. IDENTIFICAR O NOME DA PEÇA: Leia as instruções do usuário. Se ele pediu para usar um nome diferente (ex: "CONTRAMINUTA AO AGRAVO DE INSTRUMENTO", "CONTRARRAZÕES AO AGRAVO REGIMENTAL" etc.), use esse nome em TODOS os lugares onde apareceria o nome padrão.
  2. DEFINIR TODOS OS ARGUMENTOS DA PARTE CONTRÁRIA: Leia a integralidade do recurso/agravo descrito no contexto. Identifique e liste TODOS os argumentos apresentados pelo recorrente/agravante, sem excepção. Se o usuário informou quantos argumentos há, confirme esse número.
  3. CRIAR UMA SEÇÃO 2.X PARA CADA ARGUMENTO: Para CADA argumento identificado, crie uma seção numerada autônoma (2.1, 2.2, 2.3, 2.4...) com título próprio descrevendo o argumento. Se o usuário disse que há N argumentos, haverá necessariamente as seções 2.1 até 2.N.
  4. DESENVOLVER CADA SEÇÃO COM PROFUNDIDADE: Cada seção 2.X deve ter NO MÍNIMO 5 (cinco) parágrafos de argumentação jurídica real, específica para o caso. Parágrafos genéricos não contam.
  5. REBATER COM FUNDAMENTO: Para cada argumento da parte contrária, demonstre com argumentos de fato, direito, jurisprudência e doutrina por que ele não merece prosperar.
  6. JURISPRUDÊNCIA E DOUTRINA REAIS: Traga jurisprudência e doutrina que sejam REAIS e VERIFICÁVEIS. NÃO invente citações. Use tribunais brasileiros reais (STF, STJ, TJDFT, TRFs) e doutrinadores reconhecidos.

  FORMATAÇÃO HTML OBRIGATÓRIA (SEGUIR EXATAMENTE — substituindo [NOME_DA_PEÇA] pelo nome real definido pelo usuário ou padrão):
  1. Endereçamento (alinhado à esquerda, negrito) — adapte para o tipo de recurso (tribunal, câmara, vara etc.):
     <p style="text-align:left"><strong>EXCELENTÍSSIMO SENHOR DESEMBARGADOR RELATOR [OU JUIZ, CONFORME O CASO]</strong></p>

  2. Quatro linhas em branco após endereçamento:
     <p class="empty-lines"></p>

  3. Dados do processo (rótulos em negrito):
     <p><strong>Processo nº:</strong> [NÚMERO DO PROCESSO]</p>
     <p><strong>Agravante/Apelante:</strong> [NOME EM MAIÚSCULAS]</p>
     <p><strong>Agravado/Apelado:</strong> [NOME EM MAIÚSCULAS]</p>

  4. Parágrafo de qualificação normal (sem negrito):
     <p>[NOME DO AGRAVADO/APELADO], já devidamente qualificado nos autos do processo em epígrafe, por intermédio de seu advogado que esta subscreve, vem, respeitosamente, perante Vossa Excelência, em atenção à decisão de ID [DATA/ID], apresentar sua</p>

  5. Título centralizado e em negrito — use EXATAMENTE o nome definido pelo usuário:
     <p style="text-align:center"><strong>[NOME_DA_PEÇA]</strong></p>

  6. Parágrafo de fundamentação legal (adapte o artigo ao tipo de recurso):
     <p>interposto pelo [NOME], com fulcro no art. 1.019, inciso II, do Código de Processo Civil [ou artigo correspondente], requerendo, após o cumprimento das formalidades legais, a manutenção da decisão agravada e o envio dos autos para apreciação.</p>

  7. Primeiro fecho:
     <p>Termos em que pede e espera deferimento.</p>
     <p>Brasília, nesta data.</p>
     <p class="empty-lines"></p>
     <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  8. QUEBRA DE PÁGINA antes do segundo bloco:
     <p class="page-break"></p>

  9. Segundo título centralizado e em negrito — mesmo nome da peça:
     <p style="text-align:center"><strong>[NOME_DA_PEÇA]</strong></p>

  10. Dados do recurso (rótulos em negrito):
  <p><strong>Agravante/Apelante:</strong> [NOME EM MAIÚSCULAS]</p>
  <p><strong>Agravado/Apelado:</strong> [NOME EM MAIÚSCULAS]</p>
  <p><strong>Origem:</strong> Processo nº [NÚMERO] – [Vara e Comarca]</p>

  11. Saudação ao tribunal (negrito, alinhado à esquerda) — adapte para o tribunal do caso:
  <p style="text-align:left"><strong>EGRÉGIO TRIBUNAL, COLENDA CÂMARA, ILUSTRE RELATOR,</strong></p>

  12. Seção I — SÍNTESE DO PROCESSO (algarismo romano, negrito):
  <p style="text-align:left"><strong>I – SÍNTESE DO PROCESSO</strong></p>

  13. Seção II — DO MÉRITO — com subseções para CADA argumento da parte contrária:
  <p style="text-align:left"><strong>II – DO MÉRITO</strong></p>
  <p style="text-align:left"><strong>2.1. [Título descrevendo o 1º argumento da parte contrária]</strong></p>
  <p style="text-align:left"><strong>2.2. [Título descrevendo o 2º argumento da parte contrária]</strong></p>
  ... (quantas seções o usuário indicou ou quantos argumentos foram identificados)

  14. Subseções sem numeração (negrito, alinhado à esquerda):
  <p style="text-align:left"><strong>Da Configuração do Fortuito Interno</strong></p>

  15. Parágrafos normais de argumentação:
  <p>texto do parágrafo com argumentação jurídica...</p>

  16. Citações de doutrina e jurisprudência (OBRIGATORIAMENTE em blockquote):
  <blockquote style="margin-left: 4cm;">"Texto da citação..." (AUTOR. Título. Edição. Editora, Ano, p. XX).</blockquote>
  <blockquote style="margin-left: 4cm;">"EMENTA..." (TRIBUNAL, Classe nº, Rel. Nome, Turma, DJe data).</blockquote>

  17. Conclusão com pedidos em letras:
  <p style="text-align:left"><strong>III – CONCLUSÃO</strong></p>
  <p>Por todo o exposto, resta evidente que...</p>
  <p>Ante o exposto, requer-se:</p>
  <p>a) o não provimento do recurso/agravo, mantendo-se integralmente a decisão recorrida/agravada;</p>
  <p>b) a condenação do recorrente/agravante ao pagamento das custas processuais e honorários advocatícios...</p>

  18. Fecho final:
  <p>Termos em que pede e espera deferimento.</p>
  <p>Brasília, nesta data.</p>
  <p class="empty-lines"></p>
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  ESTRUTURA OBRIGATÓRIA DA PEÇA:
  PRIMEIRO BLOCO (capa/protocolo):
  1. Endereçamento ao juízo/tribunal (negrito, alinhado à esquerda)
  2. 4 linhas em branco
  3. Processo nº, Agravante/Apelante, Agravado/Apelado (rótulos em negrito)
  4. Qualificação do Agravado/Apelado e apresentação da peça
  5. Título [NOME_DA_PEÇA] (centralizado, negrito)
  6. Fundamentação legal (artigo CPC correspondente)
  7. Primeiro fecho com data e assinatura do advogado

  QUEBRA DE PÁGINA

  SEGUNDO BLOCO (peça em si):
  8. Título [NOME_DA_PEÇA] (centralizado, negrito)
  9. Dados: Agravante/Apelante, Agravado/Apelado, Origem (rótulos em negrito)
  10. Saudação ao Tribunal (negrito)
  11. I – SÍNTESE DO PROCESSO (narrativa completa do caso)
  12. II – DO MÉRITO — com subseções 2.1, 2.2, 2.3... rebatendo CADA argumento identificado (mínimo 5 parágrafos por subseção)
  13. III – CONCLUSÃO com pedidos específicos em letras a), b)
  14. Fecho final com data e assinatura

  REGRAS DE CITAÇÃO:
  - Jurisprudência DEVE ser em blockquote: <blockquote style="margin-left: 4cm;">"EMENTA..." (TRIBUNAL, Classe nº, Rel. Nome, Turma, DJe data).</blockquote>
  - Doutrina DEVE ser em blockquote: <blockquote style="margin-left: 4cm;">"Texto da citação..." (AUTOR. Título. Edição. Editora, Ano, p. XX).</blockquote>
  - Use APENAS jurisprudência e doutrina REAIS e VERIFICÁVEIS
  - Encaixe cada citação no local exato onde ela fundamenta o argumento
  - NÃO coloque citações em parágrafos <p> normais — use SEMPRE <blockquote style="margin-left: 4cm;">

  ${citationRules}
  `;

  const recursoExtraordinarioInstructions = `
  TAREFA: Redigir um RECURSO EXTRAORDINÁRIO completo e pronto para protocolo, atuando como verdadeiro redator jurídico especialista.

  ${htmlBaseRules}

  ${promptMestreJudicial}

  ${judicialContextualInstructions}

  FORMATAÇÃO HTML OBRIGATÓRIA (SEGUIR EXATAMENTE):

  === PRIMEIRO BLOCO (CAPA/PROTOCOLO) ===

  1. Endereçamento (alinhado à esquerda, negrito):
     <p style="text-align:left"><strong>EXCELENTÍSSIMO SENHOR DESEMBARGADOR FEDERAL VICE-PRESIDENTE DO EGRÉGIO TRIBUNAL REGIONAL FEDERAL DA ___ REGIÃO</strong></p>
     (ou, se o acórdão for de TJ estadual: EXCELENTÍSSIMO SENHOR DESEMBARGADOR PRESIDENTE DO EGRÉGIO TRIBUNAL DE JUSTIÇA DO DISTRITO FEDERAL E DOS TERRITÓRIOS)

  2. Quatro linhas em branco após endereçamento:
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>

  3. Dados do processo (rótulos em negrito):
     <p><strong>Processo nº:</strong> [NÚMERO DO PROCESSO]</p>
     <p><strong>Recorrente:</strong> [NOME DO RECORRENTE EM MAIÚSCULAS]</p>
     <p><strong>Recorrida:</strong> [NOME DA RECORRIDA EM MAIÚSCULAS]</p>

  4. Quatro linhas em branco:
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>

  5. Parágrafo de qualificação (sem negrito):
     <p>[NOME DO RECORRENTE], já devidamente qualificado(a) nos autos do processo em epígrafe, por seus advogados infra-assinados, vem, respeitosamente, à presença de Vossa Excelência, com fundamento no artigo 102, inciso III, alínea "a", da Constituição Federal, interpor o presente</p>

  6. Título centralizado e em negrito:
     <p style="text-align:center"><strong>RECURSO EXTRAORDINÁRIO</strong></p>

  7. Duas linhas em branco:
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>

  8. Parágrafo "em face do":
     <p>em face do v. acórdão proferido pela ___ Turma desse Egrégio Tribunal (ID [NÚMERO]), integrado pelo acórdão que rejeitou os Embargos de Declaração (ID [NÚMERO]), pelas razões de fato e de direito a seguir expostas.</p>

  9. Parágrafo de requerimento:
     <p>Requer, desde já, o recebimento e processamento do presente recurso, com a intimação da parte recorrida para, querendo, apresentar contrarrazões, e a posterior remessa dos autos ao Excelso Supremo Tribunal Federal.</p>

  10. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  11. Fecho:
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>

  12. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  13. Local e data:
  <p>Brasília-DF, nesta data.</p>

  14. Quatro linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  15. Assinatura centralizada:
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === QUEBRA DE PÁGINA ===
  <p class="page-break"></p>

  === SEGUNDO BLOCO (RAZÕES DO RECURSO) ===

  16. Título centralizado e em negrito:
  <p style="text-align:center"><strong>RAZÕES DO RECURSO EXTRAORDINÁRIO</strong></p>

  17. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  18. Dados do recurso (rótulos em negrito):
  <p><strong>Recorrente:</strong> [NOME EM MAIÚSCULAS]</p>
  <p><strong>Recorrida:</strong> [NOME EM MAIÚSCULAS]</p>
  <p><strong>Origem:</strong> [Tribunal] (Processo nº [NÚMERO])</p>

  19. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  20. Saudação ao tribunal (negrito, alinhado à esquerda, cada linha em parágrafo separado):
  <p style="text-align:left"><strong>EGRÉGIO SUPREMO TRIBUNAL FEDERAL,</strong></p>
  <p style="text-align:left"><strong>COLENDA TURMA,</strong></p>
  <p style="text-align:left"><strong>ÍNCLITOS MINISTROS.</strong></p>

  21. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  22. Seções numeradas (negrito, alinhado à esquerda):
  <p style="text-align:left"><strong>1. DOS PRESSUPOSTOS DE ADMISSIBILIDADE</strong></p>

  23. Subseções numeradas (negrito, alinhado à esquerda):
  <p style="text-align:left"><strong>1.1. Da Tempestividade e do preparo</strong></p>
  (parágrafos: art. 1.003, § 5º, CPC — prazo 15 dias úteis, preparo pago)

  <p style="text-align:left"><strong>1.2. Do Prequestionamento</strong></p>
  (parágrafos: Súmulas 282 e 356 do STF — matéria debatida no acórdão)

  <p style="text-align:left"><strong>1.3. Da Repercussão Geral</strong></p>
  (parágrafos: art. 1.035 CPC — relevância econômica, jurídica, social ou política + transcendência)

  <p style="text-align:left"><strong>1.4. Síntese da demanda</strong></p>
  (parágrafos: narrativa do caso, sentença favorável, acórdão reformando, embargos rejeitados)

  24. Trechos de sentença/acórdão em blockquote:
  <blockquote style="margin-left: 4cm;">Ante o exposto, julgo PROCEDENTES os pedidos iniciais...</blockquote>
  <blockquote style="margin-left: 4cm;">EMENTA: CONSTITUCIONAL E ADMINISTRATIVO...</blockquote>

  25. Seção de mérito:
  <p style="text-align:left"><strong>3. DO MÉRITO RECURSAL</strong></p>
  <p style="text-align:left"><strong>3.1. Da Violação ao Artigo [X] da Constituição Federal</strong></p>
  (parágrafos detalhados com argumentação constitucional)
  <p style="text-align:left"><strong>3.2. [Segundo argumento de mérito]</strong></p>
  (parágrafos com fundamentação)

  26. Citações de norma constitucional/legal em blockquote:
  <blockquote style="margin-left: 4cm;">XI - a remuneração e o subsídio dos ocupantes de cargos...</blockquote>

  27. Citações de jurisprudência em blockquote:
  <blockquote style="margin-left: 4cm;">"Nos casos autorizados constitucionalmente de acumulação..." (STF, RE nº XXXXX, Tema XXX, Rel. Min. Nome, Plenário, DJe data).</blockquote>

  28. Seção de pedidos:
  <p style="text-align:left"><strong>4. DOS PEDIDOS</strong></p>
  <p>Diante do exposto, requer o(a) Recorrente:</p>
  <p>a) O conhecimento do presente Recurso Extraordinário, uma vez preenchidos todos os requisitos de admissibilidade, inclusive a repercussão geral da matéria;</p>
  <p>b) No mérito, o seu PROVIMENTO para, reformando o v. acórdão recorrido, restabelecer a r. sentença;</p>
  <p>c) subsidiariamente, [pedido subsidiário se houver].</p>

  29. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  30. Fecho final:
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>

  31. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  32. Local e data:
  <p>Brasília-DF, nesta data.</p>

  33. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  34. Assinatura centralizada:
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  ESTRUTURA OBRIGATÓRIA DA PEÇA:
  PRIMEIRO BLOCO (capa/protocolo):
  1. Endereçamento ao Vice-Presidente/Presidente do Tribunal (negrito, alinhado à esquerda)
  2. 4 linhas em branco
  3. Processo nº, Recorrente, Recorrida (rótulos em negrito)
  4. 4 linhas em branco
  5. Qualificação do Recorrente + "com fundamento no artigo 102, inciso III, alínea 'a', da CF"
  6. Título "RECURSO EXTRAORDINÁRIO" (centralizado, negrito)
  7. 2 linhas em branco
  8. "em face do v. acórdão proferido pela..."
  9. Requerimento de recebimento e remessa ao STF
  10. 2 linhas em branco
  11. Fecho com data e assinatura

  QUEBRA DE PÁGINA

  SEGUNDO BLOCO (razões):
  12. Título "RAZÕES DO RECURSO EXTRAORDINÁRIO" (centralizado, negrito)
  13. 2 linhas em branco
  14. Recorrente, Recorrida, Origem (rótulos em negrito)
  15. 2 linhas em branco
  16. Saudação ao STF (três linhas separadas, negrito)
  17. 2 linhas em branco
  18. 1. DOS PRESSUPOSTOS DE ADMISSIBILIDADE
  - 1.1. Da Tempestividade e do preparo (art. 1.003, § 5º, CPC)
  - 1.2. Do Prequestionamento (Súmulas 282 e 356 STF)
  - 1.3. Da Repercussão Geral (art. 1.035 CPC — OBRIGATÓRIO no RE)
  - 1.4. Síntese da demanda (sentença, acórdão, embargos)
  19. 3. DO MÉRITO RECURSAL — com subseções 3.1, 3.2 argumentando violação constitucional
  20. 4. DOS PEDIDOS — letras a), b), c) (conhecimento, provimento, subsidiário)
  21. Fecho final com data e assinatura

  REGRAS DE CITAÇÃO:
  - Dispositivos constitucionais/legais: blockquote com texto completo do artigo
  - Jurisprudência DEVE ser em blockquote: <blockquote style="margin-left: 4cm;">"EMENTA..." (STF, RE/ARE nº, Tema, Rel. Min. Nome, Turma/Plenário, DJe data).</blockquote>
  - Doutrina DEVE ser em blockquote: <blockquote style="margin-left: 4cm;">"Texto da citação..." (AUTOR. Título. Edição. Editora, Ano, p. XX).</blockquote>
  - Trechos de sentença/acórdão recorrido DEVEM ser em blockquote
  - Use APENAS jurisprudência e doutrina REAIS e VERIFICÁVEIS
  - NÃO coloque citações em parágrafos <p> normais — use SEMPRE <blockquote style="margin-left: 4cm;">

  === REQUISITOS MÍNIMOS DE MÉRITO (OBRIGATÓRIOS — NÃO NEGOCIÁVEIS) ===

  O mérito do Recurso Extraordinário deve conter obrigatoriamente ao mínimo 4 (quatro) subtópicos numerados, cada um com mínimo de 5 (cinco) parágrafos de desenvolvimento real, substancial e específico para o caso concreto. Parágrafos genéricos ou de transição não contam para o mínimo.

  Os 4 subtópicos obrigatórios são:

  SUBTÓPICO A — DA REPERCUSSÃO GERAL
  Desenvolver em 5+ parágrafos: relevância econômica, política, social ou jurídica da questão; transcendência dos interesses individuais das partes; impacto da decisão sobre outros litígios semelhantes; referência ao Tema do STF se houver; por que a questão exige manifestação do Plenário do STF.

  SUBTÓPICO B — DA VIOLAÇÃO CONSTITUCIONAL CONCRETA
  Desenvolver em 5+ parágrafos: identificar o dispositivo constitucional violado (art. X, inciso Y, da CF/88); transcrever o dispositivo; demonstrar como o acórdão recorrido contraria o texto ou a interpretação consolidada do STF; distinguir questão constitucional de questão legal (o RE não é via para rediscutir matéria infraconstitucional pura); demonstrar que a questão foi prequestionada explicitamente.

  SUBTÓPICO C — DA TESE CONSTITUCIONAL E DO PRECEDENTE DO STF
  Desenvolver em 5+ parágrafos: trazer ao menos 1 (um) precedente do STF com NÚMERO REAL (RE, ARE ou ADI), Tema se houver, relator e data; transcrever a passagem relevante da ementa ou do voto; demonstrar a similitude fática e jurídica com o caso concreto; concluir pela aplicação do precedente ao caso.

  SUBTÓPICO D — DO PEDIDO E DOS EFEITOS DA REFORMA
  Desenvolver em 5+ parágrafos: o que exatamente deve ser reformado ou restabelecido; fundamento para cada pedido (principal e subsidiário); se for pedido de restabelecimento de sentença, explicar por que a sentença estava correta; eventuais efeitos práticos da reforma para as partes; pedido de modulação de efeitos se pertinente.

  REGRA ABSOLUTA DE PROFUNDIDADE:
  Não entregue a peça se qualquer subtópico tiver menos de 5 parágrafos reais. Complete o desenvolvimento ANTES de finalizar a resposta.
  Não cite jurisprudência ou doutrina com dados inventados. Se não tiver julgado real, desenvolva a argumentação sem citar julgado específico.

  ${citationRules}
  `;

  const recursoEspecialInstructions = `
  TAREFA: Redigir um RECURSO ESPECIAL completo e pronto para protocolo, atuando como verdadeiro redator jurídico especialista.

  ${htmlBaseRules}

  ${promptMestreJudicial}

  ${judicialContextualInstructions}

  FORMATAÇÃO HTML OBRIGATÓRIA (SEGUIR EXATAMENTE):

  === PRIMEIRO BLOCO (CAPA/PROTOCOLO) ===

  1. Endereçamento (alinhado à esquerda, negrito):
     <p style="text-align:left"><strong>EXCELENTÍSSIMO SENHOR DESEMBARGADOR PRESIDENTE DO EGRÉGIO TRIBUNAL DE JUSTIÇA DO DISTRITO FEDERAL E DOS TERRITÓRIOS</strong></p>
     (ou, conforme o tribunal de origem: EXCELENTÍSSIMO SENHOR DESEMBARGADOR FEDERAL VICE-PRESIDENTE DO EGRÉGIO TRIBUNAL REGIONAL FEDERAL DA ___ REGIÃO)

  2. Quatro linhas em branco após endereçamento:
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>

  3. Dados do processo (rótulos em negrito):
     <p><strong>Processo nº:</strong> [NÚMERO DO PROCESSO]</p>
     <p><strong>Recorrente:</strong> [NOME DO RECORRENTE EM MAIÚSCULAS]</p>
     <p><strong>Recorrida:</strong> [NOME DA RECORRIDA EM MAIÚSCULAS]</p>

  4. Quatro linhas em branco:
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>

  5. Parágrafo de qualificação (sem negrito):
     <p>[NOME DO RECORRENTE], já devidamente qualificado(a) nos autos do processo em epígrafe, por seus advogados infra-assinados, vem, respeitosamente, à presença de Vossa Excelência, com fundamento no artigo 105, inciso III, alíneas "a" e "c", da Constituição Federal, interpor o presente</p>

  6. Título centralizado e em negrito:
     <p style="text-align:center"><strong>RECURSO ESPECIAL</strong></p>

  7. Duas linhas em branco:
     <p class="empty-lines"></p>
     <p class="empty-lines"></p>

  8. Parágrafo "em face do":
     <p>em face do v. acórdão proferido pela ___ Turma/Câmara desse Egrégio Tribunal (ID [NÚMERO]), integrado pelo acórdão que rejeitou os Embargos de Declaração (ID [NÚMERO]), pelas razões de fato e de direito a seguir expostas.</p>

  9. Parágrafo de requerimento:
     <p>Requer, desde já, o recebimento e processamento do presente recurso, com a intimação da parte recorrida para, querendo, apresentar contrarrazões, e a posterior remessa dos autos ao Colendo Superior Tribunal de Justiça.</p>

  10. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  11. Fecho:
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>

  12. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  13. Local e data:
  <p>Brasília-DF, nesta data.</p>

  14. Quatro linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  15. Assinatura centralizada:
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  === QUEBRA DE PÁGINA ===
  <p class="page-break"></p>

  === SEGUNDO BLOCO (RAZÕES DO RECURSO) ===

  16. Título centralizado e em negrito:
  <p style="text-align:center"><strong>RAZÕES DO RECURSO ESPECIAL</strong></p>

  17. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  18. Dados do recurso (rótulos em negrito):
  <p><strong>Recorrente:</strong> [NOME EM MAIÚSCULAS]</p>
  <p><strong>Recorrida:</strong> [NOME EM MAIÚSCULAS]</p>
  <p><strong>Origem:</strong> [Tribunal] (Processo nº [NÚMERO])</p>

  19. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  20. Saudação ao tribunal (negrito, alinhado à esquerda, cada linha em parágrafo separado):
  <p style="text-align:left"><strong>EGRÉGIO SUPERIOR TRIBUNAL DE JUSTIÇA,</strong></p>
  <p style="text-align:left"><strong>COLENDA TURMA,</strong></p>
  <p style="text-align:left"><strong>ÍNCLITOS MINISTROS.</strong></p>

  21. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  22. Seções numeradas (negrito, alinhado à esquerda):
  <p style="text-align:left"><strong>1. DOS PRESSUPOSTOS DE ADMISSIBILIDADE</strong></p>

  23. Subseções numeradas (negrito, alinhado à esquerda):
  <p style="text-align:left"><strong>1.1. Da Tempestividade e do preparo</strong></p>
  (parágrafos: art. 1.003, § 5º, CPC — prazo 15 dias úteis, preparo pago)

  <p style="text-align:left"><strong>1.2. Do Prequestionamento</strong></p>
  (parágrafos: Súmulas 282 e 356 do STF + Súmula 211 do STJ — matéria debatida no acórdão)

  <p style="text-align:left"><strong>1.3. Do Dissídio Jurisprudencial</strong></p>
  (se aplicável — art. 105, III, "c", CF — divergência entre tribunais, com indicação dos acórdãos paradigma)

  <p style="text-align:left"><strong>1.4. Síntese da demanda</strong></p>
  (parágrafos: narrativa do caso, sentença, acórdão, embargos)

  24. Trechos de sentença/acórdão em blockquote:
  <blockquote style="margin-left: 4cm;">EMENTA: ...</blockquote>

  25. Seção de mérito:
  <p style="text-align:left"><strong>2. DO MÉRITO RECURSAL</strong></p>
  <p style="text-align:left"><strong>2.1. Da Violação ao Artigo [X] da Lei [Y]</strong></p>
  (parágrafos detalhados com argumentação infraconstitucional)
  <p style="text-align:left"><strong>2.2. [Segundo argumento de mérito]</strong></p>
  (parágrafos com fundamentação)

  26. Citações de jurisprudência em blockquote:
  <blockquote style="margin-left: 4cm;">"EMENTA..." (STJ, REsp nº XXXXX, Rel. Min. Nome, Turma, DJe data).</blockquote>

  27. Seção de pedidos:
  <p style="text-align:left"><strong>3. DOS PEDIDOS</strong></p>
  <p>Diante do exposto, requer o(a) Recorrente:</p>
  <p>a) O conhecimento do presente Recurso Especial, uma vez preenchidos todos os requisitos de admissibilidade;</p>
  <p>b) No mérito, o seu PROVIMENTO para, reformando o v. acórdão recorrido, restabelecer a r. sentença;</p>
  <p>c) subsidiariamente, [pedido subsidiário se houver].</p>

  28. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  29. Fecho final:
  <p>Nestes termos,</p>
  <p>Pede deferimento.</p>

  30. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  31. Local e data:
  <p>Brasília-DF, nesta data.</p>

  32. Duas linhas em branco:
  <p class="empty-lines"></p>
  <p class="empty-lines"></p>

  33. Assinatura centralizada:
  <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  ESTRUTURA OBRIGATÓRIA DA PEÇA:
  PRIMEIRO BLOCO (capa/protocolo):
  1. Endereçamento ao Presidente/Vice-Presidente do Tribunal (negrito, alinhado à esquerda)
  2. 4 linhas em branco
  3. Processo nº, Recorrente, Recorrida (rótulos em negrito)
  4. 4 linhas em branco
  5. Qualificação do Recorrente + "com fundamento no artigo 105, inciso III, da CF"
  6. Título "RECURSO ESPECIAL" (centralizado, negrito)
  7. 2 linhas em branco
  8. "em face do v. acórdão proferido pela..."
  9. Requerimento de recebimento e remessa ao STJ
  10. 2 linhas em branco
  11. Fecho com data e assinatura

  QUEBRA DE PÁGINA

  SEGUNDO BLOCO (razões):
  12. Título "RAZÕES DO RECURSO ESPECIAL" (centralizado, negrito)
  13. 2 linhas em branco
  14. Recorrente, Recorrida, Origem (rótulos em negrito)
  15. 2 linhas em branco
  16. Saudação ao STJ (três linhas separadas, negrito)
  17. 2 linhas em branco
  18. 1. DOS PRESSUPOSTOS DE ADMISSIBILIDADE
  - 1.1. Da Tempestividade e do preparo (art. 1.003, § 5º, CPC)
  - 1.2. Do Prequestionamento (Súmulas 282/356 STF + Súmula 211 STJ)
  - 1.3. Do Dissídio Jurisprudencial (se aplicável — art. 105, III, "c", CF)
  - 1.4. Síntese da demanda
  19. 2. DO MÉRITO RECURSAL — com subseções 2.1, 2.2 argumentando violação a lei federal
  20. 3. DOS PEDIDOS — letras a), b), c)
  21. Fecho final com data e assinatura

  REGRAS DE CITAÇÃO:
  - Dispositivos legais: blockquote com texto completo do artigo
  - Jurisprudência DEVE ser em blockquote: <blockquote style="margin-left: 4cm;">"EMENTA..." (STJ, REsp/AgInt nº, Rel. Min. Nome, Turma, DJe data).</blockquote>
  - Doutrina DEVE ser em blockquote: <blockquote style="margin-left: 4cm;">"Texto da citação..." (AUTOR. Título. Edição. Editora, Ano, p. XX).</blockquote>
  - Trechos de sentença/acórdão recorrido DEVEM ser em blockquote
  - Use APENAS jurisprudência e doutrina REAIS e VERIFICÁVEIS
  - NÃO coloque citações em parágrafos <p> normais — use SEMPRE <blockquote style="margin-left: 4cm;">

  DIFERENÇAS DO RECURSO ESPECIAL EM RELAÇÃO AO RE:
  - NÃO há exigência de repercussão geral (exclusivo do RE)
  - Fundamentação: violação a lei federal (art. 105, III, "a") e/ou dissídio jurisprudencial (art. 105, III, "c")
  - Tribunal de destino: Superior Tribunal de Justiça (STJ), não STF
  - Prequestionamento: além das Súmulas 282/356 STF, aplica-se a Súmula 211 do STJ

  === REQUISITOS MÍNIMOS DE MÉRITO (OBRIGATÓRIOS — NÃO NEGOCIÁVEIS) ===

  O mérito do Recurso Especial deve conter obrigatoriamente ao mínimo 4 (quatro) subtópicos numerados, cada um com mínimo de 5 (cinco) parágrafos de desenvolvimento real, substancial e específico para o caso concreto. Parágrafos genéricos ou de transição não contam para o mínimo.

  Os 4 subtópicos obrigatórios são:

  SUBTÓPICO A — DA DISTINÇÃO ENTRE FORTUITO INTERNO E FORTUITO EXTERNO
  (Aplicável quando a tese central envolver responsabilidade por fortuito. Se a tese for outra, substitua por subtópico equivalente de igual profundidade.)
  Desenvolver em 5+ parágrafos: conceito doutrinário de fortuito interno e externo; critério de distinção: se o risco é inerente à atividade da empresa ou externo a ela; enquadramento do caso concreto no conceito de fortuito interno; por que a fraude/falha decorre da atividade típica da instituição; impacto dessa classificação sobre a responsabilidade objetiva.

  SUBTÓPICO B — DA FALHA ESPECÍFICA DO SISTEMA / DO SERVIÇO
  Desenvolver em 5+ parágrafos: identificar qual falha concreta do sistema, serviço ou procedimento da parte recorrida deu causa ao dano; demonstrar que era possível e exigível prevenir ou detectar a falha (ex: ausência de autenticação reforçada, inexistência de alertas de transação atípica, falha em protocolo de segurança); ligar a falha específica à responsabilidade objetiva; citar normas regulatórias aplicáveis (BCB, CDC, lei específica do setor); demonstrar nexo causal entre a falha e o dano sofrido.

  SUBTÓPICO C — DOS DANOS MORAIS (SE PLEITEADOS)
  Desenvolver em 5+ parágrafos: natureza in re ipsa do dano moral na situação concreta; distinção entre mero aborrecimento e dano moral indenizável; impacto real na vida do lesado; critérios para fixação do quantum (proporcionalidade, razoabilidade, caráter pedagógico-preventivo, condição econômica das partes); citar ao menos 2 julgados do STJ com número REAL (REsp ou AgInt/AgRg em REsp) sobre quantificação de danos morais em casos análogos.

  SUBTÓPICO D — DO DISSÍDIO JURISPRUDENCIAL / DA VIOLAÇÃO LEGAL
  Desenvolver em 5+ parágrafos: identificar o dispositivo legal federal violado pelo acórdão recorrido (art. X da Lei Y); demonstrar como o acórdão recorrido interpretou ou aplicou incorretamente esse dispositivo; trazer ao menos 1 (um) acórdão paradigma do STJ com NÚMERO REAL (REsp ou AREsp), identificando turma, relator e data, e transcrever a passagem relevante que contradiz o entendimento do acórdão recorrido; demonstrar a similitude fática entre o paradigma e o caso concreto; concluir porque a tese do STJ deve prevalecer.

  REGRA ABSOLUTA DE PROFUNDIDADE:
  Não entregue a peça se qualquer subtópico tiver menos de 5 parágrafos reais. Complete o desenvolvimento ANTES de finalizar a resposta.
  Não cite jurisprudência ou doutrina com dados inventados. Se não tiver julgado real, desenvolva a argumentação sem citar julgado específico, ou cite apenas a Súmula correspondente.

  ${citationRules}
  `;

  const contractInstructions = `
  TAREFA: Redigir um ${pieceLabel} completo e pronto para assinatura.

  ${htmlBaseRules}

  FORMATAÇÃO HTML OBRIGATÓRIA:
  - Título: <p><strong>${pieceLabel.toUpperCase()}</strong></p>
  - Subtítulos de cláusula: <p><strong>CLÁUSULA PRIMEIRA - DO OBJETO</strong></p>
  - Parágrafos normais: <p>texto</p>
  - Parágrafos de cláusula: <p><strong>Parágrafo Único.</strong> texto</p>
  - Local/data: <p>Brasília, ___ de ___ de ___.</p>
  - Assinaturas: <p>___________________________<br><strong>[NOME DA PARTE]</strong><br>[CPF/CNPJ]</p>
  - Testemunhas: <p>___________________________<br>Testemunha 1 - [Nome]<br>CPF: [número]</p>

  ESTRUTURA OBRIGATÓRIA PARA CONTRATOS:
  1. Título do contrato (em negrito)
  2. Preâmbulo com qualificação completa das partes (CONTRATANTE e CONTRATADO/CONTRATADA)
  3. CLÁUSULAS numeradas sequencialmente, cada uma com título descritivo:
     - DO OBJETO
     - DO PRAZO / DA VIGÊNCIA
     - DO PREÇO E CONDIÇÕES DE PAGAMENTO
     - DAS OBRIGAÇÕES DO CONTRATANTE
     - DAS OBRIGAÇÕES DO CONTRATADO
     - DA RESCISÃO
     - DA CONFIDENCIALIDADE (se aplicável)
     - DAS PENALIDADES
     - DAS DISPOSIÇÕES GERAIS
     - DO FORO
  4. Local e data
  5. Campos de assinatura das partes
  6. Campos para testemunhas (2)

  Adapte as cláusulas ao tipo específico de contrato solicitado nas instruções do usuário. Se o usuário especificar cláusulas ou termos específicos, obedeça fielmente.
  `;

  const notificationInstructions = `
  TAREFA: Redigir uma ${pieceLabel} completa e pronta para envio.

  ${htmlBaseRules}

  FORMATAÇÃO HTML OBRIGATÓRIA:
  - Título: <p><strong>NOTIFICAÇÃO EXTRAJUDICIAL</strong></p>
  - Cabeçalho: <p><strong>NOTIFICANTE:</strong> [qualificação completa]</p>
  - Cabeçalho: <p><strong>NOTIFICADO(A):</strong> [qualificação completa]</p>
  - Títulos de seção: <p><strong>DOS FATOS</strong></p>, <p><strong>DO DIREITO</strong></p>, <p><strong>DA NOTIFICAÇÃO</strong></p>
  - Parágrafos normais: <p>texto</p>
  - Local/data: <p>Brasília, ___ de ___ de ___.</p>
  - Assinatura: <p style="text-align:center"><strong>[ADVOGADO_NOME]</strong><br>[ADVOGADO_OAB]</p>

  ESTRUTURA OBRIGATÓRIA PARA NOTIFICAÇÃO:
  1. Título "NOTIFICAÇÃO EXTRAJUDICIAL" (em negrito)
  2. Identificação do NOTIFICANTE (qualificação completa)
  3. Identificação do NOTIFICADO (qualificação completa)
  4. DOS FATOS - exposição clara e detalhada dos fatos
  5. DO DIREITO - fundamentação legal aplicável
  6. DA NOTIFICAÇÃO - declaração formal notificando o destinatário
  7. Prazo concedido para resposta/cumprimento
  8. Consequências jurídicas do não atendimento
  9. Local e data
  10. Assinatura do advogado/notificante

  Adapte o tom e conteúdo ao tipo de notificação solicitada. Se o usuário especificar termos ou exigências, obedeça fielmente.
  `;

  const settlementInstructions = `
  TAREFA: Redigir um ${pieceLabel} completo e pronto para assinatura.

  ${htmlBaseRules}

  FORMATAÇÃO HTML OBRIGATÓRIA:
  - Título: <p><strong>${pieceLabel.toUpperCase()}</strong></p>
  - Cabeçalhos de partes: <p><strong>PARTE 1 (CREDOR/PROPONENTE):</strong> [qualificação]</p>
  - Títulos de cláusula: <p><strong>CLÁUSULA PRIMEIRA - DO OBJETO</strong></p>
  - Parágrafos normais: <p>texto</p>
  - Local/data: <p>Brasília, ___ de ___ de ___.</p>
  - Assinaturas: <p>___________________________<br><strong>[NOME]</strong><br>[CPF/CNPJ]</p>

  ESTRUTURA OBRIGATÓRIA PARA ACORDO:
  1. Título do documento (em negrito)
  2. Preâmbulo com qualificação completa das partes
  3. CLÁUSULAS:
     - DO OBJETO DO ACORDO
     - DO VALOR E FORMA DE PAGAMENTO
     - DOS PRAZOS
     - DAS OBRIGAÇÕES DAS PARTES
     - DA MULTA POR DESCUMPRIMENTO
     - DA QUITAÇÃO (parcial ou total)
     - DAS DISPOSIÇÕES GERAIS
     - DO FORO
  4. Local e data
  5. Campos de assinatura das partes
  6. Campos para testemunhas (2)

  Adapte as cláusulas conforme o tipo de acordo. Se for proposta, use tom propositivo. Se for termo de composição, use tom definitivo. Obedeça fielmente as instruções do usuário.
  `;

  const otherDocInstructions = `
  TAREFA: Redigir o documento solicitado: "${pieceLabel}".

  ${htmlBaseRules}

  INSTRUÇÕES ESPECIAIS:
  - Siga FIELMENTE as instruções do usuário para determinar o formato e conteúdo do documento
  - Use formatação profissional jurídica com HTML
  - Títulos em <p><strong>TÍTULO</strong></p>
  - Parágrafos em <p>texto</p>
  - Se o usuário não especificar formato, use estrutura profissional adequada ao tipo de documento
  - Inclua local, data e campos de assinatura quando aplicável
  - NÃO use formato de petição judicial a menos que o usuário solicite expressamente

  ${citationRules}
  `;

  const webSearchTypes = [
    "peticao_inicial", "cumprimento_sentenca", "contestacao",
    "habeas_corpus", "mandado_seguranca", "recurso_apelacao",
    "agravo_instrumento", "recurso_especial", "recurso_extraordinario",
    "acao_monitoria", "execucao", "impugnacao_embargos_execucao",
    "impugnacao_embargos_monitoria",
  ];
  const shouldWebSearch = webSearchTypes.includes(templateType) && !hasReferenceModel;

  if (shouldWebSearch) {
    const serpApiKey = process.env.SERPAPI_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (serpApiKey || serperKey) {
      console.log(`[Studio] Running web search for ${pieceLabel}...`);

      const sanitizedPrompt = prompt.substring(0, 300)
        .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '') // CPF
        .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '') // CNPJ
        .replace(/\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/g, '') // process number
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '') // email
        .replace(/\(\d{2}\)\s?\d{4,5}-?\d{4}/g, '') // phone
        .replace(/\s{2,}/g, ' ').trim();
      const searchQuery = `${sanitizedPrompt} jurisprudência ${pieceLabel}`;

      const doSearch = async (query: string): Promise<string> => {
        if (serpApiKey) {
          try {
            const params = new URLSearchParams({
              api_key: serpApiKey, q: query, google_domain: "google.com.br", gl: "br", hl: "pt-br", num: "8",
            });
            const res = await fetch(`https://serpapi.com/search?${params}`);
            if (res.ok) {
              const data = await res.json() as any;
              let results = "";
              if (data.organic_results) {
                for (const r of data.organic_results.slice(0, 8)) {
                  results += `- ${r.title}: ${r.snippet || ""} (${r.link})\n`;
                }
              }
              return results;
            }
          } catch (e: any) {
            console.error("[Studio] SerpAPI search error:", e?.message);
          }
        }
        if (serperKey) {
          try {
            const res = await fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
              body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 8 }),
            });
            if (res.ok) {
              const data = await res.json() as any;
              let results = "";
              if (data.organic) {
                for (const r of data.organic.slice(0, 8)) {
                  results += `- ${r.title}: ${r.snippet || ""} (${r.link})\n`;
                }
              }
              return results;
            }
          } catch (e: any) {
            console.error("[Studio] Serper search error:", e?.message);
          }
        }
        return "";
      };

      try {
        const [jurisResults, legResults] = await Promise.all([
          doSearch(`${searchQuery} site:jusbrasil.com.br OR site:stj.jus.br OR site:stf.jus.br OR site:tjdft.jus.br`),
          doSearch(`${sanitizedPrompt.substring(0, 200)} legislação artigo lei código doutrina ${pieceLabel}`),
        ]);

        if (jurisResults.trim() || legResults.trim()) {
          contextBuilder += `\n=== RESULTADOS DA PESQUISA WEB (JURISPRUDÊNCIA E LEGISLAÇÃO) ===\n`;
          contextBuilder += `INSTRUÇÃO SOBRE USO DOS RESULTADOS DA PESQUISA:\n`;
          contextBuilder += `- Utilize estes resultados como referência para fundamentar a peça com fontes REAIS\n`;
          contextBuilder += `- Cite APENAS fontes que apareçam nos resultados abaixo com dados completos (número, relator, data, tribunal)\n`;
          contextBuilder += `- Se um resultado tem snippet parcial sem dados completos do julgado, NÃO complete com dados inventados — cite apenas o que está nos resultados\n`;
          contextBuilder += `- Se nenhum resultado é relevante o suficiente para citar, NÃO invente jurisprudência — simplesmente não cite\n`;
          contextBuilder += `- PROIBIDO misturar dados de julgados diferentes para criar uma citação falsa\n\n`;
          if (jurisResults.trim()) {
            contextBuilder += `JURISPRUDÊNCIA ENCONTRADA:\n${jurisResults}\n`;
          }
          if (legResults.trim()) {
            contextBuilder += `LEGISLAÇÃO E DOUTRINA ENCONTRADA:\n${legResults}\n`;
          }
          console.log(`[Studio] Web search completed. Juris: ${jurisResults.length} chars, Leg: ${legResults.length} chars`);
        }
      } catch (err: any) {
        console.error("[Studio] Web search error:", err?.message);
      }
    }
  }

  let strictInstructions: string;

  if (hasReferenceModel) {
    strictInstructions = referenceModelInstructions;
  } else if (templateType === "contrarrazoes") {
    strictInstructions = contrarrazoesInstructions;
  } else if (templateType === "acao_monitoria") {
    strictInstructions = acaoMonitoriaInstructions;
  } else if (templateType === "execucao") {
    strictInstructions = execucaoInstructions;
  } else if (templateType === "impugnacao_embargos_execucao") {
    strictInstructions = impugnacaoEmbargosExecucaoInstructions;
  } else if (templateType === "impugnacao_embargos_monitoria") {
    strictInstructions = impugnacaoEmbargosMonitoriaInstructions;
  } else if (templateType === "acordo_extrajudicial") {
    strictInstructions = acordoExtrajudicialInstructions;
  } else if (templateType === "pesquisa_sistemas") {
    strictInstructions = pesquisaSistemasInstructions;
  } else if (templateType === "indicacao_enderecos") {
    strictInstructions = indicacaoEnderecosInstructions;
  } else if (templateType === "recurso_extraordinario") {
    strictInstructions = recursoExtraordinarioInstructions;
  } else if (templateType === "recurso_especial") {
    strictInstructions = recursoEspecialInstructions;
  } else if (isPetition) {
    strictInstructions = petitionInstructions;
  } else if (templateType === "contrato") {
    strictInstructions = contractInstructions;
  } else if (templateType === "notificacao_extrajudicial") {
    strictInstructions = notificationInstructions;
  } else if (templateType === "renegociacao_divida") {
    strictInstructions = renegociacaoDividaInstructions;
  } else if (templateType === "proposta_acordo" || templateType === "termo_acordo") {
    strictInstructions = settlementInstructions;
  } else {
    strictInstructions = otherDocInstructions;
  }

  const hasPartyData = Object.values(extractedClientFields).some(v => v) || Object.values(extractedDebtorFields).some(v => v);
  if (hasPartyData) {
    const before = strictInstructions;
    strictInstructions = prefillBuiltInTemplate(strictInstructions, extractedClientFields, extractedDebtorFields);
    if (strictInstructions !== before) {
      console.log(`[Studio] Pre-filled built-in template placeholders in system instructions with real party data`);
    }
  }

  if (partiesSystemBlock) {
    strictInstructions += partiesSystemBlock;
    const clientFieldCount = Object.values(extractedClientFields).filter(v => v).length;
    const debtorFieldCount = Object.values(extractedDebtorFields).filter(v => v).length;
    console.log(`[Studio] Injected party data into system instructions (client: ${clientFieldCount} fields, debtor: ${debtorFieldCount} fields)`);
  }

  const finalReminder = `\n\n=== LEMBRETE FINAL (OBRIGATÓRIO — CHECAR ANTES DE ENTREGAR) ===
  Antes de entregar sua resposta, verifique cada item abaixo. Se qualquer item falhar, CORRIJA imediatamente — não entregue peça incompleta ou com erros:

  1. JURISPRUDÊNCIA: Toda jurisprudência citada tem número de processo REAL, relator REAL, turma REAL e data REAL? Se qualquer julgado tem "XXXXXXX", "[NÚMERO]", "[MINISTRO]", "[DATA]" ou dado inventado ou incompleto — REMOVA-O imediatamente. Não há meio-termo: dados inventados comprometem a peça inteira.

  2. DOUTRINA: Toda referência doutrinária tem autor REAL, obra REAL, editora REAL que você tem certeza absoluta de existirem? Se você não pode verificar com certeza a existência do autor, da obra ou da editora — REMOVA a citação e mantenha apenas a afirmação jurídica sem atribuição de fonte. Inventar doutrina é vedado sem exceção.

  3. PROFUNDIDADE MÍNIMA: Cada subtítulo de mérito tem ao mínimo 5 (cinco) parágrafos de desenvolvimento real, substancial e específico para o caso concreto? Parágrafos genéricos não contam. Se algum subtópico tem menos de 5 parágrafos reais — DESENVOLVA antes de entregar.

  4. ESPECIFICIDADE: Nenhum parágrafo é tão genérico que poderia ser usado em qualquer outra peça do mesmo tipo sem alterar uma vírgula? Se sim, reescreva com fatos e argumentos do caso concreto.

  5. LÓGICA RECURSAL (apenas para recursos): O diagnóstico processual está correto — recorrente, recorrido e objetivo do recurso coerentes com o que foi descrito no caso? A narrativa não está invertida?

  6. PEDIDO SUBSIDIÁRIO (apenas para recursos): Há pedido subsidiário formulado além do pedido principal de provimento?

  7. ASSINATURA: A assinatura usa os placeholders [ADVOGADO_NOME] e [ADVOGADO_OAB]?
  `;

  const userContent = contextBuilder + finalReminder;
  const fullContext = strictInstructions + userContent;

  const estimatedTokens = Math.ceil(fullContext.length / 3.5);
  const useGemini = hasReferenceModel || estimatedTokens > 110000;
  const modelUsed = useGemini ? "gemini-2.5-pro" : "gpt-4o";

  if (useGemini && !hasReferenceModel) {
    console.log(`[Studio] Context too large for OpenAI (~${estimatedTokens} tokens). Switching to Gemini.`);
  }

  const isLongFormPiece = ["contrarrazoes", "recurso_apelacao", "recurso_especial", "recurso_extraordinario", "agravo_instrumento"].includes(templateType);
  const outputMaxTokens = isLongFormPiece ? 32000 : 16000;

  const response = useGemini
    ? await aiService.chatWithGemini(userContent, strictInstructions)
    : await aiService.chat(
        [{ role: "user", content: userContent }],
        [],
        { systemPromptOverride: strictInstructions, maxTokens: outputMaxTokens, temperature: 0.1 }
      );

  let contentHtml = response.content;

  if (!contentHtml.includes("<") || !contentHtml.includes(">")) {
    contentHtml = `<div style="white-space: pre-wrap; font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5;">${contentHtml.replace(/\n/g, "<br>")}</div>`;
  }

  if (multipleAttorneys && multipleAttorneys.length > 1) {
    const dualSignatureHtml = multipleAttorneys.map(a =>
      `<p style="text-align:center"><strong>${a.name}</strong><br>${a.oab}</p>`
    ).join("\n");
    contentHtml = contentHtml
      .replace(/<p[^>]*style="text-align:\s*center"[^>]*>\s*<strong>\s*\[ADVOGADO_NOME\]\s*<\/strong>\s*<br\s*\/?>\s*\[ADVOGADO_OAB\]\s*<\/p>/gi, dualSignatureHtml)
      .replace(/\[ADVOGADO_NOME\][\s\S]*?\[ADVOGADO_OAB\]/gi, multipleAttorneys.map(a => `${a.name}\n${a.oab}`).join("\n\n"))
      .replace(/\{ADVOGADO_NOME\}[\s\S]*?\{ADVOGADO_OAB\}/g, multipleAttorneys.map(a => `${a.name}\n${a.oab}`).join("\n\n"))
      .replace(/\{\{ADVOGADO_NOME\}\}[\s\S]*?\{\{ADVOGADO_OAB\}\}/g, multipleAttorneys.map(a => `${a.name}\n${a.oab}`).join("\n\n"));
  } else {
    contentHtml = contentHtml
      .replace(/\[ADVOGADO_NOME\]/gi, selectedAtty.name)
      .replace(/\[ADVOGADO_OAB\]/gi, selectedAtty.oab)
      .replace(/\{ADVOGADO_NOME\}/g, selectedAtty.name)
      .replace(/\{ADVOGADO_OAB\}/g, selectedAtty.oab)
      .replace(/\{\{ADVOGADO_NOME\}\}/g, selectedAtty.name)
      .replace(/\{\{ADVOGADO_OAB\}\}/g, selectedAtty.oab);
  }
  contentHtml = contentHtml
    .replace(/\[CIDADE\]/gi, "Brasília")
    .replace(/\[DATA\]/gi, brasiliaDate)
    .replace(/\[LOCAL\]/gi, "Brasília/DF")
    .replace(/Brasília,?\s*nesta data\.?/gi, `Brasília, ${brasiliaDate}.`)
    .replace(/<blockquote(?!\s+style)>/gi, '<blockquote style="margin-left: 4cm;">');

  await storage.createAiGenerationLog({
    tenantId: params.tenantId || 1,
    userId: 5,
    generationType: "studio_piece",
    prompt: prompt.substring(0, 500),
    citations: response.citations as any,
    modelUsed,
    tokensUsed: response.tokensUsed,
    outputPreview: response.content.substring(0, 500),
  });

    return {
      contentHtml,
      content: response.content,
      citations: response.citations,
      tokensUsed: response.tokensUsed,
    };
  }
  