import { storage } from "../storage";
import { aiService } from "./ai";

function isJuizadoEspecial(params: { classeNome?: string | null; vara?: string | null; caseNumber?: string | null; court?: string | null }): boolean {
  const { classeNome, vara, court } = params;
  const classeNomeUpper = (classeNome || "").toUpperCase();
  if (classeNomeUpper.includes("JUIZADO ESPECIAL")) return true;
  if (classeNomeUpper.includes("PROCEDIMENTO DO JUIZADO")) return true;
  if (classeNomeUpper.includes("TURMA RECURSAL")) return true;

  const varaUpper = (vara || "").toUpperCase();
  if (varaUpper.includes("JUIZADO ESPECIAL")) return true;
  if (varaUpper.includes("TURMA RECURSAL")) return true;
  if (/\bJE[CF]?\b/.test(varaUpper)) return true;
  if (/\bJUIZADO\b/.test(varaUpper)) return true;

  const courtUpper = (court || "").toUpperCase();
  if (courtUpper.includes("JUIZADO ESPECIAL")) return true;
  if (courtUpper.includes("TURMA RECURSAL")) return true;

  return false;
}

function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return result;
}

function addCalendarDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  result.setDate(result.getDate() + days);
  return result;
}

function countDaysRemaining(deadlineDate: Date, type: "uteis" | "corridos" = "uteis"): number {
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadlineDate);
  target.setHours(0, 0, 0, 0);
  if (target <= today) return 0;

  if (type === "corridos") {
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  let count = 0;
  const current = new Date(today);
  while (current < target) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      count++;
    }
  }
  return count;
}

function calculateDeadlineDate(startDate: Date, days: number, type: "uteis" | "corridos"): Date {
  let deadlineDate: Date;
  if (type === "corridos") {
    deadlineDate = addCalendarDays(startDate, days);
    const dow = deadlineDate.getDay();
    if (dow === 0) deadlineDate.setDate(deadlineDate.getDate() + 1);
    else if (dow === 6) deadlineDate.setDate(deadlineDate.getDate() + 2);
  } else {
    deadlineDate = addBusinessDays(startDate, days);
  }
  return deadlineDate;
}

function isBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6;
}

