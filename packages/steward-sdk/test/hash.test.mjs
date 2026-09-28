import test from "node:test";
import assert from "node:assert/strict";
import { canonical, decisionHash, remainderHash, applyRules } from "../dist/index.js";

// Same record hashed by the Python package (steward_sdk.decision_hash / remainder_hash) — the two SDKs must agree.
const record = {"allowanceId":"0","requested":"150000000","amount":"150000000","remainder":"0","action":"PAY","rule":"R5_pay","memo":"logo v2","reason":"ok — évidence ✓","inputs":{"milestone":"logo v2","evidence":"ipfs://x","n":3,"tags":["b","a"]},"blockNumber":"42"};
const [PY_HASH, PY_REMAINDER] = "0xd6165dade061a67feb021f7caf89fbc390c96e5cd6d4c16e5717ef444dd0ac7d 0xcfee243972c1fa96be33ae82d29b7b521635197b07144070471c36115385480f".split(" ");

test("canonical JSON is sorted and compact", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});
test("decision hash matches the Python SDK", () => { assert.equal(decisionHash(record), PY_HASH); });
test("remainder hash matches the Python SDK", () => { assert.equal(remainderHash(decisionHash(record)), PY_REMAINDER); });
test("rules: LLM never sets amounts", () => {
  const a = { owner: "0x", agent: "0x", payee: "0x", capPerPeriod: 800_000_000n, perTxCap: 200_000_000n, period: 0n, periodStart: 0n, expiry: 0n, spentThisPeriod: 0n, funded: 500_000_000n, revoked: false };
  assert.deepEqual(applyRules(a, { allowanceId: 0n, amount: 150_000_000n, memo: "", inputs: {} }), { action: "PAY", rule: "R5_pay", pay: 150_000_000n, remainder: 0n });
  assert.equal(applyRules(a, { allowanceId: 0n, amount: 350_000_000n, memo: "", inputs: {} }).action, "ESCALATE");
  assert.equal(applyRules(a, { allowanceId: 0n, amount: 1n, memo: "", inputs: {}, screenOk: false }).action, "SCREEN_FAIL");
  assert.equal(applyRules(a, { allowanceId: 0n, amount: 1n, memo: "", inputs: {}, evidence: false }).action, "HOLD");
  assert.deepEqual(applyRules(a, { allowanceId: 0n, amount: 150_000_000n, memo: "", inputs: {}, reserveFloor: 100_000_000n, obligations: 390_000_000n }), { action: "PARTIAL", rule: "R4_partial", pay: 10_000_000n, remainder: 140_000_000n });
});
