import { Suspense } from "react";
import { loadTheme } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME, themeCss } from "@/lib/theme";

// Sets the app's colour variables (lib/theme.ts) from Settings → Colours.
// The defaults apply straight away; the saved colours replace them as soon
// as they've loaded (reading them needs the login cookie, so it streams in).
export function ThemeStyle() {
  return (
    <Suspense fallback={<style>{themeCss(DEFAULT_THEME)}</style>}>
      <SavedTheme />
    </Suspense>
  );
}

async function SavedTheme() {
  const supabase = await createClient();
  const theme = await loadTheme(supabase);
  return <style>{themeCss(theme)}</style>;
}