function nextBusinessDay(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function ensureBusinessDay(date: Date): Date {
  const result = new Date(date);
  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function calculateCPCDeadline(disponibilizacaoDate: Date, days: number, type: "uteis" | "corridos"): { publicacao: Date; inicioPrazo: Date; vencimento: Date } {
  const publicacao = nextBusinessDay(disponibilizacaoDate);

  let vencimento: Date;
  let inicioPrazo: Date;
  if (type === "uteis") {
    vencimento = addBusinessDays(publicacao, days);
    inicioPrazo = nextBusinessDay(publicacao);
  } else {
    vencimento = addCalendarDays(publicacao, days);
    vencimento = ensureBusinessDay(vencimento);
    const tempInicio = new Date(publicacao);
    tempInicio.setDate(tempInicio.getDate() + 1);
    inicioPrazo = tempInicio;
  }

  return { publicacao, inicioPrazo, vencimento };
}

export async function batchAnalyzeIntimacoes(tenantId: number, maxItems: number = 10): Promise<{ analyzed: number; total: number }> {
  const unanalyzed = await storage.getUnanalyzedIntimacoes(tenantId);
  const total = unanalyzed.length;
  if (total === 0) return { analyzed: 0, total: 0 };

  const toAnalyze = unanalyzed.slice(0, maxItems);

  const pLimit = (await import("p-limit")).default;
  const limit = pLimit(2);

  let analyzed = 0;

  const tasks = toAnalyze.map(item => limit(async () => {
    try {
      const isJuizado = isJuizadoEspecial({ classeNome: (item as any).classeNome, vara: (item as any).vara, court: item.court });
      const deadlineCountingRule = isJuizado
        ? `ATENÇÃO: Este processo tramita em JUIZADO ESPECIAL. Os prazos devem ser contados em DIAS CORRIDOS (Art. 12-A da Lei 9.099/95, incluído pela Lei 13.728/2018). Somente se excluem da contagem os dias em que não houver expediente forense. O campo deadlineType DEVE ser "corridos".`
        : `Este processo tramita na JUSTIÇA COMUM. Os prazos devem ser contados em DIAS ÚTEIS conforme Art. 219 do CPC/2015. Excluem-se sábados, domingos e feriados. O campo deadlineType DEVE ser "uteis".`;

      const prompt = `Você é um advogado brasileiro sênior, especialista em processo civil, trabalhista e penal. Analise a seguinte movimentação processual/intimação e determine:

1. A CLASSIFICAÇÃO REAL do ato judicial com base no CONTEÚDO (não apenas no título)
2. Se requer ação do advogado (sim/não)
3. O tipo de peça processual mais adequado para responder (se aplicável)
4. O prazo processual aplicável com base na legislação brasileira vigente (CPC, CLT, CPP, leis especiais). Informe o número exato de dias do prazo.
5. O fundamento legal do prazo (artigo, parágrafo, lei)
6. Uma breve justificativa da sugestão
7. Se o prazo é em dias úteis ou corridos

REGRA FUNDAMENTAL DE CONTAGEM DE PRAZOS:
${deadlineCountingRule}

CLASSIFICAÇÃO DO ATO JUDICIAL - REGRAS OBRIGATÓRIAS:
Analise o TEOR/CONTEÚDO COMPLETO para determinar a natureza real do ato. O campo "classification" deve refletir o que o ato REALMENTE É:

- "Sentença": SOMENTE se o teor contém dispositivo que RESOLVE O MÉRITO (julga procedente/improcedente, extingue o processo com/sem resolução de mérito, homologa acordo). Deve conter palavras como "julgo procedente", "julgo improcedente", "extingo o processo", "homologo", "condeno", "absolvo".
- "Decisão Interlocutória": Decisão que resolve questão incidental SEM encerrar o processo. Ex: tutela antecipada, exceção de incompetência, impugnação ao valor, pedido de assistência, inclusão/exclusão de partes, determinação de prova pericial, indeferimento de prova.
- "Despacho": Ato sem conteúdo decisório, apenas impulsiona o processo. Ex: "cite-se", "intime-se", "dê-se vista", "aguarde-se", "junte-se", "cumpra-se", "venham conclusos", "abra vista ao MP".
- "Intimação": Comunicação processual notificando as partes de ato ou prazo.
- "Citação": Chamamento do réu para integrar a relação processual.
- "Juntada de Petição": Juntada de documento ou petição nos autos.
- "Certidão": Certidão de ato processual (publicação, trânsito em julgado, decurso de prazo).
- "Audiência": Designação ou realização de audiência.
- "Ato Ordinatório": Ato de mero expediente praticado por servidor.
- "Movimentação": Quando não se enquadra em nenhuma das categorias acima.

ATENÇÃO ESPECIAL:
- "Certidão de disponibilização/publicação no DJe" NÃO É sentença. É certidão. Analise O QUE foi publicado.
- Decisões que deferem/indeferem pedidos incidentais são "Decisão Interlocutória", NÃO sentença.
- Se o texto menciona "sentença" mas está apenas certificando sua publicação, classifique como "Certidão" e mencione no summary que se refere à publicação de uma sentença.

REGRAS CRÍTICAS ADICIONAIS:
1. NÃO INVENTE informações que não estejam no texto.
2. O campo "Tipo" abaixo é o tipo registrado pelo tribunal. Use-o como referência, mas o TEOR tem prioridade para classificação.
3. Para determinar se há prazo, baseie-se EXCLUSIVAMENTE no conteúdo da descrição e teor.
4. O campo "summary" deve descrever FIELMENTE o que o texto diz.

REGRAS DE PRAZOS DO CPC (referência - Justiça Comum em dias ÚTEIS):
- Contestação: 15 dias (art. 335)
- Réplica/Impugnação à contestação: 15 dias (art. 351)
- Recurso de Apelação: 15 dias (art. 1.003, §5º)
- Agravo de Instrumento: 15 dias (art. 1.003, §5º)
- Embargos de Declaração: 5 dias (art. 1.023)
- Embargos à Execução: 15 dias (art. 915)
- Impugnação ao Cumprimento de Sentença: 15 dias (art. 525)
- Manifestação genérica: 5 dias (art. 218, §3º)
- Recurso Especial/Extraordinário: 15 dias (art. 1.003, §5º)
- Contrarrazões: mesmo prazo do recurso
- Cumprimento voluntário de sentença: 15 dias (art. 523)
- Reconvenção: 15 dias (art. 343)

PRAZOS DOS JUIZADOS ESPECIAIS (Lei 9.099/95 - dias CORRIDOS):
- Recurso Inominado: 10 dias corridos (art. 42)
- Embargos de Declaração: 5 dias corridos (art. 49)
- Contrarrazões ao Recurso Inominado: 10 dias corridos (art. 42, §2º)
- Contestação: audiência de conciliação (art. 30)
- Execução de sentença: 15 dias corridos

REGRAS DE CONTAGEM:
- Exclui o dia do início (dia da intimação)
- Inclui o dia do vencimento
${isJuizado ? '- Conta dias CORRIDOS (Art. 12-A, Lei 9.099/95) - somente se excluem dias sem expediente forense' : '- Só conta dias ÚTEIS (Art. 219, CPC) - exclui sábados, domingos e feriados'}
- Se o vencimento cair em dia não útil, prorroga para o próximo dia útil

MOVIMENTAÇÃO/INTIMAÇÃO:
Tipo registrado pelo tribunal: ${item.type || "Não especificado"}
Processo: ${item.caseNumber || "Não informado"}
Vara/Tribunal: ${(item as any).vara || item.court || "Não informado"}
Classe Processual: ${(item as any).classeNome || "Não informada"}
${isJuizado ? '⚠️ PROCESSO DE JUIZADO ESPECIAL - PRAZOS EM DIAS CORRIDOS' : ''}
Data da Intimação: ${item.date ? new Date(item.date).toISOString().split('T')[0] : "Não informada"}
Descrição: ${item.description}
${item.teor ? `Teor completo: ${item.teor}` : ""}

Responda APENAS em JSON válido neste formato exato:
{
  "classification": "Sentença" ou "Decisão Interlocutória" ou "Despacho" ou "Intimação" ou "Citação" ou "Juntada de Petição" ou "Certidão" ou "Audiência" ou "Ato Ordinatório" ou "Movimentação",
  "requiresAction": true ou false,
  "suggestedPieceType": "nome da peça (ex: Contestação, Apelação, Embargos de Declaração, Manifestação, etc.) ou null se não requer ação",
  "deadlineDays": número inteiro de dias úteis do prazo ou null se não requer ação,
  "deadlineType": "uteis" ou "corridos",
  "legalBasis": "fundamento legal (ex: Art. 335, CPC) ou null",
  "justification": "breve explicação do prazo e da peça sugerida",
  "urgency": "alta", "media" ou "baixa",
  "summary": "resumo FIEL em 1 frase do que a intimação/movimentação realmente diz (não invente)"
}`;

      const response = await aiService.chat([
        { role: "user", content: prompt }
      ]);

      let analysis: any;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        analysis = null;
      }

      let aiDeadlineDate: string | null = null;
      let aiPublicacaoDate: string | null = null;
      let aiInicioPrazoDate: string | null = null;
      let aiDeadlineStatus: string | null = null;

      if (analysis) {
        const enforcedType = isJuizado ? "corridos" : "uteis";
        analysis.deadlineType = enforcedType;
      }

      if (analysis?.deadlineDays && item.date) {
        try {
          const disponibilizacao = new Date(item.date);
          if (!isNaN(disponibilizacao.getTime())) {
            const deadlineType: "uteis" | "corridos" = analysis.deadlineType || "uteis";
            const { publicacao, inicioPrazo, vencimento } = calculateCPCDeadline(disponibilizacao, analysis.deadlineDays, deadlineType);
            aiDeadlineDate = vencimento.toISOString().split('T')[0];
            aiPublicacaoDate = publicacao.toISOString().split('T')[0];
            aiInicioPrazoDate = inicioPrazo.toISOString().split('T')[0];
            const remaining = countDaysRemaining(vencimento, deadlineType);
            if (remaining <= 0) aiDeadlineStatus = "vencido";
            else if (remaining <= 2) aiDeadlineStatus = "critico";
            else if (remaining <= 5) aiDeadlineStatus = "urgente";
            else aiDeadlineStatus = "normal";
          }
        } catch (e) {
          console.error("Error calculating deadline date:", e);
        }
      }

      await storage.updateMovementDeadlineAnalysis(item.id, {
        aiDeadlineDays: analysis?.deadlineDays || null,
        aiDeadlineType: analysis?.deadlineType || null,
        aiDeadlineDate,
        aiPublicacaoDate,
        aiInicioPrazoDate,
        aiDeadlineStatus,
        aiLegalBasis: analysis?.legalBasis || null,
        aiSuggestedPiece: analysis?.suggestedPieceType || null,
        aiDeadlineSummary: analysis?.summary || null,
        aiClassification: analysis?.classification || null,
        aiAnalyzedAt: new Date(),
      });

      analyzed++;
    } catch (err) {
      console.error(`Error analyzing intimação ${item.id}:`, err);
      await storage.updateMovementDeadlineAnalysis(item.id, {
        aiDeadlineDays: null,
        aiDeadlineType: null,
        aiDeadlineDate: null,
        aiPublicacaoDate: null,
        aiInicioPrazoDate: null,
        aiDeadlineStatus: null,
        aiLegalBasis: null,
        aiSuggestedPiece: null,
        aiDeadlineSummary: null,
        aiClassification: null,
        aiAnalyzedAt: new Date(),
      });
    }
  }));

  await Promise.all(tasks);

  return { analyzed, total };
}

export async function recalculateCPCDates(tenantId: number): Promise<{ recalculated: number }> {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const { db } = await import("../db");
  const { caseMovements, cases } = await import("@shared/schema");
  const { eq, and, isNotNull, gte, inArray } = await import("drizzle-orm");

  const movements = await db.select()
    .from(caseMovements)
    .where(and(
      inArray(caseMovements.caseId, db.select({ id: cases.id }).from(cases).where(eq(cases.tenantId, tenantId))),
      gte(caseMovements.date, sixtyDaysAgo),
      isNotNull(caseMovements.aiDeadlineDays),
      isNotNull(caseMovements.aiAnalyzedAt)
    ));

  let recalculated = 0;
  for (const item of movements) {
    if (!item.aiDeadlineDays || !item.date) continue;
    try {
      const disponibilizacao = new Date(item.date);
      if (isNaN(disponibilizacao.getTime())) continue;
      const deadlineType: "uteis" | "corridos" = (item.aiDeadlineType as "uteis" | "corridos") || "uteis";
      const { publicacao, inicioPrazo, vencimento } = calculateCPCDeadline(disponibilizacao, item.aiDeadlineDays, deadlineType);
      const aiDeadlineDate = vencimento.toISOString().split('T')[0];
      const aiPublicacaoDate = publicacao.toISOString().split('T')[0];
      const aiInicioPrazoDate = inicioPrazo.toISOString().split('T')[0];
      const remaining = countDaysRemaining(vencimento, deadlineType);
      let aiDeadlineStatus: string;
      if (remaining <= 0) aiDeadlineStatus = "vencido";
      else if (remaining <= 2) aiDeadlineStatus = "critico";
      else if (remaining <= 5) aiDeadlineStatus = "urgente";
      else aiDeadlineStatus = "normal";

      await db.update(caseMovements)
        .set({ aiDeadlineDate, aiPublicacaoDate, aiInicioPrazoDate, aiDeadlineStatus })
        .where(eq(caseMovements.id, item.id));
      recalculated++;
    } catch (e) {
      console.error(`Error recalculating CPC dates for movement ${item.id}:`, e);
    }
  }

  return { recalculated };
}

export async function autoAnalyzeAfterSync(tenantId: number): Promise<void> {
  try {
    const unanalyzed = await storage.getUnanalyzedIntimacoes(tenantId);
    if (unanalyzed.length === 0) {
      console.log("[AutoAnalysis] No unanalyzed movements found after sync");
      return;
    }

    console.log(`[AutoAnalysis] Found ${unanalyzed.length} unanalyzed movements, starting batch analysis...`);

    let totalAnalyzed = 0;
    let remaining = unanalyzed.length;

    while (remaining > 0) {
      const result = await batchAnalyzeIntimacoes(tenantId, 10);
      totalAnalyzed += result.analyzed;
      remaining = result.total - result.analyzed;
      if (result.analyzed === 0) break;
      console.log(`[AutoAnalysis] Batch complete: ${result.analyzed} analyzed, ${remaining} remaining`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[AutoAnalysis] Complete: ${totalAnalyzed} movements analyzed`);
  } catch (error) {
    console.error("[AutoAnalysis] Error during auto-analysis:", error);
  }
}
