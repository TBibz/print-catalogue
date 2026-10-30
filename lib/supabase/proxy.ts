import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can open without logging in.
const PUBLIC_PATHS = ["/login"];

// Runs before every page request (called from proxy.ts in the project root).
// 1. Refreshes the Supabase session cookie if it is about to expire.
// 2. Sends logged-out visitors to /login, and logged-in visitors away from it.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Copy refreshed cookies onto both the request (for this render)
          // and the response (so the browser keeps them).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() verifies the session token. Don't put other code between
  // creating the client and this call, or sessions can randomly log out.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);

  if (!isLoggedIn && !isPublic) {
    return redirectKeepingCookies(request, response, "/login");
  }
  if (isLoggedIn && path === "/login") {
    return redirectKeepingCookies(request, response, "/catalogue");
  }

  // Admin pages: requesters are sent back to the catalogue.
  // (Each admin page checks again, and RLS protects the data itself.)
  if (path === "/admin" || path.startsWith("/admin/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data!.claims.sub)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return redirectKeepingCookies(request, response, "/catalogue");
    }
  }

  return response;
}

// A redirect that still carries any refreshed session cookies.
function redirectKeepingCookies(
  request: NextRequest,
  from: NextResponse,
  to: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
