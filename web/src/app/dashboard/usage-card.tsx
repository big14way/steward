"use client";
import { useCallback, useEffect, useState } from "react";
import { EyeOff, Lock, UserRound } from "lucide-react";
import { get, post } from "@/lib/api";
import { Button, Card } from "../ui";

type Usage = {
  since: number;
  people_tried: number;
  by_kind: { kind: string; label: string; count: number }[];
  businesses_signed_up: number;
  businesses_active_7d: number;
  daily: ({ day: string } & Record<string, number | string>)[];
  this_browser_ignored: boolean;
};

/** Private to the operator: how many people tried STEWARD. The API refuses everyone else, so this renders nothing for them. */
export default function UsageCard() {
  const [u, setU] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get<Usage>("/stats/usage").then(setU).catch(() => setU(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!u) return null;

  const ignore = async () => {
    setBusy(true);
    await post("/stats/usage/ignore-me", {});
    setBusy(false);
    load();
  };
  const since = new Date(u.since * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const days = u.daily.slice(-7);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="h-4 w-4 text-emerald-400" /><span className="font-medium">People who tried STEWARD</span>
        <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Lock className="h-3 w-3" />only you can see this</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div><div className="text-xs text-zinc-500">people in total</div><div className="text-2xl font-semibold tabular-nums">{u.people_tried}</div></div>
        {u.by_kind.map((k) => (
          <div key={k.kind}><div className="text-xs text-zinc-500">{k.label.toLowerCase()}</div><div className="text-2xl font-semibold tabular-nums">{k.count}</div></div>
        ))}
        <div><div className="text-xs text-zinc-500">businesses active this week</div><div className="text-2xl font-semibold tabular-nums">{u.businesses_active_7d}<span className="text-sm text-zinc-500 font-normal"> / {u.businesses_signed_up}</span></div></div>
      </div>
      {days.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-zinc-500 text-left"><th className="py-1 pr-3 font-normal">day</th>{u.by_kind.map((k) => <th key={k.kind} className="py-1 pr-3 font-normal">{k.label.toLowerCase()}</th>)}</tr></thead>
            <tbody>{days.map((d) => (
              <tr key={d.day} className="border-t border-zinc-800/70"><td className="py-1 pr-3 text-zinc-400">{d.day}</td>{u.by_kind.map((k) => <td key={k.kind} className="py-1 pr-3">{d[k.kind] ?? 0}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span>Counted since {since}. Each browser counts once per action, with a random ID and no names, emails or IP addresses. Bots and test scripts are skipped.</span>
        {u.this_browser_ignored
          ? <span className="inline-flex items-center gap-1 text-zinc-400"><EyeOff className="h-3.5 w-3.5" />This browser isn&apos;t counted.</span>
          : <Button variant="secondary" size="sm" disabled={busy} onClick={ignore}><EyeOff className="h-3.5 w-3.5" />{busy ? "Saving…" : "Don't count this browser"}</Button>}
      </div>
    </Card>
  );
}
