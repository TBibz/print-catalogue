import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/data";
import { emailServerSummary } from "@/lib/email";
import { ColourSettings } from "./colour-settings";
import { SettingsForm } from "./settings-form";
import { TestEmail } from "./test-email";

export const metadata: Metadata = { title: "Settings · Print Catalogue" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading settings…</p>}>
        <SettingsData />
      </Suspense>
    </>
  );
}

async function SettingsData() {
  await requireAdmin();
  const supabase = await createClient();
  let settings;
  try {
    settings = await loadSettings(supabase);
  } catch (error) {
    console.error("Loading settings failed:", error);
    return (
      <p role="alert" className="text-red-700">
        Sorry, the settings couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  const values = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return (
    <>
      <SettingsForm values={values} />
      <TestEmail server={emailServerSummary()} />
      <ColourSettings values={values} />
    </>
  );
}
