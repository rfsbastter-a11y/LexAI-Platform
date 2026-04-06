import assert from "node:assert/strict";

import { getSecretaryPolicyDecision, buildSecretaryAuditPayload, requiresSecretaryHumanApproval } from "../server/services/secretaryApprovalPolicy";
import { canActorExecuteSecretaryAction, deriveSecretaryActorContext, isGreetingOnlyMessage, formatDeterministicSocioReply, buildPendingActionResumeMessage, isExplicitResumeRequest } from "../server/services/secretaryPolicy";
import { deriveSecretaryOperationalState } from "../server/services/secretaryOperationalState";
import { createSecretaryActionTool, createSecretarySystemQueryTool, createSecretaryWebSearchTool } from "../server/services/secretaryToolRegistry";
import { runSecretaryJob } from "../server/services/secretaryJobRunner";
import { processLegacySecretaryActions } from "../server/services/secretaryLegacyActionHandlers";
import { archiveSignedAgreementIfMatched } from "../server/services/secretaryMediaTasks";
import { getOrCreateConversationContext, appendMessageToConversationContext } from "../server/services/secretaryConversationState";
import { buildFallbackSecretaryInternalRouting, parseSecretaryInternalRoutingResult } from "../server/services/secretaryInternalPrompts";
import { buildFallbackSecretaryPlan, applySecretaryPlanOverrides } from "../server/services/secretaryPlanning";
import { verifySecretaryActionResult } from "../server/services/secretaryVerifier";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      throw error;
    });
}

