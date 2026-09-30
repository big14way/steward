import {
  createPublicClient, createWalletClient, http, keccak256, stringToHex, type Account, type Chain, type Hex, type Transport,
} from "viem";
import { arcTestnet } from "viem/chains";

export { arcTestnet };

export const AM_ABI = [
  { type: "function", name: "pay", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint128" }, { name: "decisionHash", type: "bytes32" }, { name: "memo", type: "string" }], outputs: [] },
  { type: "function", name: "escalate", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint128" }, { name: "decisionHash", type: "bytes32" }, { name: "reason", type: "string" }], outputs: [] },
  { type: "function", name: "allowances", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [
    { name: "owner", type: "address" }, { name: "agent", type: "address" }, { name: "payee", type: "address" }, { name: "capPerPeriod", type: "uint128" },
    { name: "perTxCap", type: "uint128" }, { name: "period", type: "uint64" }, { name: "periodStart", type: "uint64" }, { name: "expiry", type: "uint64" },
    { name: "spentThisPeriod", type: "uint128" }, { name: "funded", type: "uint128" }, { name: "revoked", type: "bool" }] },
  { type: "function", name: "usedDecision", stateMutability: "view", inputs: [{ name: "h", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nextId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const LOG_ABI = [
  { type: "function", name: "record", stateMutability: "nonpayable", inputs: [{ name: "allowanceId", type: "uint256" }, { name: "decisionHash", type: "bytes32" }, { name: "action", type: "uint8" }, { name: "amount", type: "uint128" }], outputs: [] },
] as const;

export type Action = "HOLD" | "PAY" | "PARTIAL" | "ESCALATE" | "SCREEN_FAIL";
export const ACTION_CODE: Record<Action, number> = { HOLD: 0, PAY: 1, PARTIAL: 2, ESCALATE: 3, SCREEN_FAIL: 6 };
/** Arc's minimum base fee. Anything lower is dropped silently with no receipt. */
export const MIN_FEE_PER_GAS = 20_000_000_000n;
/** Remainder key for a PARTIAL: pay() consumed the decision hash, approveAndPay() consumes this one. Same tag as the Python agent. */
export const REMAINDER_TAG = "STEWARD/remainder";

export type Allowance = {
  owner: Hex; agent: Hex; payee: Hex; capPerPeriod: bigint; perTxCap: bigint; period: bigint; periodStart: bigint; expiry: bigint;
  spentThisPeriod: bigint; funded: bigint; revoked: boolean;
};

export type DecideParams = {
  allowanceId: bigint;
  /** requested amount, 6-dp USDC */
  amount: bigint;
  /** on-chain memo (≤ 60 chars recommended) */
  memo: string;
  /** anything you want hashed into the decision record (milestone id, evidence, model inputs…) */
  inputs: Record<string, unknown>;
  /** false → SCREEN_FAIL. Default true. */
  screenOk?: boolean;
  /** false → HOLD. Default true. */
  evidence?: boolean;
  reserveFloor?: bigint;
  obligations?: bigint;
  /** a human-readable reason (your LLM's, or leave empty for a rules-only reason). Never sets amounts. */
  reason?: string;
};

export type DecisionRecord = {
  allowanceId: string; requested: string; amount: string; remainder: string; action: Action; rule: string; memo: string; reason: string;
  inputs: Record<string, unknown>; blockNumber: string;
};

export type DecideResult = {
  action: Action; rule: string; pay: bigint; remainder: bigint; hash: Hex; remainderHash?: Hex;
  recordTx: Hex; payTx?: Hex; escalateTx?: Hex; canonical: string; record: DecisionRecord;
};

/** Sorted-key, whitespace-free JSON (arrays keep order). Same idea as the Python agent's canonical_json. */
export function canonical(obj: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
      : typeof v === "bigint" ? v.toString() : v;
  return JSON.stringify(sort(obj));
}
export const decisionHash = (record: unknown): Hex => keccak256(stringToHex(canonical(record)));
export const remainderHash = (hash: Hex): Hex => keccak256(`0x${stringToHex(REMAINDER_TAG).slice(2)}${hash.slice(2)}` as Hex);

/** Deterministic rules. The LLM (if any) only supplies `reason`. */
export function applyRules(a: Allowance, p: DecideParams): { action: Action; rule: string; pay: bigint; remainder: bigint } {
  if (p.screenOk === false) return { action: "SCREEN_FAIL", rule: "R1_screen", pay: 0n, remainder: p.amount };
  if (p.evidence === false) return { action: "HOLD", rule: "R2_no_evidence", pay: 0n, remainder: 0n };
  if (p.amount > a.perTxCap) return { action: "ESCALATE", rule: "R3_over_per_tx", pay: 0n, remainder: p.amount };
  const room = a.capPerPeriod - a.spentThisPeriod;
  const liquid = a.funded - (p.reserveFloor ?? 0n) - (p.obligations ?? 0n);
  const allowed = [p.amount, room, liquid].reduce((m, x) => (x < m ? x : m));
  if (allowed <= 0n) return { action: "ESCALATE", rule: "R4_no_room", pay: 0n, remainder: p.amount };
  if (allowed < p.amount) return { action: "PARTIAL", rule: "R4_partial", pay: allowed, remainder: p.amount - allowed };
  return { action: "PAY", rule: "R5_pay", pay: p.amount, remainder: 0n };
}

/**
 * The part of a Circle Developer-Controlled Wallets client STEWARD uses. Pass the client you already have:
 * `initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })` from `@circle-fin/developer-controlled-wallets`.
 */
export type CircleClientLike = {
  createContractExecutionTransaction(req: {
    walletId?: string; walletAddress?: string; blockchain?: string; contractAddress: string; abiFunctionSignature: string;
    abiParameters: unknown[]; fee: { type: "level"; config: { feeLevel: "LOW" | "MEDIUM" | "HIGH" } }; idempotencyKey?: string;
  }): Promise<{ data?: { id?: string } }>;
  getTransaction(req: { id: string }): Promise<{ data?: { transaction?: { state?: string; txHash?: string; errorReason?: string } } }>;
};

/** Sign with a Circle developer-controlled wallet instead of a raw key. The allowance's `agent` must be this wallet's address. */
export type CircleSigner = { client: CircleClientLike; walletId: string; feeLevel?: "LOW" | "MEDIUM" | "HIGH"; pollMs?: number; timeoutMs?: number };

type StewardConfig = { rpc?: string; chain?: Chain; allowanceManager: Hex; auditLog: Hex; transport?: Transport } &
  ({ account: Account; circle?: undefined } | { circle: CircleSigner; account?: undefined });

/** Solidity signatures for the writes, in Circle's abiFunctionSignature format. */
const SIGNATURES: Record<string, string> = {
  record: "record(uint256,bytes32,uint8,uint128)",
  pay: "pay(uint256,uint128,bytes32,string)",
  escalate: "escalate(uint256,uint128,bytes32,string)",
};

export class Steward {
  private pub;
  private wallet;
  constructor(private cfg: StewardConfig) {
    const chain = cfg.chain ?? arcTestnet;
    const transport = cfg.transport ?? http(cfg.rpc ?? "https://rpc.testnet.arc.io");
    this.pub = createPublicClient({ chain, transport });
    this.wallet = cfg.account ? createWalletClient({ chain, transport, account: cfg.account }) : undefined;
    if (!cfg.account && !cfg.circle) throw new Error("Steward needs either `account` (a viem account) or `circle` (a Circle wallet)");
  }

  async allowance(id: bigint): Promise<Allowance> {
    const [owner, agent, payee, capPerPeriod, perTxCap, period, periodStart, expiry, spentThisPeriod, funded, revoked] =
      await this.pub.readContract({ address: this.cfg.allowanceManager, abi: AM_ABI, functionName: "allowances", args: [id] });
    return { owner, agent, payee, capPerPeriod, perTxCap, period, periodStart, expiry, spentThisPeriod, funded, revoked };
  }

  private async fees() {
    const block = await this.pub.getBlock();
    const base = block.baseFeePerGas ?? 0n;
    const maxFeePerGas = base + base / 4n > MIN_FEE_PER_GAS ? base + base / 4n : MIN_FEE_PER_GAS;
    return { maxFeePerGas, maxPriorityFeePerGas: 1_000_000_000n };
  }

  /** Submit through Circle and wait for the on-chain hash. The idempotency key is fixed first, so a retry can't double-submit. */
  private async writeCircle(address: Hex, functionName: string, args: readonly unknown[]): Promise<Hex> {
    const c = this.cfg.circle!;
    const idempotencyKey = globalThis.crypto.randomUUID();
    const res = await c.client.createContractExecutionTransaction({
      walletId: c.walletId, contractAddress: address, abiFunctionSignature: SIGNATURES[functionName],
      abiParameters: args.map((a) => (typeof a === "bigint" || typeof a === "number" ? a.toString() : a)),
      fee: { type: "level", config: { feeLevel: c.feeLevel ?? "MEDIUM" } }, idempotencyKey,
    });
    const id = res.data?.id;
    if (!id) throw new Error("Circle did not return a transaction id");
    const deadline = Date.now() + (c.timeoutMs ?? 120_000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, c.pollMs ?? 2_000));
      const t = (await c.client.getTransaction({ id })).data?.transaction;
      if ((t?.state === "COMPLETE" || t?.state === "CONFIRMED") && t.txHash) return t.txHash as Hex;
      if (t?.state === "FAILED" || t?.state === "DENIED" || t?.state === "CANCELLED") throw new Error(`Circle tx ${id} ${t.state}: ${t.errorReason ?? ""}`);
    }
    throw new Error(`Circle tx ${id} not confirmed in time`);
  }

  private async write(address: Hex, abi: typeof AM_ABI | typeof LOG_ABI, functionName: string, args: readonly unknown[]): Promise<Hex> {
    if (!this.wallet) return this.writeCircle(address, functionName, args);
    const fees = await this.fees();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await this.wallet.writeContract({ address, abi: abi as any, functionName: functionName as any, args: args as any, ...fees });
    const rcpt = await this.pub.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") throw new Error(`tx reverted ${hash}`);
    return hash;
  }

  /** rules → canonical hash → AuditLog.record() → pay() | escalate(). Every call is recorded, including HOLD. */
  async decide(p: DecideParams): Promise<DecideResult> {
    const a = await this.allowance(p.allowanceId);
    const r = applyRules(a, p);
    const blockNumber = await this.pub.getBlockNumber();
    const record: DecisionRecord = {
      allowanceId: p.allowanceId.toString(), requested: p.amount.toString(), amount: r.pay.toString(), remainder: r.remainder.toString(),
      action: r.action, rule: r.rule, memo: p.memo, reason: p.reason ?? `${r.rule}: ${r.action} by policy`, inputs: p.inputs, blockNumber: blockNumber.toString(),
    };
    const hash = decisionHash(record);
    const recordTx = await this.write(this.cfg.auditLog, LOG_ABI, "record", [p.allowanceId, hash, ACTION_CODE[r.action], r.pay]);
    let payTx: Hex | undefined, escalateTx: Hex | undefined, rHash: Hex | undefined;
    if (r.action === "PAY" || r.action === "PARTIAL") payTx = await this.write(this.cfg.allowanceManager, AM_ABI, "pay", [p.allowanceId, r.pay, hash, p.memo]);
    if (r.remainder > 0n) {
      rHash = r.action === "PARTIAL" ? remainderHash(hash) : hash;
      escalateTx = await this.write(this.cfg.allowanceManager, AM_ABI, "escalate", [p.allowanceId, r.remainder, rHash, record.reason.slice(0, 200)]);
    }
    return { action: r.action, rule: r.rule, pay: r.pay, remainder: r.remainder, hash, remainderHash: rHash, recordTx, payTx, escalateTx, canonical: canonical(record), record };
  }
}
