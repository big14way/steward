// Server-side reads for owner pages: forward the visitor's session cookie to the API, send them to sign in on 401.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API = (process.env.API_INTERNAL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

export async function serverGet<T>(path: string, back: string): Promise<T> {
  const session = (await cookies()).get("steward_session")?.value;
  const r = await fetch(`${API}${path}`, { cache: "no-store", headers: session ? { cookie: `steward_session=${session}` } : {} });
  if (r.status === 401) redirect(`/signin?next=${encodeURIComponent(back)}&expired=1`);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}
