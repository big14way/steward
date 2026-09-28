"use client";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignTypedData, useChainId, useSwitchChain } from "wagmi";
import { get, post, usd, tx, when, type Milestone } from "@/lib/api";
import { arcTestnet } from "@/lib/wagmi";

const AM = process.env.NEXT_PUBLIC_ALLOWANCE_MANAGER as `0x${string}`;
const domain = { name: "STEWARD", version: "1", chainId: 5042002, verifyingContract: AM } as const;
const types = {
  Milestone: [
    { name: "allowanceId", type: "uint256" }, { name: "title", type: "string" }, { name: "amount", type: "uint128" },
    { name: "evidenceHash", type: "bytes32" }, { name: "nonce", type: "string" }, { name: "payoutChain", type: "string" },
  ],
} as const;

async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return "0x" + [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const STATUS: Record<string, string> = { pending: "text-zinc-300", paid: "text-emerald-300", partial: "text-amber-300", held: "text-zinc-400", escalated: "text-orange-300", rejected: "text-red-300", error: "text-red-300" };

export default function Page() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [f, setF] = useState({ allowance_id: "0", title: "", amount: "", evidence_url: "" });
  const [xchain, setXchain] = useState(false);
  const [out, setOut] = useState<unknown>(null);
  const [hist, setHist] = useState<Milestone[]>([]);
  const [busy, setBusy] = useState(false);
  const load = (a?: string) => a && get<Milestone[]>(`/milestones?payee=${a}`).then(setHist).catch(() => setHist([]));
  useEffect(() => { load(address); }, [address]);

  const submit = async () => {
    setBusy(true);
    try {
      const nonce = crypto.randomUUID();
      const amount = BigInt(Math.round(+f.amount * 1e6));
      const evidenceHash = (await sha256Hex(f.evidence_url)) as `0x${string}`;
      const payoutChain = xchain ? "base-sepolia" : "arc";
      const signature = await signTypedDataAsync({ domain, types, primaryType: "Milestone", message: { allowanceId: BigInt(f.allowance_id), title: f.title, amount, evidenceHash, nonce, payoutChain } });
      const r = await post("/milestones", { allowance_id: +f.allowance_id, title: f.title, amount: Number(amount), evidence_url: f.evidence_url, nonce, signature, payout_chain: payoutChain });
      setOut(r.data); load(address);
    } catch (e) { setOut({ error: String(e) }); }
    setBusy(false);
  };

  if (!isConnected) {
    return (
      <div className="space-y-4 max-w-lg">
        <h1 className="text-xl font-semibold">Contractor</h1>
        <p className="text-sm text-zinc-400">Connect the wallet the owner set as payee on your allowance. You sign a milestone (EIP-712, no gas); the agent decides within one cycle and pays in USDC on Arc.</p>
        {connectors.map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} className="bg-zinc-100 text-zinc-900 rounded px-4 py-2 mr-2">Connect {c.name}</button>
        ))}
        {connectors.length === 0 && <div className="text-zinc-500 text-sm">No injected wallet found. Install MetaMask, or use <code>api/scripts/submit_milestone.py</code>.</div>}
      </div>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Submit a milestone</h1>
        <div className="text-xs text-zinc-400 break-all">Signed in as {address} <button className="underline ml-2" onClick={() => disconnect()}>disconnect</button></div>
        {chainId !== arcTestnet.id && (
          <div className="text-amber-300 text-xs">Wrong network (chain {chainId}). <button className="underline" onClick={() => switchChain({ chainId: arcTestnet.id })}>Switch to Arc Testnet</button></div>
        )}
        {([["allowance_id", "Allowance id"], ["title", "Title (becomes the on-chain memo)"], ["amount", "Amount (USDC)"], ["evidence_url", "Evidence URL (missing evidence → HOLD)"]] as const).map(([k, label]) => (
          <label key={k} className="block text-sm"><span className="text-zinc-400">{label}</span>
            <input className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
        <button disabled={busy || !f.title || !f.amount} onClick={submit} className="bg-zinc-100 text-zinc-900 disabled:opacity-50 rounded px-4 py-2">{busy ? "…" : "Sign & submit milestone"}</button>
        {out != null && <pre className="text-xs bg-zinc-900 p-3 rounded overflow-auto">{JSON.stringify(out, null, 2)}</pre>}
        <label className="flex items-start gap-2 text-xs text-zinc-400 border border-zinc-800 rounded p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={xchain} onChange={(e) => setXchain(e.target.checked)} />
          <span><b className="text-zinc-200">Receive on Base Sepolia</b> via CCTP V2. Signed into the milestone. The agent still screens and applies the caps, but
            the payout itself is executed by the owner (burn on Arc → mint to your address on Base Sepolia) after a one-tap approval, because a
            cross-chain transfer can't be enforced by the allowance contract. Leave unchecked to be paid on Arc, where USDC is also your gas.</span>
        </label>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Your milestones</h2>
        {hist.length === 0 && <div className="text-zinc-500 text-sm">None yet.</div>}
        {hist.map((m) => (
          <div key={m.id} className="rounded border border-zinc-800 p-3 text-sm">
            <div className="flex flex-wrap gap-x-3"><span className="font-medium">{m.title}</span><span>{usd(m.amount)} USDC</span><span className={`font-mono ${STATUS[m.status] ?? ""}`}>{m.status}</span><span className="text-zinc-500 ml-auto">{when(m.created_at)}</span></div>
            <div className="text-xs text-zinc-500 mt-1 break-all">
              #{m.allowance_id} · {m.payout_chain && m.payout_chain !== "arc" ? `payout on ${m.payout_chain}` : "payout on Arc"} · {m.evidence_url ? <a className="underline" href={m.evidence_url} target="_blank">evidence</a> : "no evidence"}
              {m.paid_tx && <> · <a className="underline" href={tx(m.paid_tx)} target="_blank">paid tx</a></>}
              {m.last_error && <> · <span className="text-red-300">{m.last_error}</span></>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
