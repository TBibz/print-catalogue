"use client";

import { createBrowserClient } from "@supabase/ssr";

// Supabase client for the browser, used only for uploading image files
// straight to Storage (so big files don't pass through our server).
// It uses the same login cookies, so Storage policies still apply.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
