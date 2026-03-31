import OpenAI from "openai";
import type { ProspectionPlan, ProspectionLead, ProspectionNetwork, ProspectionChatMessage } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function searchWeb(query: string): Promise<string> {
  const serperKey = process.env.SERPER_API_KEY;
  const serpApiKey = process.env.SERPAPI_API_KEY;

  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.organic || []).map((r: any) => `${r.title}: ${r.snippet} (${r.link})`).join("\n");
        if (results) return results;
      }
    } catch (e: any) {
      console.error("[Prospecting] Serper error:", e.message);
    }
  }

  if (serpApiKey) {
    try {
      const params = new URLSearchParams({
        api_key: serpApiKey, q: query, google_domain: "google.com.br", gl: "br", hl: "pt-br",
      });
      const res = await fetch(`https://serpapi.com/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        const organic = data.organic_results || [];
        const results = organic.map((r: any) => `${r.title}: ${r.snippet} (${r.link})`).join("\n");
        if (results) return results;
      }
    } catch (e: any) {
      console.error("[Prospecting] SerpAPI error:", e.message);
    }
  }

  return "";
}

async function multiSearch(queries: string[]): Promise<string> {
  let allResults = "";
  for (const query of queries) {
    const results = await searchWeb(query);
    if (results) allResults += `\n--- Pesquisa: "${query}" ---\n${results}\n`;
  }
  return allResults;
}

function buildConnectionPaths(companies: any[], networkContacts: ProspectionNetwork[]): any[] {
  if (!networkContacts.length) {
    return companies.map(company => {
      company.connectionPaths = [{ type: "sem_conexao", path: null, networkContactName: null, confidence: "baixa", actionPlan: "Sem contatos na rede cadastrados. Cadastre contatos na aba 'Rede de Contatos' para mapear caminhos." }];
      company.networkPath = "Sem rede de contatos cadastrada";
      return company;
    });
  }

  const contactsByCompany = new Map<string, ProspectionNetwork[]>();
  const contactsBySector = new Map<string, ProspectionNetwork[]>();
  const contactsByPosition = new Map<string, ProspectionNetwork[]>();

  for (const c of networkContacts) {
    const company = (c.company || "").toLowerCase().trim();
    const position = (c.position || "").toLowerCase().trim();
    const tags = (c.tags || "").toLowerCase();

    if (company) {
      if (!contactsByCompany.has(company)) contactsByCompany.set(company, []);
      contactsByCompany.get(company)!.push(c);
    }

    const sectorKeywords = tags.split(/[,;|]/).map(t => t.trim().toLowerCase()).filter(Boolean);
    for (const kw of sectorKeywords) {
      if (!contactsBySector.has(kw)) contactsBySector.set(kw, []);
      contactsBySector.get(kw)!.push(c);
    }

    if (position) {
      const posKey = position.includes("diretor") ? "diretor" :
        position.includes("gerente") ? "gerente" :
        position.includes("ceo") || position.includes("presidente") ? "ceo" :
        position.includes("cfo") ? "cfo" :
        position.includes("jurídico") || position.includes("legal") ? "juridico" : "";
      if (posKey) {
        if (!contactsByPosition.has(posKey)) contactsByPosition.set(posKey, []);
        contactsByPosition.get(posKey)!.push(c);
      }
    }
  }

  return companies.map(company => {
    const companyName = (company.name || company.companyName || "").toLowerCase().trim();
    const companySector = (company.sector || "").toLowerCase().trim();
    const paths: any[] = [];

    if (companyName.length < 2) {
      company.connectionPaths = [{ type: "sem_conexao", path: null, networkContactName: null, confidence: "baixa", actionPlan: "Empresa sem nome identificado." }];
      company.networkPath = "Empresa sem nome identificado";
      return company;
    }

    for (const [cCompany, contacts] of Array.from(contactsByCompany.entries())) {
      if (cCompany.length < 2) continue;
      if (companyName.includes(cCompany) || cCompany.includes(companyName)) {
        for (const c of contacts) {
          paths.push({
            type: "direto",
            path: `Marques & Serra → ${c.name} (${c.position || 'contato'} na ${c.company})`,
            networkContactName: c.name,
            confidence: "alta",
            actionPlan: `Contato direto: ${c.name} trabalha na ${c.company}. ${c.phone ? `Tel: ${c.phone}` : ''} ${c.email ? `Email: ${c.email}` : ''} ${c.linkedin ? `LinkedIn: ${c.linkedin}` : ''}`.trim()
          });
          company.networkConnectionId = c.id;
        }
      }
    }

    if (paths.length === 0 && companySector) {
      const sectorWords = companySector.split(/[\s,/]+/).filter((w: string) => w.length > 3);
      for (const word of sectorWords) {
        for (const [tag, contacts] of Array.from(contactsBySector.entries())) {
          if (tag.includes(word) || word.includes(tag)) {
            for (const c of contacts.slice(0, 2)) {
              const alreadyAdded = paths.some(p => p.networkContactName === c.name);
              if (!alreadyAdded) {
                paths.push({
                  type: "2_graus",
                  path: `Marques & Serra → ${c.name} (${c.position || 'contato'}, ${c.company || 'rede'}) → Possível indicação para ${company.name || company.companyName}`,
                  networkContactName: c.name,
                  confidence: "média",
                  actionPlan: `${c.name} atua no setor "${tag}" e pode conhecer pessoas na ${company.name || company.companyName}. Solicitar apresentação ou indicação.`
                });
              }
            }
          }
        }
      }
    }

    if (paths.length === 0) {
      const positionTypes = ["juridico", "diretor", "cfo", "ceo", "gerente"];
      for (const posType of positionTypes) {
        const contacts = contactsByPosition.get(posType);
        if (contacts && contacts.length > 0) {
          const c = contacts[0];
          paths.push({
            type: "3_graus",
            path: `Marques & Serra → ${c.name} (${c.position}, ${c.company || 'rede'}) → Rede de ${c.position} → ${company.name || company.companyName}`,
            networkContactName: c.name,
            confidence: "baixa",
            actionPlan: `${c.name} ocupa cargo similar (${c.position}) em outra empresa. Pode ter contatos no mercado que alcancem decisores da ${company.name || company.companyName}. Caminho incerto.`
          });
          break;
        }
      }
    }

    if (paths.length === 0) {
      paths.push({
        type: "sem_conexao",
        path: null,
        networkContactName: null,
        confidence: "baixa",
        actionPlan: `Nenhum caminho identificado na rede de contatos para chegar à ${company.name || company.companyName}. Sugestão: prospectar via LinkedIn, eventos do setor, ou cold outreach.`
      });
      company.networkPath = `Sem conexão identificada na rede para ${company.name || company.companyName}`;
    } else {
      const best = paths[0];
      company.networkPath = best.path;
      if (best.type === "direto") {
        company.networkConnectionId = company.networkConnectionId || null;
      }
    }

    company.connectionPaths = paths;
    return company;
  });
}

function matchNetworkToFirms(firms: any[], networkContacts: ProspectionNetwork[]): any[] {
  if (!networkContacts.length || !firms?.length) return firms || [];

  return firms.map(firm => {
    const firmName = (firm.name || "").toLowerCase();
    for (const contact of networkContacts) {
      const contactCompany = (contact.company || "").toLowerCase();
      const contactNotes = (contact.notes || "").toLowerCase();
      if (
        (contactCompany && (firmName.includes(contactCompany) || contactCompany.includes(firmName))) ||
        (contactNotes && contactNotes.includes(firmName))
      ) {
        firm.networkConnection = {
          contactId: contact.id,
          contactName: contact.name,
          position: contact.position,
          relationship: contact.relationship,
          path: `Conexão via ${contact.name} (${contact.position || 'contato'} na ${contact.company || 'rede'}) - ${contact.relationship || 'conhecido'}`
        };
        break;
      }
    }
    return firm;
  });
}

function summarizeNetwork(contacts: ProspectionNetwork[], plan: ProspectionPlan): string {
  if (!contacts.length) return "Nenhum contato na rede cadastrado ainda.";

  const MAX_CHARS = 4000;
  const sector = (plan.sector || "").toLowerCase();
  const region = (plan.region || "").toLowerCase();

  const sectorRelevant: ProspectionNetwork[] = [];
  const highValue: ProspectionNetwork[] = [];
  const withCompany: ProspectionNetwork[] = [];

  for (const c of contacts) {
    const position = (c.position || "").toLowerCase();
    const company = (c.company || "").toLowerCase();
    const tags = (c.tags || "").toLowerCase();

    const isSectorMatch = sector && (tags.includes(sector) || position.includes(sector) || company.includes(sector));
    if (isSectorMatch) {
      sectorRelevant.push(c);
      continue;
    }

    const isHighValue = position.includes("diretor") || position.includes("gerente") ||
      position.includes("presidente") || position.includes("ceo") || position.includes("cfo") ||
      position.includes("coo") || position.includes("head") || position.includes("vice") ||
      position.includes("sócio") || position.includes("partner") || position.includes("secretário") ||
      position.includes("conselheiro") || position.includes("commissioner") || position.includes("procurador");

    if (isHighValue) {
      highValue.push(c);
    } else if (company) {
      withCompany.push(c);
    }
  }

  let summary = `\nREDE DE CONTATOS DO ESCRITÓRIO (${contacts.length} contatos total):\n`;

  if (sectorRelevant.length > 0) {
    summary += `\n--- CONTATOS DO SETOR "${plan.sector}" (${sectorRelevant.length}) ---\n`;
    for (const c of sectorRelevant.slice(0, 30)) {
      summary += `- ${c.name} | ${c.company || 'N/A'} | ${c.position || 'N/A'}\n`;
      if (summary.length > MAX_CHARS * 0.4) break;
    }
  }

  summary += `\n--- DECISORES E LÍDERES (${highValue.length}) ---\n`;
  for (const c of highValue.slice(0, 50)) {
    summary += `- ${c.name} | ${c.company || 'N/A'} | ${c.position || 'N/A'}\n`;
    if (summary.length > MAX_CHARS * 0.75) break;
  }

  if (summary.length < MAX_CHARS * 0.85 && withCompany.length > 0) {
    summary += `\n--- OUTROS CONTATOS COM EMPRESA (${withCompany.length}) ---\n`;
    for (const c of withCompany.slice(0, 30)) {
      summary += `- ${c.name} | ${c.company || 'N/A'} | ${c.position || 'N/A'}\n`;
      if (summary.length > MAX_CHARS) break;
    }
  }

  if (summary.length > MAX_CHARS) {
    summary = summary.substring(0, MAX_CHARS) + `\n... (${contacts.length} contatos total na rede)`;
  }

  return summary;
}

const GENERIC_COMPANY_TOKENS = new Set([
  "brasil", "brazil", "grupo", "group", "holding", "ltda", "s/a", "sa", "eireli",
  "me", "epp", "empresa", "company", "corp", "inc", "limitada", "capital",
  "servicos", "serviços", "consultoria", "assessoria", "gestao", "gestão",
  "tecnologia", "digital", "global", "nacional", "internacional",
]);

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[.,\-\/\\()'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSignificantTokens(normalized: string): string[] {
  return normalized.split(/\s+/).filter(w => w.length > 2 && !GENERIC_COMPANY_TOKENS.has(w));
}

function companyNamesMatch(nameA: string, nameB: string): boolean {
  const normA = normalizeCompanyName(nameA);
  const normB = normalizeCompanyName(nameB);

  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const tokensA = getSignificantTokens(normA);
  const tokensB = getSignificantTokens(normB);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const matchingTokens = tokensA.filter(t => tokensB.includes(t));
  const matchRatio = matchingTokens.length / Math.min(tokensA.length, tokensB.length);
  return matchRatio >= 0.5 && matchingTokens.length >= 1;
}

function matchTargetCompaniesWithNetwork(targetCompanies: string[], networkContacts: ProspectionNetwork[]): { company: string; contact: ProspectionNetwork }[] {
  if (targetCompanies.length === 0 || networkContacts.length === 0) return [];

  const results: { company: string; contact: ProspectionNetwork }[] = [];
  const contactsWithCompany = networkContacts.filter(c => c.company && c.company.trim().length > 0);

  for (const target of targetCompanies) {
    for (const contact of contactsWithCompany) {
      if (companyNamesMatch(target, contact.company || "")) {
        const alreadyAdded = results.some(r => r.company === target && r.contact.id === contact.id);
        if (!alreadyAdded) {
          results.push({ company: target, contact });
        }
      }
    }
  }

  return results;
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\-\/\\()'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dmMatchesNetworkContact(dm: any, contact: ProspectionNetwork): boolean {
  const dmName = normalizeText(dm.name || "");
  const contactName = normalizeText(contact.name || "");
  if (dmName.length > 2 && contactName.length > 2) {
    if (dmName === contactName) return true;
    const dmTokens = dmName.split(" ").filter(t => t.length > 2);
    const cTokens = contactName.split(" ").filter(t => t.length > 2);
    if (dmTokens.length >= 2 && cTokens.length >= 2) {
      const matches = dmTokens.filter(t => cTokens.includes(t));
      if (matches.length >= 2) return true;
    }
  }

  if (dm.email && contact.email) {
    const dmEmail = dm.email.toLowerCase().trim();
    const cEmail = contact.email.toLowerCase().trim();
    if (dmEmail === cEmail && dmEmail.length > 3) return true;
  }

  if (dm.linkedin && contact.linkedin) {
    const dmLi = dm.linkedin.toLowerCase().replace(/\/$/, "").trim();
    const cLi = contact.linkedin.toLowerCase().replace(/\/$/, "").trim();
    if (dmLi === cLi && dmLi.length > 5) return true;
    const dmSlug = dmLi.split("/").pop() || "";
    const cSlug = cLi.split("/").pop() || "";
    if (dmSlug.length > 3 && dmSlug === cSlug) return true;
  }

  return false;
}

function flagDecisionMakersInNetwork(companies: any[], networkContacts: ProspectionNetwork[]): any[] {
  if (!networkContacts.length) return companies;

  let flaggedCount = 0;

  for (const company of companies) {
    const decisionMakers = company.decisionMakers;
    if (!decisionMakers || !Array.isArray(decisionMakers)) continue;

    for (const dm of decisionMakers) {
      if (!dm || typeof dm !== "object") continue;
      if (dm.confirmedContact) {
        dm.inNetworkContact = true;
        flaggedCount++;
        continue;
      }
      for (const contact of networkContacts) {
        if (dmMatchesNetworkContact(dm, contact)) {
          dm.inNetworkContact = true;
          dm.networkContactId = contact.id;
          dm.networkContactName = contact.name;
          if (!dm.phone && contact.phone) dm.phone = contact.phone;
          if (!dm.email && contact.email) dm.email = contact.email;
          if (!dm.linkedin && contact.linkedin) dm.linkedin = contact.linkedin;
          flaggedCount++;
          break;
        }
      }
    }
  }

  if (flaggedCount > 0) {
    console.log(`[Prospecting] Flagged ${flaggedCount} decision maker(s) as already in network`);
  }

  return companies;
}

function enforceConfirmedDecisionMakers(companies: any[], confirmedDMs: { company: string; contact: ProspectionNetwork }[]): any[] {
  if (confirmedDMs.length === 0) return companies;

  for (const company of companies) {
    const companyName = company.name || "";
    const matchingDMs = confirmedDMs.filter(dm => companyNamesMatch(companyName, dm.company));

    if (matchingDMs.length > 0) {
      company.decisionMakers = matchingDMs.map(dm => ({
        name: dm.contact.name,
        position: dm.contact.position || "Contato confirmado",
        background: "",
        interests: "",
        linkedin: dm.contact.linkedin || "",
        email: dm.contact.email || "",
        phone: dm.contact.phone || "",
        instagram: dm.contact.instagram || "",
        bestChannel: dm.contact.phone ? "WhatsApp" : (dm.contact.email ? "Email" : "LinkedIn"),
        communicationTone: "semiformal",
        discProfile: { primary: "D", secondary: "I", label: "Dominante", justification: "", approachTips: "" },
        confirmedContact: true,
      }));

      console.log(`[Prospecting] Enforced ${matchingDMs.length} confirmed decision maker(s) for "${company.name}" — replaced AI-generated decisors`);
    }
  }

  return companies;
}

class ProspectingService {
  async generatePlan(plan: ProspectionPlan, networkContacts: ProspectionNetwork[]): Promise<{ plan: string; companies: any[] }> {
    const thesis = plan.thesis || "";
    const sector = plan.sector || "";
    const region = plan.region || "Brasil";

    const thesisSearchQueries = [
      `"${thesis}" jurisprudência Brasil tendências recentes 2024 2025`,
      `${thesis} casos relevantes tribunais STJ STF decisões`,
      `empresas afetadas "${thesis}" Brasil processos judiciais`,
      `${thesis} ${sector} empresas expostas risco passivo`,
      `${thesis} empresas ${region} advogados especializados`,
    ];

    const targetCompanies = plan.targetCompanies ? plan.targetCompanies.split("\n").map((c: string) => c.trim()).filter((c: string) => c.length > 0) : [];

    const confirmedDecisionMakers = matchTargetCompaniesWithNetwork(targetCompanies, networkContacts);
    if (confirmedDecisionMakers.length > 0) {
      console.log(`[Prospecting] Found ${confirmedDecisionMakers.length} confirmed decision makers from network for target companies`);
    }

    const companySearchQueries = [
      `empresas ${sector} ${region} com problemas "${thesis}"`,
      `"${thesis}" empresas ${sector} ${region} demanda serviço jurídico`,
      `empresas ${sector} ${region} passivo trabalhista tributário contencioso`,
      `maiores empresas ${sector} ${region} ranking faturamento site`,
      `diretor jurídico "${sector}" ${region} LinkedIn contato`,
      `head jurídico "${sector}" ${region} decisor empresa`,
      `"${thesis}" ${sector} empresas afetadas oportunidade advocacia`,
      ...targetCompanies.slice(0, 5).map((c: string) => `"${c}" diretor jurídico CEO CFO contato site`),
    ];

    const competitorSearchQueries = [
      `escritórios advocacia "${thesis}" ${region} especialistas`,
      `advogados especialistas "${thesis}" ${sector} ${region} cases`,
      `escritórios advocacia ${sector} ${region} parceria referência`,
    ];

    console.log("[Prospecting] Starting deep research with", thesisSearchQueries.length + companySearchQueries.length + competitorSearchQueries.length, "queries");

    const [thesisContext, companyContext, competitorContext] = await Promise.all([
      multiSearch(thesisSearchQueries),
      multiSearch(companySearchQueries),
      multiSearch(competitorSearchQueries),
    ]);

    const hasNetwork = networkContacts.length > 0;

    const confirmedDMInstructions = confirmedDecisionMakers.length > 0 ? `
DECISORES CONFIRMADOS (OBRIGATÓRIO): O escritório já possui contatos REAIS na rede para as seguintes empresas-alvo. Você DEVE usar EXATAMENTE esses nomes como decisores para essas empresas. NÃO invente ou substitua por outros nomes:
${confirmedDecisionMakers.map((dm: any) => {
  return `- EMPRESA: "${dm.company}" → DECISOR: ${dm.contact.name}${dm.contact.position ? ` (${dm.contact.position})` : ''}`;
}).join('\n')}

Para essas empresas, use OBRIGATORIAMENTE o decisor confirmado acima no campo decisionMakers (o sistema preencherá os dados de contato automaticamente). Para as demais empresas, pesquise normalmente na web.
` : "";

    const networkInstructions = hasNetwork ? `
REDE DE CONTATOS: O escritório possui ${networkContacts.length} contatos na rede. O mapeamento de caminhos de conexão será feito AUTOMATICAMENTE pelo sistema após sua resposta. Foque em identificar EMPRESAS REAIS e DECISORES REAIS com base na pesquisa web.
` : "";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Você é um consultor sênior de desenvolvimento de negócios jurídicos especializado no mercado brasileiro.
Sua missão é criar planos estratégicos PROFUNDOS de prospecção para o escritório Marques & Serra Sociedade de Advogados.
${confirmedDMInstructions}${networkInstructions}
INSTRUÇÕES PARA PESQUISA PROFUNDA:

1. ANÁLISE DA TESE: Analise profundamente a tese jurídica - fundamentos legais, precedentes, tendências de decisões, potencial de mercado, riscos e oportunidades.

2. PERFIL DETALHADO DE EMPRESAS: Para CADA uma das 15 empresas-alvo:
   - Nome real da empresa (use dados da pesquisa web)
   - Setor de atuação detalhado
   - Porte e faturamento estimado
   - Localização (sede e filiais relevantes)
   - Website, telefone, email
   - Por que esta empresa precisa deste serviço jurídico (pontos de dor específicos)

3. PERFIL DOS DECISORES (PESSOAS REAIS DA PESQUISA WEB): Para cada empresa, identifique:
   - PESSOAS REAIS encontradas na pesquisa web (nome completo, cargo exato, LinkedIn URL, email se disponível)
   - NÃO invente nomes genéricos — use APENAS pessoas encontradas via pesquisa ou que sejam plausíveis com base em resultados reais
   - O decisor pode ser: Diretor Jurídico, Gerente Jurídico, CEO, CFO, Diretor Administrativo, Head Legal, etc.
   - Se o LinkedIn da pessoa for encontrado, inclua a URL completa no campo "linkedin"
   - Se email for encontrado ou puder ser inferido pelo padrão da empresa (ex: joao.silva@empresa.com.br), inclua no campo "email"
   - Inclua todos os pontos de contato possíveis (às vezes o caminho não é pelo jurídico, mas pelo financeiro, comercial, etc.)
   - PERFIL DISC: Classifique o decisor em D(Dominância)/I(Influência)/S(Estabilidade)/C(Conformidade) baseado no cargo e setor. Inclua tipo primário, secundário, e dica curta de abordagem

4. SCORE DE COMPATIBILIDADE (0-100): Avalie quanto cada empresa se beneficiaria da tese:
   - 90-100: Necessidade urgente, fit perfeito
   - 70-89: Alta compatibilidade
   - 50-69: Compatibilidade moderada
   - 0-49: Baixa compatibilidade

5. MAPEAMENTO DE ESCRITÓRIOS: Para cada empresa, identifique:
   - CONCORRENTES DIRETOS: Escritórios que já atendem esta empresa na mesma tese ou similar
   - PARCEIROS POTENCIAIS: Escritórios que atendem a empresa em áreas complementares

6. PROPOSTAS DE PARCERIA: Para escritórios parceiros, sugira proposta formal com benefícios mútuos.

QUANTIDADE OBRIGATÓRIA: Retorne EXATAMENTE 15 empresas no array "companies". NUNCA menos que 15. Se necessário, seja mais conciso nos textos para caber todas as 15. Priorize empresas REAIS encontradas na pesquisa web. É CRÍTICO que o array tenha 15 itens completos.

FORMATO DE RESPOSTA (JSON OBRIGATÓRIO):
{
  "plan": "Texto do plano estratégico completo",
  "companies": [
    {
      "name": "Nome Real da Empresa",
      "sector": "Setor detalhado",
      "size": "Porte (micro/pequena/média/grande)",
      "revenue": "Faturamento estimado",
      "location": "Cidade/Estado",
      "website": "URL real",
      "phone": "Telefone",
      "email": "Email corporativo",
      "companyProfile": "Perfil detalhado: o que a empresa faz, por que se enquadra na tese",
      "compatibilityScore": 85,
      "painPoints": ["Ponto de dor 1", "Ponto de dor 2", "Ponto de dor 3"],
      "decisionMakers": [
        {
          "name": "Nome Completo do Decisor",
          "position": "Cargo exato",
          "background": "Histórico profissional",
          "interests": "Interesses e motivações",
          "linkedin": "URL LinkedIn se encontrado",
          "email": "Email se encontrado",
          "bestChannel": "WhatsApp/Email/LinkedIn",
          "communicationTone": "formal/semiformal/direto",
          "discProfile": {"primary":"D","secondary":"C","label":"Dominante-Analítico","justification":"CEO focado em resultados","approachTips":"Seja direto, foque em ROI"}
        }
      ],
      "competitors": [
        {
          "name": "Nome do Escritório Concorrente",
          "area": "Área de atuação",
          "type": "concorrente_direto",
          "strategy": "Como atuam"
        }
      ],
      "partnerFirms": [
        {
          "name": "Nome do Escritório Parceiro",
          "area": "Área complementar",
          "type": "parceiro_potencial",
          "synergy": "Sinergia identificada",
          "partnerProposal": "Proposta de parceria"
        }
      ],
      "competitorStrategy": "Estratégia para se diferenciar da concorrência",
      "priority": 5,
      "strategy": "Estratégia completa de abordagem",
      "messages": {
        "whatsapp": "Mensagem para WhatsApp",
        "email": { "subject": "Assunto", "body": "Corpo do email" },
        "linkedin": "Mensagem para LinkedIn"
      }
    }
  ]
}`
        },
        {
          role: "user",
          content: `PLANO DE PROSPECÇÃO:
Título: ${plan.title}
Tese/Serviço: ${plan.thesis}
Setor: ${plan.sector || 'Não especificado'}
Região: ${plan.region || 'Brasília/DF'}
Tipo de Serviço: ${plan.serviceType || 'Consultivo e Contencioso'}

PESQUISA PROFUNDA DA TESE JURÍDICA:
${thesisContext || 'Sem resultados de pesquisa sobre a tese'}

PESQUISA DE EMPRESAS DO SETOR:
${companyContext || 'Sem resultados de pesquisa sobre empresas'}

PESQUISA DE ESCRITÓRIOS E CONCORRÊNCIA:
${competitorContext || 'Sem resultados de pesquisa sobre escritórios'}
${hasNetwork ? `\nREDE DE CONTATOS: O escritório possui ${networkContacts.length} contatos. As conexões com as empresas serão mapeadas automaticamente pelo sistema.` : ''}

MISSÃO: Gere um plano estratégico PROFUNDO com EXATAMENTE 15 empresas-alvo REAIS e COMPLETAS baseadas na pesquisa web.${hasNetwork ? ' O sistema mapeará automaticamente os caminhos de conexão pela rede de contatos após sua resposta.' : ''}${targetCompanies.length > 0 ? `\n\nEMPRESAS PRIORITÁRIAS: O usuário já mapeou as seguintes empresas e elas DEVEM ser incluídas OBRIGATORIAMENTE entre as 15 empresas do plano:\n${targetCompanies.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\nPesquise informações detalhadas sobre cada uma dessas empresas e complete os dados (contatos, decisores, site, telefone, etc). As demais vagas até completar 15 devem ser preenchidas com empresas adicionais encontradas na pesquisa.` : ''}

REGRAS CRÍTICAS:
1. Responda APENAS com JSON válido, sem markdown, sem comentários
2. EXATAMENTE 15 empresas COMPLETAS no array "companies" - NUNCA menos que 15
3. NÃO use comentários JavaScript (// ...) dentro do JSON
4. Cada empresa deve ter TODOS os campos preenchidos incluindo discProfile
5. O JSON deve ser parseable diretamente por JSON.parse()
6. Se o texto ficar longo, seja conciso nos campos de texto (companyProfile, background, strategy) para garantir 15 empresas completas
7. Priorize QUANTIDADE (15) sobre verbosidade
8. Priorize empresas REAIS que apareceram na pesquisa web`
        }
      ],
      temperature: 0.7,
      max_tokens: 16384,
    });

    const raw = response.choices[0]?.message?.content || "";
    let parsed: any;

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let jsonStr = jsonMatch?.[0] || raw;
      jsonStr = jsonStr.replace(/^\s*\/\/[^\n]*/gm, "");
      jsonStr = jsonStr.replace(/,\s*\/\/[^\n]*/g, "");
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
      parsed = JSON.parse(jsonStr);
      console.log(`[Prospecting] Parsed ${parsed.companies?.length || 0} companies from AI response`);
    } catch (parseErr: any) {
      console.error("[Prospecting] JSON parse error:", parseErr.message);
      console.error("[Prospecting] Raw response preview:", raw.substring(0, 500));
      parsed = { plan: raw, companies: [] };
    }

    if (parsed.companies) {
      console.log(`[Prospecting] Building connection paths for ${parsed.companies.length} companies against ${networkContacts.length} network contacts`);
      parsed.companies = buildConnectionPaths(parsed.companies, networkContacts);
      parsed.companies = enforceConfirmedDecisionMakers(parsed.companies, confirmedDecisionMakers);
      parsed.companies = flagDecisionMakersInNetwork(parsed.companies, networkContacts);
      for (const company of parsed.companies) {
        if (company.partnerFirms) {
          company.partnerFirms = matchNetworkToFirms(company.partnerFirms, networkContacts);
        }
        if (company.competitors) {
          company.competitors = matchNetworkToFirms(company.competitors, networkContacts);
        }
      }
    }

    return {
      plan: parsed.plan || raw,
      companies: parsed.companies || [],
    };
  }

  async generateOutreachMessages(lead: ProspectionLead, plan: ProspectionPlan, networkContacts?: ProspectionNetwork[]): Promise<any> {
    const dm = lead.decisionMakers as any;
    const connectionPaths = dm?.connectionPaths || [];
    const bestPath = connectionPaths[0];
    const chainType = bestPath?.type || "sem_conexao";
    const chainContactName = bestPath?.networkContactName || null;
    const decisionMakerName = dm?.contacts?.[0]?.name || "o decisor";

    let chainContact: ProspectionNetwork | null = null;
    if (chainContactName && networkContacts && (chainType === "2_graus" || chainType === "3_graus" || chainType === "direto")) {
      chainContact = networkContacts.find(c => c.name.toLowerCase() === chainContactName.toLowerCase()) || null;
    }

    const isIntroductionNeeded = (chainType === "2_graus" || chainType === "3_graus") && chainContactName;
    const isDirectContact = chainType === "direto" && chainContactName;
    const targetName = isIntroductionNeeded ? chainContactName : isDirectContact ? chainContactName : decisionMakerName;
    const targetRole = isIntroductionNeeded ? "intermediário" : isDirectContact ? "contato_direto" : "decisor";
    const targetContext = isIntroductionNeeded
      ? `IMPORTANTE: As mensagens devem ser direcionadas a ${chainContactName} (contato da rede do escritório), PEDINDO UMA INTRODUÇÃO/APRESENTAÇÃO ao decisor ${decisionMakerName} da ${lead.companyName}. NÃO é uma mensagem direta ao decisor. É um pedido de favor ao contato intermediário.`
      : isDirectContact
        ? `As mensagens devem ser direcionadas a ${chainContactName}, que é um contato direto do escritório e trabalha na ${lead.companyName}. Aborde diretamente o assunto de negócios com ${chainContactName}.`
        : `As mensagens devem ser direcionadas ao decisor ${decisionMakerName} da ${lead.companyName}. Não há conexão prévia na rede - é um cold outreach.`;

    const dmContacts = Array.isArray(dm) ? dm : (dm?.contacts || []);
    const decisionMaker = dmContacts[0];
    const discProfile = decisionMaker?.discProfile;
    const discContext = discProfile ? `
PERFIL COMPORTAMENTAL DISC DO ALVO:
- Perfil: ${discProfile.label || discProfile.primary} ${discProfile.secondary ? `(secundário: ${discProfile.secondary})` : ''}
- Justificativa: ${discProfile.justification || 'N/A'}
- Dicas de abordagem: ${discProfile.approachTips || 'N/A'}

ADAPTE O TOM DAS MENSAGENS AO PERFIL DISC:
${discProfile.primary === 'D' ? '- DOMINÂNCIA: Seja direto, vá ao ponto, foque em resultados e ROI. Evite rodeios. Use linguagem assertiva.' : ''}
${discProfile.primary === 'I' ? '- INFLUÊNCIA: Seja caloroso, mencione conexões e networking. Use cases de sucesso e linguagem entusiasmada. Crie rapport.' : ''}
${discProfile.primary === 'S' ? '- ESTABILIDADE: Abordagem gradual, ofereça segurança e confiança. Enfatize parceria de longo prazo e estabilidade. Não pressione.' : ''}
${discProfile.primary === 'C' ? '- CONFORMIDADE: Apresente dados concretos, metodologia e referências. Seja preciso e detalhado. Use evidências e números.' : ''}
` : '';

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em comunicação jurídica B2B. Gere mensagens de prospecção profissionais e personalizadas para o escritório Marques & Serra Sociedade de Advogados.

${targetContext}
${discContext}
As mensagens devem ser:
- Profissionais mas acessíveis
- Focadas no valor que o escritório pode agregar
- Personalizadas com base no perfil da empresa e pontos de dor
- Em português brasileiro formal
- ADAPTADAS AO PERFIL COMPORTAMENTAL DO DESTINATÁRIO (se disponível)
- ${isIntroductionNeeded ? `Direcionadas a ${chainContactName}, pedindo que apresente o escritório ao decisor ${decisionMakerName}. Tom pessoal e de relação de confiança.` : `Direcionadas a ${targetName}`}

Responda em JSON:
{
  "targetName": "${targetName}",
  "targetRole": "${targetRole}",
  "whatsapp": "Mensagem curta e direta para WhatsApp (max 500 chars)",
  "email": { "subject": "Assunto do email", "body": "Corpo completo do email em HTML" },
  "linkedin": "Mensagem para conexão no LinkedIn (max 300 chars)",
  "instagram": "Texto para DM no Instagram (max 250 chars)"
}`
        },
        {
          role: "user",
          content: `Empresa-alvo: ${lead.companyName}
Perfil: ${lead.companyProfile || 'N/A'}
Setor: ${lead.companySector || 'N/A'}
Porte: ${lead.companySize || 'N/A'}
Localização: ${lead.companyLocation || 'N/A'}
Score de Compatibilidade: ${lead.compatibilityScore || 'N/A'}/100
Pontos de Dor: ${JSON.stringify(lead.painPoints || [])}
Decisor Final: ${decisionMakerName} (${dm?.contacts?.[0]?.position || 'N/A'})
Perfil DISC do Decisor: ${discProfile ? `${discProfile.label || discProfile.primary} - ${discProfile.approachTips || ''}` : 'Não disponível'}
Concorrentes: ${JSON.stringify(lead.competitors || [])}
Tese do Plano: ${plan.thesis}
Tipo de Serviço: ${plan.serviceType || 'Consultivo'}
Estratégia: ${lead.aiStrategy || 'Abordagem geral'}
Tipo de Conexão: ${chainType}
Caminho de rede: ${lead.networkPath || 'Sem conexão na rede'}
${isIntroductionNeeded ? `Contato intermediário: ${chainContactName} (pedir introdução ao decisor ${decisionMakerName})` : ''}
Estratégia vs Concorrência: ${lead.competitorStrategy || 'N/A'}

${isIntroductionNeeded
  ? `Gere mensagens para ${chainContactName} PEDINDO INTRODUÇÃO/APRESENTAÇÃO ao decisor ${decisionMakerName} na ${lead.companyName}. O tom deve ser de quem conhece ${chainContactName} e quer uma ponte. Mencione brevemente o valor do serviço para a empresa-alvo.`
  : `Gere mensagens ULTRA personalizadas com base em todos os dados. Se houver pontos de dor, use-os para criar urgência.`}
Responda APENAS com JSON válido.`
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content || "";
    let result: any;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch?.[0] || raw);
    } catch {
      result = {
        whatsapp: raw.substring(0, 500),
        email: { subject: "Proposta de serviços jurídicos", body: raw },
        linkedin: raw.substring(0, 300),
        instagram: raw.substring(0, 250),
      };
    }

    result.chainInfo = {
      type: chainType,
      targetName,
      targetRole,
      chainContactName,
      chainContactPhone: chainContact?.phone || null,
      chainContactEmail: chainContact?.email || null,
      chainContactLinkedin: chainContact?.linkedin || null,
      decisionMakerName,
      networkPath: lead.networkPath || null,
    };

    return result;
  }

  async chat(
    message: string,
    plan: ProspectionPlan | null,
    leads: ProspectionLead[],
    networkContacts: ProspectionNetwork[],
    chatHistory: ProspectionChatMessage[]
  ): Promise<{ response: string; action?: { type: string; data?: any } }> {
    const planContext = plan ? `
PLANO ATUAL: "${plan.title}"
- Tese: ${plan.thesis}
- Setor: ${plan.sector || 'N/A'}
- Região: ${plan.region || 'N/A'}
- Status: ${plan.status}
- Total de Leads: ${plan.totalLeads}
- Plano Estratégico: ${(plan.aiPlan || '').substring(0, 2000)}` : "Nenhum plano selecionado.";

    const leadsContext = leads.length > 0 ? `
LEADS DO PLANO (${leads.length} leads):
${leads.slice(0, 15).map(l => `- ${l.companyName} | Score: ${l.compatibilityScore || 'N/A'}/100 | Status: ${l.pipelineStatus} | Setor: ${l.companySector || 'N/A'}
  Perfil: ${(l.companyProfile || '').substring(0, 200)}
  Pontos de dor: ${JSON.stringify(l.painPoints || [])}
  Concorrentes: ${JSON.stringify((Array.isArray(l.competitors) ? l.competitors : []).map((c: any) => c.name))}
  Parceiros: ${JSON.stringify((Array.isArray(l.partnerFirms) ? l.partnerFirms : []).map((p: any) => p.name))}
  Estratégia: ${(l.aiStrategy || '').substring(0, 200)}`).join('\n')}` : "Nenhum lead gerado ainda.";

    const networkSummary = networkContacts.length > 0 ? `
REDE DE CONTATOS (${networkContacts.length}):
${networkContacts.slice(0, 20).map(c => `- ${c.name} | ${c.company || 'N/A'} | ${c.position || 'N/A'} | ${c.relationship || 'N/A'}`).join('\n')}` : "Nenhum contato na rede.";

    const historyMessages = chatHistory.slice(-20).map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Você é o Consultor de Prospecção IA do escritório Marques & Serra Sociedade de Advogados. Você é um especialista em desenvolvimento de negócios jurídicos no Brasil.

SUAS CAPACIDADES:
1. Analisar profundamente teses jurídicas e identificar oportunidades
2. Sugerir empresas-alvo com perfis detalhados
3. Mapear escritórios concorrentes e parceiros potenciais
4. Gerar estratégias personalizadas de abordagem
5. Cruzar rede de contatos com leads e parceiros
6. Responder perguntas sobre mercado jurídico
7. Gerar propostas de parceria entre escritórios
8. Analisar pontos de dor de empresas específicas

CONTEXTO DO ESCRITÓRIO:
${planContext}

${leadsContext}

${networkSummary}

REGRAS:
- Responda sempre em português brasileiro
- Seja estratégico, analítico e objetivo
- Use dados concretos quando disponíveis
- Se o usuário pedir para pesquisar algo específico, analise com base nos dados disponíveis
- Se o usuário pedir para gerar abordagem para um lead, crie mensagens personalizadas
- Se o usuário pedir análise de concorrência ou parceria, forneça insights detalhados
- Se o usuário pedir para explorar uma empresa específica, aprofunde a análise
- Formate suas respostas com markdown para boa legibilidade`
        },
        ...historyMessages,
        {
          role: "user",
          content: message,
        }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const responseText = response.choices[0]?.message?.content || "Desculpe, não consegui processar sua solicitação.";

    return { response: responseText };
  }
}

export const prospectingService = new ProspectingService();