async function main() {
  await test("actor context detects socio and known client", () => {
    const actor = deriveSecretaryActorContext({
      senderUser: { name: "Ronald Serra", email: "ronald@marquesserra.com", role: "socio" },
      client: { id: 42, name: "Carlos Henrique" },
    });

    assert.equal(actor.isSocio, true);
    assert.equal(actor.socioName, "Ronald Serra");
    assert.equal(actor.clientId, 42);
    assert.equal(actor.clientName, "Carlos Henrique");
    assert.equal(actor.isKnownClient, true);
  });

  await test("permission gate blocks client from socio-only action", () => {
    assert.equal(canActorExecuteSecretaryAction("gerar_peca_estudio", false), false);
    assert.equal(canActorExecuteSecretaryAction("gerar_relatorio_cliente", false), true);
  });

  await test("greeting detection and deterministic office intro work", () => {
    assert.equal(isGreetingOnlyMessage("Boa noite"), true);
    const reply = formatDeterministicSocioReply(
      "Segue o relatório executivo.",
      "gerar_relatorio_executivo",
      true,
      "Boa noite",
      "Ronald Serra",
    );
    assert.match(reply, /Marques & Serra Sociedade de Advogados/);
    assert.match(reply, /Dr\. Ronald/);
  });

  await test("pending-action greeting strips duplicated professional title", () => {
    const reply = buildPendingActionResumeMessage({
      socioName: "Dr. Ronald Serra",
      label: "uma peça jurídica",
    });

    assert.match(reply, /Olá, Dr\. Ronald!/);
    assert.doesNotMatch(reply, /Dr\. Dr\./);
  });

  await test("explicit resume request is distinct from plain greeting", () => {
    assert.equal(isExplicitResumeRequest("retome a peça"), true);
    assert.equal(isExplicitResumeRequest("oi"), false);
  });

  await test("internal routing fallback ignores history for greeting and detects legal piece", () => {
    const greeting = buildFallbackSecretaryInternalRouting({ message: "Oi", isSocio: true });
    assert.equal(greeting.intent, "greeting");
    assert.equal(greeting.shouldIgnoreHistory, true);

    const piece = buildFallbackSecretaryInternalRouting({ message: "Faca uma apelacao com base nos documentos enviados", isSocio: true });
    assert.equal(piece.intent, "legal_piece");
    assert.equal(piece.recommendedTool, "executar_acao");
  });

  await test("internal routing parser accepts structured JSON", () => {
    const parsed = parseSecretaryInternalRoutingResult(JSON.stringify({
      intent: "system_query",
      confidence: 0.93,
      latentNeed: "consultar_dados_internos",
      recommendedTool: "consultar_sistema",
      needsClarification: false,
      explicitResume: false,
      shouldIgnoreHistory: false,
      reasoningSummary: "pedido claro",
    }));

    assert.equal(parsed?.intent, "system_query");
    assert.equal(parsed?.recommendedTool, "consultar_sistema");
    assert.equal(parsed?.needsClarification, false);
  });

  await test("piece planner allows generic model request without forcing process number", () => {
    const routing = {
      intent: "legal_piece" as const,
      confidence: 0.99,
      latentNeed: "geracao_peca_juridica",
      recommendedTool: "executar_acao" as const,
      needsClarification: false,
      explicitResume: false,
      shouldIgnoreHistory: false,
      pieceType: "recurso_apelacao",
      reasoningSummary: "follow-up de apelação pedindo modelo genérico",
    };
    const plan = buildFallbackSecretaryPlan({
      routing,
      message: "Deixe-a generica apenas quero ver o modelo padrao",
    });

    assert.equal(plan.shouldExecuteNow, true);
    assert.equal(plan.needsClarification, false);
    assert.ok(plan.steps.includes("build_generic_piece_brief"));
  });

  await test("piece planner override allows using any system case as demo", () => {
    const overridden = applySecretaryPlanOverrides({
      routing: {
        intent: "legal_piece",
        confidence: 0.99,
        latentNeed: "geracao_peca_juridica",
        recommendedTool: "executar_acao",
        needsClarification: false,
        explicitResume: false,
        shouldIgnoreHistory: false,
        reasoningSummary: "pedido claro",
      },
      message: "Pegue qualquer processo do sistema e faca so como modelo padrao sem validade",
      plan: {
        intent: "legal_piece",
        shouldExecuteNow: false,
        actionType: "gerar_peca_estudio",
        needsClarification: true,
        clarificationQuestion: "Qual e o numero do processo ou qual documento devo usar como base?",
        steps: ["ask_minimum_case_context"],
        summary: "Peca precisa de contexto minimo",
      },
    });

    assert.equal(overridden.shouldExecuteNow, true);
    assert.equal(overridden.needsClarification, false);
    assert.ok(overridden.steps.includes("query_system_for_example_case"));
  });

  await test("piece verifier does not treat bare Studio mention as saved", () => {
    const verification = verifySecretaryActionResult(
      "gerar_peca_estudio",
      "Peça Jurídica foi processada no Studio, mas ainda não confirmei a entrega do Word nesta conversa.",
    );

    assert.equal(verification.verified, false);
    assert.equal(verification.finalStatus, "failed");
    assert.equal(verification.checks.saved, false);
  });

  await test("policy matrix flags critical document send for approval", () => {
    const decision = getSecretaryPolicyDecision("acao_enviar_documento_sistema");
    assert.equal(decision.capability, "enviar_documento_sistema");
    assert.equal(decision.sensitivity, "critical");
    assert.equal(decision.requiresHumanApproval, true);
    assert.equal(requiresSecretaryHumanApproval("acao_enviar_documento_sistema"), true);
    assert.equal(requiresSecretaryHumanApproval("acao_atualizar_cliente"), true);
    assert.equal(requiresSecretaryHumanApproval("acao_cadastrar_processo"), true);
    assert.equal(requiresSecretaryHumanApproval("acao_cadastrar_contrato"), true);
    assert.equal(requiresSecretaryHumanApproval("resposta_auto"), false);
  });

  await test("audit payload carries actor and policy metadata", () => {
    const payload = buildSecretaryAuditPayload({
      actionType: "acao_enviar_documento_sistema",
      actorType: "socio",
      executionMode: "tool_call",
      pendingAction: { foo: "bar" },
    });

    assert.equal(payload.foo, "bar");
    assert.equal((payload.audit as any).actorType, "socio");
    assert.equal((payload.audit as any).executionMode, "tool_call");
    assert.equal((payload.audit as any).policy.capability, "enviar_documento_sistema");
  });

  await test("operational state detects piece workflow and media context", () => {
    const state = deriveSecretaryOperationalState([
      { role: "user", content: "Boa noite. Faça as contrarrazões no processo 1234567-89.2024.8.26.0100" },
      { role: "user", content: "[Conteúdo do documento extraído do WhatsApp]\nProcuração e sentença anexadas." },
    ]);

    assert.equal(state.lastUserIntent, "geracao_peca");
    assert.equal(state.lastCaseNumber, "1234567-89.2024.8.26.0100");
    assert.equal(state.hasRecentMediaContext, true);
    assert.ok(state.referencedDocumentCount >= 1);
    assert.ok(state.lastPieceType);
  });

  await test("conversation state is isolated per tenant even with same jid", async () => {
    const deps = {
      getWhatsAppConversation: async () => null,
      getMessagesByConversation: async () => [],
    };

    const tenantOneCtx = await getOrCreateConversationContext("5511999999999@s.whatsapp.net", 1, deps);
    appendMessageToConversationContext(tenantOneCtx, { role: "user", content: "mensagem do tenant 1" });

    const tenantTwoCtx = await getOrCreateConversationContext("5511999999999@s.whatsapp.net", 2, deps);
    assert.equal(tenantTwoCtx.messages.length, 0);
  });

  await test("tool registry exposes current enums and confirmation flag", () => {
    const actionTool = createSecretaryActionTool();
    const queryTool = createSecretarySystemQueryTool();
    const webTool = createSecretaryWebSearchTool();

    const actionProps = actionTool.function.parameters.properties as Record<string, any>;
    const queryProps = queryTool.function.parameters.properties as Record<string, any>;

    assert.equal(webTool.function.name, "pesquisar_web");
    assert.ok(Array.isArray(actionProps.acao.enum));
    assert.ok(actionProps.acao.enum.includes("gerar_peca_estudio"));
    assert.equal(actionProps.confirmed.type, "boolean");
    assert.ok(Array.isArray(queryProps.tipo_consulta.enum));
    assert.ok(queryProps.tipo_consulta.enum.includes("lista_devedores"));
  });

  await test("job runner returns result and forwards error", async () => {
    const value = await runSecretaryJob({
      kind: "legacy_piece_generation",
      operation: async () => "ok",
    });
    assert.equal(value, "ok");

    let capturedError: unknown;
    await assert.rejects(() =>
      runSecretaryJob({
        kind: "media_processing",
        operation: async () => {
          throw new Error("boom");
        },
        onError: (error) => {
          capturedError = error;
        },
      })
    );

    assert.ok(capturedError instanceof Error);
    assert.equal((capturedError as Error).message, "boom");
  });

  await test("legacy action handler strips tags and records side effects", async () => {
    const auditLogs: any[] = [];
    const agendaEvents: any[] = [];
    const updatedClients: any[] = [];
    let legacyPieceCalls = 0;

    const result = await processLegacySecretaryActions({
      response: "Perfeito. [AÃ‡ÃƒO:GERAR_PEÃ‡A|contestacao|Contestação com base nos documentos] [AÃ‡ÃƒO:AGENDAR|2026-04-10|14:00|15:00|Reunião estratégica|Dr. Ronald Serra] [AÃ‡ÃƒO:RELATÃ“RIO|cliente|Relatório completo] [URGENTE] [NOTA:Cliente pediu retorno ainda hoje]",
      tenantId: 1,
      jid: "5511999999999@s.whatsapp.net",
      contactName: "Carlos Henrique",
      clientId: 42,
      openai: {},
      storage: {
        createGeneratedPiece: async () => ({ id: 99 }),
        getClient: async () => ({ id: 42, secretaryNotes: "" }),
        updateClient: async (clientId: number, data: any) => {
          updatedClients.push({ clientId, data });
        },
      },
      createSecretaryAuditLog: async (data: any) => {
        auditLogs.push(data);
      },
      createAgendaEvent: async (data: any) => {
        agendaEvents.push(data);
      },
      generateSimpleLegacyPiece: async () => {
        legacyPieceCalls += 1;
        return null;
      },
      formatForWhatsApp: (text: string) => text.replace(/\s+/g, " ").trim(),
      runSecretaryJob,
    });

    assert.equal(result, "Perfeito.");
    assert.equal(agendaEvents.length, 1);
    assert.equal(updatedClients.length, 1);
    assert.equal(legacyPieceCalls, 1);
    assert.ok(auditLogs.some((log) => log.actionType === "gerar_peca"));
    assert.ok(auditLogs.some((log) => log.actionType === "gerar_peca" && log.status === "blocked"));
    assert.ok(auditLogs.some((log) => log.actionType === "agendamento"));
    assert.ok(auditLogs.some((log) => log.actionType === "relatorio"));
    assert.ok(auditLogs.some((log) => log.actionType === "urgencia"));
  });

  await test("signed agreement archival ignores unrelated files even when phone matches", async () => {
    const result = await archiveSignedAgreementIfMatched({
      jid: "5511999999999@s.whatsapp.net",
      tenantId: 1,
      mediaBase64: Buffer.from("fake").toString("base64"),
      mediaType: "document",
      mediaFileName: "comprovante-residencia.pdf",
      mediaMimetype: "application/pdf",
      extractedText: "Comprovante de residência emitido em abril de 2026.",
      resolveLidToPhone: async () => null,
      normalizePhoneForComparison: (phone: string) => [phone.replace(/\D/g, "")],
      storage: {
        getNegotiationsByTenant: async () => [{ id: 10, status: "acordo_fechado", clientId: 1, caseId: null }],
        getNegotiationContacts: async () => [{ name: "Carlos Henrique", whatsapp: "5511999999999" }],
        createDocument: async () => {
          throw new Error("should not create document");
        },
        updateNegotiation: async () => {
          throw new Error("should not update negotiation");
        },
      },
    });

    assert.equal(result, null);
  });

  console.log("Secretary harness completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
