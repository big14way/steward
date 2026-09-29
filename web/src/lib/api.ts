// Browser code uses the public API URL; server components can use API_INTERNAL (e.g. http://127.0.0.1:8001) when the API runs
// next to the Next.js server, which avoids a round trip through the public hostname (and any DNS/tunnel quirks).
// Browser: same-origin "/api" (proxied by next.config.ts rewrites) unless NEXT_PUBLIC_API points elsewhere.
// Server components: API_INTERNAL directly.
const PUBLIC_API = process.env.NEXT_PUBLIC_API || "/api";
const API = typeof window === "undefined" ? (process.env.API_INTERNAL ?? (PUBLIC_API.startsWith("/") ? "http://127.0.0.1:8001" : PUBLIC_API)) : PUBLIC_API;
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://explorer.testnet.arc.io";
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";

export const get = <T,>(p: string, headers: Record<string, string> = {}) =>
  fetch(`${API}${p}`, { cache: "no-store", headers }).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as T;
  });
export const post = <T,>(p: string, body: unknown) =>
  fetch(`${API}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T }));

export const usd = (n: number) => (n / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tx = (h?: string | null) => (h ? `${EXPLORER}/tx/${h}` : "#");
export const addr = (a?: string | null) => (a ? `${EXPLORER}/address/${a}` : "#");
export const short = (h?: string | null, n = 6) => (h ? `${h.slice(0, 2 + n)}…${h.slice(-4)}` : "");
export const when = (t?: number | null) => (t ? new Date(t * 1000).toLocaleString() : "");
export const ago = (t?: number | null) => {
  if (!t) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const periodLabel = (s: number) => (s === 0 ? "no reset" : s === 86400 ? "per day" : s === 604800 ? "per week" : s === 2592000 ? "per month" : `per ${s}s`);

// ---- owner sign-in (stored once in this browser) ----
export const OWNER_KEY = "steward.owner_secret";
export const getOwnerSecret = () => { try { return localStorage.getItem(OWNER_KEY) ?? ""; } catch { return ""; } };
export const setOwnerSecret = (s: string) => { try { s ? localStorage.setItem(OWNER_KEY, s) : localStorage.removeItem(OWNER_KEY); } catch {} };
export const JUDGE_SECRET = process.env.NEXT_PUBLIC_JUDGE_SECRET ?? "";

// ---- plain English for the rules engine ----
export const RULE_TEXT: Record<string, string> = {
  R1_screen: "Payee failed screening",
  R2_no_evidence: "No evidence attached",
  R3_over_per_tx: "Above the per-payment cap",
  R4_no_room: "No budget room this period",
  R4_partial: "Only part fits this period's budget",
  R5_pay: "Within policy",
};
export const ruleText = (rule?: string | null) => {
  if (!rule) return "";
  const base = rule.replace(/_xchain$/, "");
  return (RULE_TEXT[base] ?? base) + (rule.endsWith("_xchain") ? " · cross-chain payout needs the owner" : "");
};
export const ACTION_TEXT: Record<string, string> = {
  PAY: "Paid", PARTIAL: "Partly paid, rest needs approval", HOLD: "On hold", ESCALATE: "Needs owner approval",
  SCREEN_FAIL: "Blocked: screening failed", SWEEP: "Swept to vault", REDEEM: "Redeemed from vault",
};
export const ACTION_COLOR: Record<string, string> = {
  PAY: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30", PARTIAL: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  HOLD: "text-zinc-300 bg-zinc-500/10 border-zinc-500/30", ESCALATE: "text-orange-300 bg-orange-500/10 border-orange-500/30",
  SCREEN_FAIL: "text-red-300 bg-red-500/10 border-red-500/30", SWEEP: "text-sky-300 bg-sky-500/10 border-sky-500/30", REDEEM: "text-sky-300 bg-sky-500/10 border-sky-500/30",
};
export const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting for the agent", paid: "Paid", partial: "Partly paid", held: "On hold: add evidence", escalated: "Waiting for owner approval",
  rejected: "Declined by owner", error: "Error, retrying", batched: "Scheduled",
};
export const STATUS_COLOR: Record<string, string> = {
  pending: "text-zinc-300 bg-zinc-500/10 border-zinc-500/30", paid: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  partial: "text-amber-300 bg-amber-500/10 border-amber-500/30", held: "text-zinc-300 bg-zinc-500/10 border-zinc-500/30",
  escalated: "text-orange-300 bg-orange-500/10 border-orange-500/30", rejected: "text-red-300 bg-red-500/10 border-red-500/30",
  error: "text-red-300 bg-red-500/10 border-red-500/30", batched: "text-sky-300 bg-sky-500/10 border-sky-500/30",
};

// ---- types ----
export type Decision = {
  hash: string; milestone_id: string; allowance_id: number; action: string; amount: number; remainder: number;
  rule: string; reason: string; source: string; timing?: string; record_tx?: string | null; pay_tx?: string | null;
  escalate_tx?: string | null; approved_tx?: string | null; human_agreed?: number | null; created_at: number;
  escalation_hash?: string | null; canonical?: string; mint_tx?: string | null;
};
export type Stats = {
  allowances: number; payers: number; contractors: number; usdc_paid: number; decisions: number;
  by_action: Record<string, number>; human_agreed_pct: number | null; on_time_pct: number | null; usyc_swept: number;
  milestones_paid: number; integrators: number; updated_at: number;
};
export type Allowance = {
  id: number; owner: string; agent: string; payee: string; capPerPeriod: number; perTxCap: number; period: number;
  periodStart: number; expiry: number; spentThisPeriod: number; funded: number; revoked: boolean;
};
export type Milestone = {
  id: string; allowance_id: number; payee: string; title: string; amount: number; evidence_url: string; evidence_hash: string;
  status: string; created_at: number; paid_tx?: string | null; paid_block?: number | null; last_error?: string | null; payout_chain?: string | null;
  auth?: string | null; decision?: (Partial<Decision> & { created_at: number }) | null;
};
export type TreasuryEvent = { id: number; action: string; assets: number; shares: number; tx: string; hash?: string; record_tx?: string | null; created_at: number };
export type Treasury = {
  events: TreasuryEvent[]; sweeper?: string | null; vault?: string; balance?: number; floor?: number; shares?: number; position_assets?: number; error?: string;
};
export type Health = { ok: boolean; chain_id: number; block: number; allowance_manager: string; owner_signer: string; owner: string; explorer: string };
export type Contractor = {
  id: string; name: string; contact: string; address: string; has_circle_wallet: boolean; allowance_id: number; status: string; created_at: number;
  link: string; payer: string;
  policy: { per_tx: number; cap_period: number; period: number; expiry: number };
  budget: { funded: number; spent_this_period: number; remaining_this_period: number; period_start: number; period_end: number | null };
  requests: { open: number; paid: number };
  create_tx?: string; fund_tx?: string; circle_wallet_created?: boolean;
};
export type Portal = Contractor & { requests_list: Milestone[]; explorer: string };
