"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { PUBLIC_API, DEMO_ENABLED } from "@/lib/api";
import { useSession } from "../session";
import { Card } from "../ui";

/** "Try the live demo": opens a demo session (view, approve, decline) on Acme Studio's testnet workspace, then Approvals. */
export default function Demo() {
  const router = useRouter();
  const { refresh } = useSession();
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!DEMO_ENABLED) return;
    fetch(`${PUBLIC_API}/auth/demo`, { method: "POST", credentials: "include" })
      .then(async (r) => { if (!r.ok) throw new Error(); await refresh(); router.replace("/approvals"); })
      .catch(() => setErr("The demo could not start. Try again in a moment."));
  }, [refresh, router]);
  return (
    <Card className="max-w-lg mx-auto p-8 text-center space-y-3">
      <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/30 grid place-items-center"><FlaskConical className="h-6 w-6 text-amber-300" /></div>
      {!DEMO_ENABLED
        ? <p className="text-sm text-zinc-400">The demo is not enabled on this deployment. <Link className="underline" href="/signin">Sign in</Link> instead.</p>
        : err ? <p className="text-sm text-red-300">{err}</p>
        : <>
            <div className="font-medium text-lg">Opening the demo…</div>
            <p className="text-sm text-zinc-400">You’ll explore Acme Studio’s workspace on Arc Testnet. Approve or decline real requests; the agent and the contract do the rest.</p>
          </>}
    </Card>
  );
}
