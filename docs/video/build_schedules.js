const { fromLines, fromCommand, esc } = require(process.env.HOME + '/.claude/skills/pitch-video/scripts/schedules.js');
const fs = require('fs');
// Attack: the real Arc Testnet fork trace (gas numbers dropped, addresses kept), then the API refusing the approval.
const fork = fromCommand('arc-forge test --match-test test_arc_payToBlocklistedPayeeReverts --fork-url $ARC_RPC -vvvv', [
  'Ran 1 test for test/AllowanceManager.t.sol:ArcForkTest',
  { text: '[PASS] test_arc_payToBlocklistedPayeeReverts()', cls: 'ok' },
  { text: '  AllowanceManager::pay(0, 100000000, 0xe0770d5f…6cf6, "should never land")', cls: 'fn' },
  '    USDC 0x3600…0000::transfer(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 100000000)',
  '      0x1800…0000::transfer(AllowanceManager, 0x7099…79C8, 1e20)',
  { text: '        ← [Revert] Blocked address', cls: 'bad' },
  { text: '  ← [Revert] Blocked address', cls: 'bad' },
  { text: 'Suite result: ok. 1 passed; 0 failed; live Arc Testnet fork', cls: 'ok', gap: 1.6 },
], { dir: 'contracts', gap: 0.7 });
const t1 = fork[fork.length - 1].t + 1.2;
const api = fromCommand("curl -X POST $API/escalations/0x5582…fc91/approve -d '{\"owner_secret\":\"…\"}'", [
  { text: '{"detail":"screen failures cannot be approved"}', cls: 'bad' },
  { text: 'http 400', cls: 'bad' },
], { dir: '', start: t1, gap: 0.8 });
fs.writeFileSync('schedules/attack.json', JSON.stringify(fork.concat(api), null, 1));
// SDK: the ten lines, then the cross-language hash test (real test names).
const code = [
  ['kw', 'import'], ['', ' { Steward } '], ['kw', 'from'], ['str', ' "steward-sdk"'], ['', ';'],
];
const L = (html) => ({ html });
const codeLines = [
  '<span class="kw">import</span> { Steward } <span class="kw">from</span> <span class="str">"steward-sdk"</span>;',
  '',
  '<span class="kw">const</span> s = <span class="kw">new</span> <span class="fn">Steward</span>({ allowanceManager, auditLog, account: agent });',
  '',
  '<span class="cm">// rules, canonical hash, AuditLog.record(), then pay() or escalate()</span>',
  '<span class="kw">const</span> r = <span class="kw">await</span> s.<span class="fn">decide</span>({',
  '  allowanceId: 0n, amount: 150_000_000n, memo: <span class="str">"logo v2"</span>,',
  '  inputs: { milestone: <span class="str">"logo v2"</span>, evidence: <span class="str">"ipfs://…"</span> }, evidence: <span class="kw">true</span>, screenOk: <span class="kw">true</span>,',
  '  reason: llmText,   <span class="cm">// your model writes the reason, never the amount</span>',
  '});',
  'console.<span class="fn">log</span>(r.action, r.hash, r.payTx ?? r.escalateTx);',
];
let sdk = fromCommand('cat agent.ts', [], { dir: 'my-agent', gap: 0.2 });
let t = sdk[sdk.length - 1].t + 0.2;
// fromCommand with no lines returns just the prompt; compute start after typing
t = 0.5 + 'cat agent.ts'.length / 45 + 1.0;
for (const h of codeLines) { sdk.push({ t, html: h || '&nbsp;' }); t += 0.28; }
t += 1.2;
const test = fromCommand('node --test test/hash.test.mjs', [
  { text: '✓ canonical JSON is sorted and compact' },
  { text: '✓ decision hash matches the Python SDK' },
  { text: '✓ remainder hash matches the Python SDK' },
  { text: '✓ rules: LLM never sets amounts' },
  { text: '# pass 4  # fail 0', cls: 'ok' },
], { dir: 'packages/steward-sdk', start: t, gap: 0.6 });
fs.writeFileSync('schedules/sdk.json', JSON.stringify(sdk.concat(test), null, 1));
console.log('attack', fork.concat(api).slice(-1)[0].t.toFixed(1), 's; sdk', test.slice(-1)[0].t.toFixed(1), 's');
