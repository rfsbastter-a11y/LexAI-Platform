import OpenAI from "openai";
import type { Negotiation, Case, Client, NegotiationContact, NegotiationRound } from "@shared/schema";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function decodeDocxTemplateFromDataUrl(dataUrl?: string | null): Buffer | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,(.+)$/i);
  if (!match?.[1]) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

export async function generateAIAnalysis(
  negotiation: Negotiation,
  caseData: Case | null | undefined,
  client: Client | undefined,
  rounds: NegotiationRound[]
): Promise<{ analysis: string; riskScore: string }> {
  const systemPrompt = `Você é um consultor jurídico especializado em negociações e acordos no direito brasileiro. 
Analise os dados da negociação e forneça:
1. Análise de risco/benefício detalhada
2. Score de risco (baixo/médio/alto/muito_alto)
3. Recomendações estratégicas
4. Pontos de atenção

Responda em português brasileiro, de forma clara e objetiva.`;

  const context = `
DADOS DA NEGOCIAÇÃO:
- Status: ${negotiation.status}
- Valor mínimo: R$ ${negotiation.minValue || 'não definido'}
- Valor máximo: R$ ${negotiation.maxValue || 'não definido'}
- Valor proposta atual: R$ ${negotiation.currentProposalValue || 'não definido'}
- Condições: ${negotiation.conditions || 'não definidas'}
- Prazo: ${negotiation.deadline ? new Date(negotiation.deadline).toLocaleDateString('pt-BR') : 'não definido'}

${caseData ? `PROCESSO:
- Número: ${caseData.caseNumber || 'N/A'}
- Tipo: ${caseData.caseType || 'N/A'}
- Vara/Tribunal: ${caseData.court || 'N/A'}
- Status: ${caseData.status || 'N/A'}
- Valor da causa: ${caseData.estimatedValue || 'N/A'}
- Parte adversa: ${caseData.adversePartyName || 'N/A'}` : ''}

${client ? `CLIENTE:
- Nome: ${client.name}
- Tipo: ${client.type}` : ''}

HISTÓRICO DE RODADAS (${rounds.length} rodadas):
${rounds.map((r, i) => `Rodada ${i + 1}: ${r.type} - R$ ${r.value || 'N/A'} - ${r.conditions || ''}`).join('\n')}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analise esta negociação e forneça sua avaliação:\n\n${context}` },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const analysis = response.choices[0]?.message?.content || "Análise indisponível";
  
  const riskMatch = analysis.toLowerCase().match(/(?:score|risco|nível).*?(baixo|médio|alto|muito.?alto)/);
  const riskScore = riskMatch ? riskMatch[1].replace(/\s+/g, '_') : "médio";

  return { analysis, riskScore };
}

