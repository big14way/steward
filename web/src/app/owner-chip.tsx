"use client";
import { useEffect, useState } from "react";
import { getOwnerSecret, setOwnerSecret } from "@/lib/api";

/** One-time owner sign-in for this browser. The secret is only ever sent to the API with owner actions. */
export default function OwnerChip() {
  const [secret, setSecret] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setSecret(getOwnerSecret()); }, []);
  const save = () => { setOwnerSecret(draft.trim()); setSecret(draft.trim()); setDraft(""); setOpen(false); window.dispatchEvent(new Event("steward:owner")); };
  const clear = () => { setOwnerSecret(""); setSecret(""); setOpen(false); window.dispatchEvent(new Event("steward:owner")); };
  return (
    <div className="relative ml-auto">
      {secret ? (
        <button onClick={() => setOpen(!open)} className="text-xs rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 px-3 py-1">Owner · signed in</button>
      ) : (
        <button onClick={() => setOpen(!open)} className="text-xs rounded-full border border-zinc-700 text-zinc-300 px-3 py-1 hover:border-zinc-500">Owner sign-in</button>
      )}
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-xl z-20 space-y-2">
          {secret ? (
            <>
              <div className="text-xs text-zinc-400">This browser can add contractors, top up budgets, and approve requests.</div>
              <button onClick={clear} className="text-xs rounded bg-zinc-800 px-3 py-1">Sign out</button>
            </>
          ) : (
            <>
              <div className="text-xs text-zinc-400">Paste the owner secret (from the API's <code>API_SECRET</code>). Judges: the banner secret works for approvals only.</div>
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="owner secret"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm" />
              <button onClick={save} disabled={!draft.trim()} className="text-xs rounded bg-zinc-100 text-zinc-900 disabled:opacity-50 px-3 py-1">Sign in</button>
            </>
          )}
        </div>
      )}
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
