"use client";
import { useEffect, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { getOwnerSecret, setOwnerSecret, JUDGE_SECRET } from "@/lib/api";
import { Button, Modal, inputCls } from "./ui";

/** One-time owner sign-in for this browser. The secret is only ever sent to the API with owner actions. */
export default function OwnerChip() {
  const [secret, setSecret] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setSecret(getOwnerSecret()); }, []);
  const save = (v: string) => { setOwnerSecret(v.trim()); setSecret(v.trim()); setDraft(""); setOpen(false); window.dispatchEvent(new Event("steward:owner")); };
  const clear = () => save("");
  return (
    <div className="ml-auto pl-2 shrink-0">
      {secret ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="border border-emerald-500/40 text-emerald-200"><KeyRound className="h-3.5 w-3.5" />Owner</Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><KeyRound className="h-3.5 w-3.5" />Sign in</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={secret ? "Owner session" : "Owner sign-in"}>
        {secret ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">This browser can add contractors, top up budgets, move reserve funds, and approve requests. The secret stays on this device.</p>
            <Button variant="secondary" onClick={clear}><LogOut className="h-4 w-4" />Sign out</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Paste the owner secret (the API's <code>API_SECRET</code>). It is stored in this browser only and sent with owner actions.</p>
            <input autoFocus className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && draft.trim() && save(draft)} placeholder="owner secret" type="password" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(draft)} disabled={!draft.trim()}>Sign in</Button>
              {JUDGE_SECRET && <Button variant="secondary" onClick={() => save(JUDGE_SECRET)}>Continue as judge (approvals only)</Button>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function useOwnerSecret() {
  const [secret, setSecret] = useState("");
  useEffect(() => {
    const read = () => setSecret(getOwnerSecret());
    read();
    window.addEventListener("steward:owner", read);
    return () => window.removeEventListener("steward:owner", read);
  }, []);
  return secret;
}
