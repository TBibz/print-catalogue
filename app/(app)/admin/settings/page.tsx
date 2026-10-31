import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

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
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .returns<{ key: string; value: string }[]>();

  if (error) {
    console.error("Loading settings failed:", error.message);
    return (
      <p role="alert" className="text-red-700">
        Sorry, the settings couldn’t be loaded. Please refresh the page.
      </p>
    );
  }
  return <SettingsForm values={Object.fromEntries(data.map((s) => [s.key, s.value]))} />;
}
