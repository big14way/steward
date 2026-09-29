"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, X, type LucideIcon } from "lucide-react";

// ---------- primitives ----------
export function Button({ variant = "primary", size = "md", className = "", ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; size?: "sm" | "md" | "lg" }) {
  const v = {
    primary: "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700",
    ghost: "text-zinc-300 hover:text-white hover:bg-zinc-800/60",
    danger: "bg-red-900/50 text-red-200 hover:bg-red-900/80 border border-red-900/60",
  }[variant];
  const s = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-4 py-2", lg: "text-base px-5 py-2.5" }[size];
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${v} ${s} ${className}`} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 ${className}`}>{children}</div>;
}

export function Pill({ tone = "zinc", children }: { tone?: "zinc" | "emerald" | "amber" | "orange" | "red" | "sky"; children: ReactNode }) {
  const t = {
    zinc: "text-zinc-300 bg-zinc-500/10 border-zinc-500/30", emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    amber: "text-amber-300 bg-amber-500/10 border-amber-500/30", orange: "text-orange-300 bg-orange-500/10 border-orange-500/30",
    red: "text-red-300 bg-red-500/10 border-red-500/30", sky: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${t}`}>{children}</span>;
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </Card>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div className="shrink-0 rounded-full grid place-items-center font-semibold text-zinc-950" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 60% 65%)` }} aria-hidden>
      {initials}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-zinc-400 mt-1 max-w-2xl">{description}</p>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-zinc-800 grid place-items-center"><Icon className="h-6 w-6 text-zinc-300" /></div>
      <div className="mt-4 font-medium">{title}</div>
      {body && <div className="mt-1 text-sm text-zinc-400 max-w-md mx-auto">{body}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-800/70 ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-300">{label}</span>{hint && <span className="text-zinc-500"> · {hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
export const inputCls = "w-full bg-zinc-900 border border-zinc-700/80 rounded-md px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60";

export function Progress({ value, max, tone = "emerald" }: { value: number; max: number; tone?: "emerald" | "amber" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="h-1.5 rounded bg-zinc-800"><div className={`h-1.5 rounded ${tone === "emerald" ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} /></div>;
}

// ---------- toasts ----------
type Toast = { id: number; kind: "ok" | "err"; text: ReactNode };
const ToastCtx = createContext<{ push: (kind: Toast["kind"], text: ReactNode) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: ReactNode) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "ok" ? 6000 : 9000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-xl bg-zinc-950 ${t.kind === "ok" ? "border-emerald-500/40 text-emerald-100" : "border-red-500/40 text-red-100"}`}>
            {t.kind === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 mt-0.5 text-red-400" />}
            <div className="min-w-0 break-words">{t.text}</div>
            <button onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))} className="ml-auto text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="font-medium">{title}</div>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-300" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
