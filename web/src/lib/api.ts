const API = process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:8001";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://explorer.testnet.arc.io";

export const get = <T,>(p: string) =>
  fetch(`${API}${p}`, { cache: "no-store" }).then((r) => r.json() as Promise<T>);
export const post = <T,>(p: string, body: unknown) =>
  fetch(`${API}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: (await r.json()) as T }));

export const usd = (n: number) => (n / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tx = (h?: string | null) => (h ? `${EXPLORER}/tx/${h}` : "#");
export const addr = (a?: string | null) => (a ? `${EXPLORER}/address/${a}` : "#");
export const short = (h?: string | null, n = 6) => (h ? `${h.slice(0, 2 + n)}…${h.slice(-4)}` : "");
export const when = (t: number) => new Date(t * 1000).toLocaleString();

export type Decision = {
  hash: string; milestone_id: string; allowance_id: number; action: string; amount: number; remainder: number;
  rule: string; reason: string; source: string; timing?: string; record_tx?: string | null; pay_tx?: string | null;
  escalate_tx?: string | null; approved_tx?: string | null; human_agreed?: number | null; created_at: number;
  escalation_hash?: string | null; canonical?: string;
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
  status: string; created_at: number; paid_tx?: string | null; paid_block?: number | null; last_error?: string | null;
};
export type Health = { ok: boolean; chain_id: number; block: number; allowance_manager: string; owner_signer: string; owner: string; explorer: string };

export const ACTION_COLOR: Record<string, string> = {
  PAY: "text-emerald-300", PARTIAL: "text-amber-300", HOLD: "text-zinc-300", ESCALATE: "text-orange-300", SCREEN_FAIL: "text-red-300",
};
