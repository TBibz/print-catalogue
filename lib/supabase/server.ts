import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Supabase client for Server Components, Server Actions and Route Handlers.
// It reads the logged-in user's session from cookies, so every query runs
// as that user and Row Level Security applies.
export async function createClient() {
  // Wait for a real request before going further. Supabase checks the
  // clock (Date.now()) to see if the login has expired, which Next.js
  // doesn't allow while it pre-builds the static parts of a page.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies. That's fine: proxy.ts
            // refreshes the session cookie on every request anyway.
          }
        },
      },
    },
  );
}