export async function generateProposal(
  negotiation: Negotiation,
  caseData: Case | null | undefined,
  client: Client | undefined,
  contacts: NegotiationContact[],
  rounds: NegotiationRound[],
  params: { value?: string; conditions?: string; tone?: string }
): Promise<{ html: string; subject: string; plainText: string }> {
  const systemPrompt = `Você é um advogado especialista em negociações do escritório Marques e Serra (Dr. Ronald Serra, OAB/DF 23.947).
Gere uma proposta de acordo formal e profissional em HTML.
A proposta deve:
1. Ser formalmente redigida seguindo padrões jurídicos brasileiros
2. Incluir referência ao processo (se houver)
3. Apresentar os termos da proposta de forma clara
4. Incluir condições e prazos
5. Ter tom ${params.tone || 'profissional e cordial'}
6. NÃO incluir dados fictícios - use apenas os dados fornecidos

Responda APENAS com o HTML da proposta, sem markdown ou explicações.`;

  const recipientContact = contacts[0];
  
  const context = `
GERAR PROPOSTA DE ACORDO COM ESTES DADOS:

DESTINATÁRIO:
- Nome: ${recipientContact?.name || 'Parte Adversa'}
- Qualidade: ${recipientContact?.role === 'advogado_adverso' ? 'Advogado da parte adversa' : 'Parte adversa'}

CLIENTE (PROPONENTE):
- Nome: ${client?.name || 'N/A'}
- Documento: ${client?.document || 'N/A'}

${caseData ? `PROCESSO:
- Número: ${caseData.caseNumber || 'N/A'}
- Vara/Tribunal: ${caseData.court || 'N/A'}
- Valor da causa: ${caseData.estimatedValue || 'N/A'}` : ''}

TERMOS DA PROPOSTA:
- Valor: R$ ${params.value || negotiation.currentProposalValue || negotiation.maxValue || 'a definir'}
- Condições: ${params.conditions || negotiation.conditions || 'a definir'}
- Prazo para resposta: ${negotiation.deadline ? new Date(negotiation.deadline).toLocaleDateString('pt-BR') : '10 dias úteis'}

HISTÓRICO DE RODADAS ANTERIORES:
${rounds.length > 0 ? rounds.map((r, i) => `Rodada ${i + 1}: ${r.type} - R$ ${r.value || 'N/A'} - ${r.conditions || ''} - Resposta: ${r.response || 'aguardando'}`).join('\n') : 'Primeira proposta'}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: context },
    ],
    temperature: 0.4,
    max_tokens: 3000,
  });

  const html = response.choices[0]?.message?.content || "<p>Erro ao gerar proposta</p>";
  
  const subjectResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Gere um assunto de email curto e profissional para esta proposta de acordo. Responda APENAS com o texto do assunto, sem aspas." },
      { role: "user", content: `Proposta de acordo ${caseData ? `- Processo nº ${caseData.caseNumber}` : ''} - ${client?.name || 'Cliente'} - Valor R$ ${params.value || negotiation.currentProposalValue || ''}` },
    ],
    temperature: 0.3,
    max_tokens: 100,
  });

  const subject = subjectResponse.choices[0]?.message?.content || `Proposta de Acordo - ${client?.name || 'Negociação'}`;
  const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  return { html, subject, plainText };
}

export async function generateWhatsAppMessage(
  negotiation: Negotiation,
  caseData: Case | null | undefined,
  client: Client | undefined,
  contact: NegotiationContact | undefined,
  rounds: NegotiationRound[],
  params: { value?: string; conditions?: string; tone?: string }
): Promise<string> {
  const strategy = negotiation.strategy || 'moderada';
  const negotiationConditions = params.conditions || negotiation.conditions || '';

  let strategyInstruction = '';
  if (strategy === 'agressiva') {
    strategyInstruction = `ESTRATÉGIA AGRESSIVA: Seja FIRME e DIRETO. Não dê margem para enrolação. Deixe claro que esta é uma oportunidade única e que medidas judiciais serão tomadas caso não haja acordo. Tom assertivo e sem rodeios.`;
  } else if (strategy === 'conservadora') {
    strategyInstruction = `ESTRATÉGIA CONSERVADORA: Seja muito cordial e empático. Demonstre compreensão pela situação do devedor. Ofereça flexibilidade e mostre disposição para encontrar uma solução boa para ambas as partes.`;
  } else {
    strategyInstruction = `ESTRATÉGIA MODERADA: Seja profissional e equilibrado. Cordial mas objetivo. Apresente a proposta de forma clara sem ser agressivo nem excessivamente flexível.`;
  }

  let conditionsInstruction = '';
  if (negotiationConditions) {
    conditionsInstruction = `\nINSTRUÇÕES ESPECÍFICAS DO ADVOGADO: ${negotiationConditions}\nVocê DEVE incorporar estas instruções no tom e conteúdo da mensagem.`;
  }

  const systemPrompt = `Você é um profissional do escritório Marques e Serra, responsável por negociações de acordos e cobranças.
Gere uma mensagem de WhatsApp para negociação.
A mensagem deve:
1. Identificar-se como sendo "do escritório Marques e Serra" (linguagem natural, como um funcionário real)
2. Mencionar o valor e condições da proposta
3. Ser adequada para WhatsApp (texto simples, sem HTML, máximo 500 caracteres)
4. NÃO incluir dados fictícios
5. Usar formatação WhatsApp (*negrito*, _itálico_) quando adequado
6. Incluir chamada para ação clara

${strategyInstruction}${conditionsInstruction}

Responda APENAS com o texto da mensagem, sem explicações.`;

  const context = `
DEVEDOR: ${contact?.name || 'N/A'}
DOCUMENTO: ${contact?.document || 'N/A'}
CLIENTE (CREDOR): ${client?.name || 'N/A'}
${caseData ? `PROCESSO: ${caseData.caseNumber || 'N/A'}` : ''}
VALOR DA PROPOSTA: R$ ${params.value || negotiation.currentProposalValue || negotiation.maxValue || 'a definir'}
CONDIÇÕES: ${params.conditions || negotiation.conditions || 'a definir'}
PRAZO: ${negotiation.deadline ? new Date(negotiation.deadline).toLocaleDateString('pt-BR') : 'a combinar'}
ESTRATÉGIA: ${strategy.toUpperCase()}

HISTÓRICO: ${rounds.length > 0 ? rounds.map((r, i) => `Rodada ${i + 1}: ${r.type} - ${r.message || 'sem mensagem'}`).join(' | ') : 'Primeiro contato'}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Gere a mensagem de WhatsApp para este devedor:\n\n${context}` },
    ],
    temperature: 0.5,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || "Erro ao gerar mensagem";
}

export async function generateAgreement(
  negotiation: Negotiation,
  caseData: Case | null | undefined,
  client: Client | undefined,
  contacts: NegotiationContact[],
  rounds: NegotiationRound[],
  params: { value: string; conditions?: string; installments?: string }
): Promise<{ html: string; plainText: string; filename: string; wordBuffer?: Buffer }> {
  const recipientContact = contacts[0];
  const today = new Date();
  const formattedDate = today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const lastRound = rounds[0];
  const agreedValue = params.value || lastRound?.value || negotiation.currentProposalValue || negotiation.maxValue || "0";

  const systemPrompt = `Você é um advogado especialista do escritório Marques e Serra (Dr. Ronald Serra, OAB/DF 23.947).
Gere um TERMO DE COMPOSIÇÃO EXTRAJUDICIAL completo, formal e juridicamente válido.

FORMATO DE SAÍDA: Texto corrido estruturado (NÃO use HTML, NÃO use markdown). Use apenas texto puro com quebras de linha.

O documento DEVE seguir esta estrutura exata:

TERMO DE COMPOSIÇÃO EXTRAJUDICIAL

QUALIFICAÇÃO DAS PARTES:
CREDOR(A): Nome completo, CPF/CNPJ, endereço (quando disponível)
DEVEDOR(A): Nome completo, CPF/CNPJ, endereço (quando disponível)

Se houver processo judicial: referência ao número do processo, vara e tribunal

CLÁUSULAS:
Cláusula 1ª - DO OBJETO: Reconhecimento da dívida pelo devedor, com valor original e origem.
Cláusula 2ª - DO VALOR E FORMA DE PAGAMENTO: Valor total acordado, forma de pagamento detalhada (à vista ou parcelado com datas e valores de cada parcela).
Cláusula 3ª - DOS DADOS PARA PAGAMENTO: [DADOS BANCÁRIOS DO CREDOR - A SEREM INFORMADOS]
Cláusula 4ª - DO INADIMPLEMENTO: Multa de 10% sobre o saldo devedor, juros moratórios de 1% ao mês, vencimento antecipado de todas as parcelas.
Cláusula 5ª - DA HOMOLOGAÇÃO JUDICIAL: Se houver processo, pedido de homologação ou extinção do feito.
Cláusula 6ª - DAS DISPOSIÇÕES GERAIS: Boa-fé, irretratabilidade, irrevogabilidade, eleição de foro de Brasília/DF.
Cláusula 7ª - DA CONFIDENCIALIDADE: Os termos deste acordo são confidenciais.

LOCAL E DATA: Brasília/DF, ${formattedDate}

ASSINATURAS:
_______________________________
CREDOR(A): [nome] - CPF/CNPJ: [documento]

_______________________________
DEVEDOR(A): [nome] - CPF/CNPJ: [documento]

TESTEMUNHAS:
1. _______________________________
   Nome:
   CPF:

2. _______________________________
   Nome:
   CPF:

ADVOGADO RESPONSÁVEL:
[ADVOGADO_NOME]
[ADVOGADO_OAB]

REGRAS ABSOLUTAS:
- Use APENAS dados fornecidos, NUNCA invente dados pessoais
- Use "[NÃO INFORMADO]" quando não houver informação
- NÃO use HTML, NÃO use markdown, NÃO use negrito com asteriscos
- Use APENAS texto puro com quebras de linha
- Linguagem jurídica formal e precisa
- Escreva por extenso valores monetários (ex: R$ 8.500,00 - oito mil e quinhentos reais)`;

  const context = `DADOS PARA O TERMO DE COMPOSIÇÃO EXTRAJUDICIAL:

CREDOR(A) - CLIENTE DO ESCRITÓRIO:
- Nome: ${client?.name || "[NÃO INFORMADO]"}
- CPF/CNPJ: ${client?.document || "[NÃO INFORMADO]"}
- Endereço: ${client?.address || "[NÃO INFORMADO]"}
- Telefone: ${client?.phone || "[NÃO INFORMADO]"}
- Email: ${client?.email || "[NÃO INFORMADO]"}

DEVEDOR(A) - PARTE ADVERSA:
- Nome: ${recipientContact?.name || "[NÃO INFORMADO]"}
- CPF/CNPJ: ${recipientContact?.document || "[NÃO INFORMADO]"}
- Endereço: ${recipientContact?.address ? `${recipientContact.address}${recipientContact?.city ? `, ${recipientContact.city}` : ""}${recipientContact?.state ? `/${recipientContact.state}` : ""}` : "[NÃO INFORMADO]"}
- Telefone: ${recipientContact?.phone || recipientContact?.whatsapp || "[NÃO INFORMADO]"}
- Email: ${recipientContact?.email || "[NÃO INFORMADO]"}

${caseData ? `PROCESSO JUDICIAL:
- Número: ${caseData.caseNumber || "N/A"}
- Vara/Tribunal: ${caseData.court || "N/A"} ${caseData.vara ? `- ${caseData.vara}` : ""}
- Valor da causa: R$ ${caseData.estimatedValue || "N/A"}` : "SEM PROCESSO JUDICIAL VINCULADO"}

TERMOS DO ACORDO:
- Valor total acordado: R$ ${agreedValue}
- Forma de pagamento: ${params.installments || "À vista"}
- Condições especiais: ${params.conditions || negotiation.conditions || "Sem condições especiais"}
- Data do acordo: ${formattedDate}

HISTÓRICO DE NEGOCIAÇÃO (${rounds.length} rodadas):
${rounds.map((r, i) => `Rodada ${i + 1}: ${r.type} - R$ ${r.value || "N/A"}`).join("\n")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Gere o Termo de Composição Extrajudicial com estes dados:\n\n${context}` },
    ],
    temperature: 0.2,
    max_tokens: 4000,
  });

  const contentText = response.choices[0]?.message?.content || "Erro ao gerar termo";
  const html = `<div style="font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.8; white-space: pre-wrap;">${contentText.replace(/\n/g, "<br>")}</div>`;
  const plainText = contentText;

  const caseRef = caseData?.caseNumber ? `_${caseData.caseNumber.replace(/[^0-9]/g, "").slice(0, 10)}` : "";
  const debtorName = (recipientContact?.name || "devedor").replace(/\s+/g, "_").slice(0, 20);
  const baseFilename = `Termo_Acordo_${negotiation.id}_${debtorName}${caseRef}_${today.toISOString().slice(0, 10)}`;

  let wordBuffer: Buffer | undefined;
  try {
    const path = await import("path");
    const fs = await import("fs");
    const config = await storage.getLetterheadConfig(negotiation.tenantId);
    const templatePath = path.join(process.cwd(), "public/templates/default_letterhead.docx");
    const templateBuffer = decodeDocxTemplateFromDataUrl(config?.logoUrl) || (fs.existsSync(templatePath) ? fs.readFileSync(templatePath) : null);

    if (templateBuffer) {
      const PizZip = (await import("pizzip")).default;
      const Docxtemplater = (await import("docxtemplater")).default;
      const zip = new PizZip(templateBuffer) as any;
      
      const xmlContent = zip.file("word/document.xml")?.asText() || "";
      const hasDoubleBrace = xmlContent.includes("{{CONTEUDO}}");
      if (hasDoubleBrace) {
        const fixedXml = xmlContent.replace(/\{\{CONTEUDO\}\}/g, "{CONTEUDO}");
        zip.file("word/document.xml", fixedXml);
      }
      
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      }) as any;

      const processedContent = contentText
        .replace(/\[ADVOGADO_NOME\]/g, "Ronald Ferreira Serra")
        .replace(/\[ADVOGADO_OAB\]/g, "OAB/DF 23.947")
        .replace(/\{\{ADVOGADO_NOME\}\}/g, "Ronald Ferreira Serra")
        .replace(/\{\{ADVOGADO_OAB\}\}/g, "OAB/DF 23.947")
        .replace(/\{ADVOGADO_NOME\}/g, "Ronald Ferreira Serra")
        .replace(/\{ADVOGADO_OAB\}/g, "OAB/DF 23.947");

      doc.setData({
        CONTEUDO: processedContent,
        ADVOGADO_NOME: "Ronald Ferreira Serra",
        ADVOGADO_OAB: "OAB/DF 23.947",
        LOCAL: "Brasília",
        DATA: formattedDate,
      });
      doc.render();

      wordBuffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      console.log(`[NegotiationAI] Word document generated with letterhead: ${baseFilename}.docx`);
    } else {
      console.log("[NegotiationAI] Letterhead template not found, generating Word without template");
      const docx = await import("docx");
      const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;
      
      const paragraphs = contentText.split(/\n\n+/).filter((p: string) => p.trim());
      const docParagraphs = paragraphs.map((text: string) => {
        const isTitle = text.includes("TERMO DE COMPOSIÇÃO") || text.includes("CLÁUSULA") || text.includes("ASSINATURAS") || text.includes("TESTEMUNHAS");
        return new Paragraph({
          alignment: isTitle ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: text.trim(),
              font: "Times New Roman",
              size: 24,
              bold: isTitle,
            }),
          ],
        });
      });
      
      const wordDoc = new Document({
        sections: [{ properties: {}, children: docParagraphs }],
      });
      wordBuffer = await Packer.toBuffer(wordDoc) as unknown as Buffer;
      console.log(`[NegotiationAI] Word document generated without letterhead: ${baseFilename}.docx`);
    }
  } catch (wordErr) {
    console.error("[NegotiationAI] Error generating Word document:", wordErr);
  }

  return { html, plainText, filename: `${baseFilename}.html`, wordBuffer };
}
