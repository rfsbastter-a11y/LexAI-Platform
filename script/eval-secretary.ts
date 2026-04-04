import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildFallbackSecretaryInternalRouting } from "../server/services/secretaryInternalPrompts";
import { buildFallbackSecretaryPlan } from "../server/services/secretaryPlanning";
import { verifySecretaryActionResult } from "../server/services/secretaryVerifier";

type EvalCase = {
  name: string;
  message: string;
  isSocio: boolean;
  expectedIntent: string;
  expectedTool: string;
  expectClarification?: boolean;
};

const fixturesPath = path.join(process.cwd(), "script", "evals", "secretary", "transcripts.json");
const cases = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as EvalCase[];

for (const testCase of cases) {
  const routing = buildFallbackSecretaryInternalRouting({
    message: testCase.message,
    isSocio: testCase.isSocio,
  });
  const plan = buildFallbackSecretaryPlan({
    routing,
    message: testCase.message,
  });

  assert.equal(routing.intent, testCase.expectedIntent, `${testCase.name}: intent`);
  assert.equal(routing.recommendedTool, testCase.expectedTool, `${testCase.name}: tool`);
  if (typeof testCase.expectClarification === "boolean") {
    assert.equal(plan.needsClarification, testCase.expectClarification, `${testCase.name}: clarification`);
  }
  console.log(`PASS ${testCase.name}`);
}

const verifierCompleted = verifySecretaryActionResult("gerar_peca_estudio", "📋 Recurso de Apelação\nENVIADA COM SUCESSO");
assert.equal(verifierCompleted.finalStatus, "completed");
const verifierPartial = verifySecretaryActionResult("gerar_peca_estudio", "📋 Recurso de Apelação\nSalvo no LexAI Studio");
assert.equal(verifierPartial.finalStatus, "partial");
console.log("PASS verifier_piece_statuses");
