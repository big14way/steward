"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { setOwnerSecret, JUDGE_SECRET, DEMO_ENABLED } from "@/lib/api";
import { Button, Card } from "../ui";

/** Demo entry: starts a scoped demo session (approve / decline only) and lands on Approvals.
 *  This is the "Open example" / "test mode" pattern: an explicit action, a visible mode pill, no banner. */
export default function Demo() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (DEMO_ENABLED && JUDGE_SECRET) {
      setOwnerSecret(JUDGE_SECRET);
      window.dispatchEvent(new Event("steward:owner"));
      const t = setTimeout(() => router.replace("/approvals"), 900);
      return () => clearTimeout(t);
    }
    setReady(true);
  }, [router]);
  if (!DEMO_ENABLED || !JUDGE_SECRET) {
    return ready ? (
      <Card className="max-w-lg mx-auto p-6 text-sm text-zinc-400">The demo is not enabled on this deployment. Ask the owner for access, or open the <Link className="underline" href="/dashboard">dashboard</Link>.</Card>
    ) : null;
  }
  return (
    <Card className="max-w-lg mx-auto p-8 text-center space-y-3">
      <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/30 grid place-items-center"><FlaskConical className="h-6 w-6 text-amber-300" /></div>
      <div className="font-medium text-lg">Starting your demo session</div>
      <p className="text-sm text-zinc-400">You’ll act as the owner of <b>Acme Studio</b>. Approve or decline real on-chain requests; the agent and the contract do the rest. Nothing to install.</p>
      <Button onClick={() => router.replace("/approvals")}>Go to approvals</Button>
    </Card>
  );
}
