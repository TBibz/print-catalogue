import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "requester";

export type Profile = {
  id: string;
  display_name: string | null;
  role: Role;
};

// The logged-in user's profile, or null if not logged in.
// cache() means it is only looked up once per page request, however many
// components ask for it.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .maybeSingle<Profile>();
  return data;
});
