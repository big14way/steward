"use client";
import { useEffect, useState } from "react";
import { KeyRound, LogOut, FlaskConical } from "lucide-react";
import { getOwnerSecret, setOwnerSecret, isDemoSecret, JUDGE_SECRET, DEMO_ENABLED } from "@/lib/api";
import { Button, Modal, inputCls } from "./ui";

/** One-time owner sign-in for this browser. The secret is only ever sent to the API with owner actions.
 *  A demo session uses the scoped demo secret (approve / decline only) and is shown as such. */
export default function OwnerChip() {
  const [secret, setSecret] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setSecret(getOwnerSecret()); }, []);
  const save = (v: string) => { setOwnerSecret(v.trim()); setSecret(v.trim()); setDraft(""); setOpen(false); window.dispatchEvent(new Event("steward:owner")); };
  const clear = () => save("");
  const demo = isDemoSecret(secret);
  return (
    <div className={`${demo ? "" : "ml-auto "}pl-2 shrink-0`}>
      {secret ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className={`border ${demo ? "border-amber-500/40 text-amber-200" : "border-emerald-500/40 text-emerald-200"}`}>
          {demo ? <FlaskConical className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}{demo ? "Demo" : "Owner"}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><KeyRound className="h-3.5 w-3.5" />Sign in</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={secret ? (demo ? "Demo session" : "Owner session") : "Owner sign-in"}>
        {secret ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              {demo
                ? "You are exploring as the owner of Acme Studio. You can approve and decline requests; creating or funding budgets needs the real owner secret."
                : "This browser can add contractors, top up budgets, move reserve funds, and approve requests. The secret stays on this device."}
            </p>
            <Button variant="secondary" onClick={clear}><LogOut className="h-4 w-4" />{demo ? "Exit demo" : "Sign out"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Paste the owner secret (the API's <code>API_SECRET</code>). It is stored in this browser only and sent with owner actions.</p>
            <input autoFocus className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && draft.trim() && save(draft)} placeholder="owner secret" type="password" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(draft)} disabled={!draft.trim()}>Sign in</Button>
              {DEMO_ENABLED && JUDGE_SECRET && <Button variant="secondary" onClick={() => save(JUDGE_SECRET)}><FlaskConical className="h-4 w-4" />Explore the demo instead</Button>}
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
