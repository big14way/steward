"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, Link2, Copy, Check, Plus, ArrowUpRight, History, Ban, ArrowRight, ArrowLeft } from "lucide-react";
import { get, post, usd, addr, short, when, periodLabel, type Contractor } from "@/lib/api";
import { useSession } from "../session";
import { Avatar, Button, Card, EmptyState, Field, Modal, PageHeader, Pill, Progress, Skeleton, inputCls, useToast } from "../ui";

const PERIODS: [string, number][] = [["per week", 604800], ["per day", 86400], ["per month", 2592000], ["never resets", 0]];
const blank = { name: "", contact: "", address: "", per_tx: "3", cap_period: "8", period: "604800", fund: "6" };

export default function Page() {
  const { me } = useSession();
  const secret = me ? "session" : "";
  const isOwner = me?.role === "owner";
  const toast = useToast();
  const [list, setList] = useState<Contractor[] | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState("");
  const [created, setCreated] = useState<Contractor | null>(null);
  const [copied, setCopied] = useState("");
  const [inline, setInline] = useState<{ id: string; kind: "fund" | "revoke"; value: string } | null>(null);

  const load = useCallback(() => {
    if (!secret) { setList(null); return; }
    get<Contractor[]>("/contractors").then(setList).catch((e) => { setList([]); if (String(e.message) === "401") toast.push("err", "Your session ended. Sign in again."); });
  }, [secret, toast]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const copy = async (c: Contractor) => { try { await navigator.clipboard.writeText(c.link); setCopied(c.id); setTimeout(() => setCopied(""), 1500); toast.push("ok", `Link for ${c.name} copied.`); } catch { toast.push("err", "Could not copy — select the link and copy it manually."); } };

  const add = async () => {
    setBusy("add");
    const r = await post<Contractor & { detail?: string }>("/contractors", {
      name: f.name, contact: f.contact, address: f.address,
      per_tx: Math.round(+f.per_tx * 1e6), cap_period: Math.round(+f.cap_period * 1e6), period: +f.period, fund: Math.round(+f.fund * 1e6),
    });
    setBusy("");
    if (!r.ok) { toast.push("err", r.data.detail ?? `Failed (${r.status})`); return; }
    setCreated(r.data); setOpen(false); setStep(0); setF(blank); load();
    toast.push("ok", <>{r.data.name} is set up{r.data.circle_wallet_created ? " with a new Circle wallet" : ""}. Send them their link.</>);
  };
  const fund = async (c: Contractor, v: string) => {
    setBusy(c.id); const r = await post<{ detail?: string; txHash?: string }>(`/contractors/${c.id}/fund`, { amount: Math.round(+v * 1e6) }); setBusy(""); setInline(null);
    r.ok ? toast.push("ok", <>Topped up {c.name} by {v} USDC. <a className="underline" href={`https://explorer.testnet.arc.io/tx/${r.data.txHash}`} target="_blank">tx</a></>) : toast.push("err", r.data.detail ?? "Top-up failed. Is the owner wallet funded?"); load();
  };
  const revoke = async (c: Contractor) => {
    setBusy(c.id); const r = await post<{ detail?: string }>(`/contractors/${c.id}/revoke`, {}); setBusy(""); setInline(null);
    r.ok ? toast.push("ok", `${c.name}'s budget ended. Unspent USDC returned to you.`) : toast.push("err", r.data.detail ?? "Revoke failed"); load();
  };
  const F = (k: keyof typeof f, label: string, hint?: string, placeholder?: string, type = "text") => (
    <Field label={label} hint={hint}><input type={type} className={inputCls} placeholder={placeholder} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  );
  const summary = `Up to ${(+f.per_tx || 0).toFixed(2)} USDC per payment · ${(+f.cap_period || 0).toFixed(2)} USDC ${PERIODS.find(([, v]) => v === +f.period)?.[0] ?? ""}${+f.fund ? ` · funded with ${(+f.fund).toFixed(2)} USDC now` : ""}`;

  if (!me) {
    return <div className="space-y-4"><Skeleton className="h-16" /><div className="grid md:grid-cols-2 gap-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div></div>;
  }

  return (
    <div>
      <PageHeader title="Contractors" description="Each contractor has an on-chain budget the agent cannot exceed, and a private link to request payment."
        action={<Button disabled={!isOwner} title={isOwner ? undefined : "The demo can't add contractors"} onClick={() => { setOpen(true); setStep(0); setCreated(null); }}><Plus className="h-4 w-4" />Add contractor</Button>} />

      {created && (
        <Card className="p-4 mb-5 border-emerald-500/40 bg-emerald-500/5">
          <div className="flex items-start gap-3">
            <Avatar name={created.name} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="font-medium">{created.name} is ready.{created.circle_wallet_created && <span className="text-zinc-400 font-normal"> A Circle wallet was created for them.</span>}</div>
              <div className="text-sm text-zinc-400">Send this private link. It opens their page with their budget, a request form, and the status of every request. No wallet, no sign-up.</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 break-all">{created.link}</code>
                <Button size="sm" onClick={() => copy(created)}>{copied === created.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === created.id ? "Copied" : "Copy link"}</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={["Who are you paying?", "Set their budget", "Confirm"][step]}>
        <div className="flex gap-1 mb-4">{[0, 1, 2].map((i) => <div key={i} className={`h-1 flex-1 rounded ${i <= step ? "bg-emerald-500" : "bg-zinc-800"}`} />)}</div>
        {step === 0 && (
          <div className="space-y-3">
            {F("name", "Name", undefined, "Jane Doe")}
            {F("contact", "Email or handle", "optional", "jane@studio.com")}
            {F("address", "Their wallet address on Arc", "optional", "0x… — leave blank and STEWARD creates a Circle wallet for them")}
            <div className="flex justify-end pt-2"><Button disabled={!f.name.trim()} onClick={() => setStep(1)}>Next<ArrowRight className="h-4 w-4" /></Button></div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {F("per_tx", "Max per payment (USDC)", "the agent asks you above this", "3", "number")}
              {F("cap_period", "Max per period (USDC)", undefined, "8", "number")}
            </div>
            <Field label="Period" hint="the period cap refills automatically">
              <select className={inputCls} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>{PERIODS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            {F("fund", "Fund now (USDC)", "moves from your wallet into the contract; top up any time", "6", "number")}
            <div className="text-sm text-zinc-300 rounded-md bg-zinc-900 border border-zinc-800 p-3">{summary}</div>
            <div className="flex justify-between pt-2"><Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" />Back</Button><Button disabled={!(+f.per_tx > 0) || !(+f.cap_period > 0)} onClick={() => setStep(2)}>Review<ArrowRight className="h-4 w-4" /></Button></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-md border border-zinc-800 divide-y divide-zinc-800 text-sm">
              {[["Contractor", f.name + (f.contact ? ` · ${f.contact}` : "")], ["Pays to", f.address.trim() || "a new Circle wallet created for them"], ["Per payment", `${(+f.per_tx).toFixed(2)} USDC`],
                ["Per period", `${(+f.cap_period).toFixed(2)} USDC ${PERIODS.find(([, v]) => v === +f.period)?.[0]}`], ["Fund now", `${(+f.fund || 0).toFixed(2)} USDC`]].map(([k, v]) => (
                <div key={k} className="flex gap-4 px-3 py-2"><span className="w-28 shrink-0 text-zinc-500">{k}</span><span className="break-all">{v}</span></div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">Two on-chain transactions from your Circle wallet (create, then fund). About 30 seconds.</p>
            <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" />Back</Button><Button disabled={busy === "add"} onClick={add}>{busy === "add" ? "Creating on-chain…" : "Create budget & link"}</Button></div>
          </div>
        )}
      </Modal>

      {list === null && <div className="grid md:grid-cols-2 gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>}
      {list && list.length === 0 && (
        <EmptyState icon={Users} title="No contractors yet" body="Add one to get a private link you can send them. Their budget goes on-chain the moment you confirm."
          action={<Button disabled={!isOwner} onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add contractor</Button>} />
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {list?.map((c) => (
          <Card key={c.id} className={`p-4 space-y-3 ${c.status === "revoked" ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-3">
              <Avatar name={c.name} />
              <div className="min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-zinc-500 truncate">{c.contact || <a className="underline" href={addr(c.address)} target="_blank">{short(c.address)}</a>}{c.has_circle_wallet && " · Circle wallet"}</div>
              </div>
              <div className="ml-auto"><Pill tone={c.status === "revoked" ? "red" : "emerald"}>{c.status === "revoked" ? "ended" : "active"}</Pill></div>
            </div>
            <div className="text-sm text-zinc-300">Up to <b>{usd(c.policy.per_tx)}</b> per payment · <b>{usd(c.policy.cap_period)}</b> {periodLabel(c.policy.period)}{c.policy.expiry ? ` · until ${when(c.policy.expiry)}` : ""}</div>
            <div>
              <div className="flex justify-between text-xs text-zinc-500 mb-1"><span>spent this period</span><span className="tabular-nums">{usd(c.budget.spent_this_period)} / {usd(c.policy.cap_period)}</span></div>
              <Progress value={c.budget.spent_this_period} max={c.policy.cap_period} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-zinc-500">funded</div><div className="text-base tabular-nums">{usd(c.budget.funded)}</div></div>
              <div><div className="text-zinc-500">open requests</div><div className="text-base tabular-nums">{c.requests.open}</div></div>
              <div><div className="text-zinc-500">paid requests</div><div className="text-base tabular-nums">{c.requests.paid}</div></div>
            </div>
            {c.status !== "revoked" && inline?.id !== c.id && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => copy(c)}>{copied === c.id ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{copied === c.id ? "Copied" : "Copy their link"}</Button>
                <Button size="sm" variant="secondary" disabled={busy === c.id || !isOwner} onClick={() => setInline({ id: c.id, kind: "fund", value: "5" })}><ArrowUpRight className="h-3.5 w-3.5" />Top up</Button>
                <Link href={`/activity?allowance=${c.allowance_id}`} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs px-2.5 py-1.5"><History className="h-3.5 w-3.5" />History</Link>
                <Button size="sm" variant="danger" className="ml-auto" disabled={busy === c.id || !isOwner} onClick={() => setInline({ id: c.id, kind: "revoke", value: "" })}><Ban className="h-3.5 w-3.5" />End budget</Button>
              </div>
            )}
            {inline?.id === c.id && inline.kind === "fund" && (
              <div className="flex items-center gap-2 pt-1">
                <input autoFocus type="number" className={`${inputCls} w-28`} value={inline.value} onChange={(e) => setInline({ ...inline, value: e.target.value })} />
                <span className="text-xs text-zinc-500">USDC from your wallet</span>
                <Button size="sm" disabled={busy === c.id || !(+inline.value > 0)} onClick={() => fund(c, inline.value)}>{busy === c.id ? "Sending…" : "Top up"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setInline(null)}>Cancel</Button>
              </div>
            )}
            {inline?.id === c.id && inline.kind === "revoke" && (
              <div className="rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm space-y-2">
                <div>End {c.name}'s budget? Unspent USDC ({usd(c.budget.funded)}) returns to your wallet and their link stops accepting requests. This cannot be undone.</div>
                <div className="flex gap-2"><Button size="sm" variant="danger" disabled={busy === c.id} onClick={() => revoke(c)}>{busy === c.id ? "Ending…" : "Yes, end it"}</Button><Button size="sm" variant="ghost" onClick={() => setInline(null)}>Keep</Button></div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="mt-6 text-xs text-zinc-600">Advanced: contractors who prefer to sign requests with their own wallet can use <Link className="underline" href="/contractor">/contractor</Link> (MetaMask on Arc Testnet).</div>
    </div>
  );
}
