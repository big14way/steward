"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PUBLIC_API, type Me } from "@/lib/api";

const OWNER_PAGES = ["/dashboard", "/contractors", "/approvals", "/activity", "/treasury"];
type Session = { me: Me | null; loading: boolean; refresh: () => Promise<Me | null>; signOut: () => Promise<void> };
const Ctx = createContext<Session>({ me: null, loading: true, refresh: async () => null, signOut: async () => {} });

/** Who is signed in (owner or demo), read from the API with the HttpOnly session cookie. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const path = usePathname() ?? "/";
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${PUBLIC_API}/auth/me`, { cache: "no-store", credentials: "include" });
      const m = r.ok ? ((await r.json()) as Me) : null;
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // A stale cookie gets past the route guard; send the visitor to sign in instead of showing empty pages.
  useEffect(() => {
    if (!loading && !me && OWNER_PAGES.some((p) => path === p || path.startsWith(p + "/"))) {
      router.replace(`/signin?next=${encodeURIComponent(path)}&expired=1`);
    }
  }, [loading, me, path, router]);

  const signOut = useCallback(async () => {
    await fetch(`${PUBLIC_API}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setMe(null);
    window.location.href = "/signin";
  }, []);

  return <Ctx.Provider value={{ me, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
