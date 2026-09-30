import { NextResponse, type NextRequest } from "next/server";

// Optimistic check (cookie present or not); the API verifies the session on every request.
// Owner pages need a session; the landing page, /signin, /demo, /sdk and contractor links (/c/…) do not.
export function proxy(req: NextRequest) {
  if (req.cookies.has("steward_session")) return NextResponse.next();
  const url = new URL("/signin", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/contractors/:path*", "/approvals/:path*", "/activity/:path*", "/treasury/:path*", "/escalations", "/decisions", "/allowances"],
};
