import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { NoteLine } from "@/lib/notepad";
import { loadNoteLines } from "@/lib/data";
import { NotepadView } from "./notepad-view";

export const metadata: Metadata = { title: "Notepad · Print Catalogue" };

export default function NotepadPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Notepad</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading notepad…</p>}>
        <NotepadData />
      </Suspense>
    </>
  );
}

async function NotepadData() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  let data: NoteLine[] | null = null;
  try {
    data = await loadNoteLines(supabase);
  } catch (error) {
    console.error("Loading the notepad failed:", error);
  }

  if (!profile || !data) {
    return (
      <p role="alert" className="text-red-700">
        Sorry, the notepad couldn’t be loaded. Please refresh the page.
      </p>
    );
  }

  return (
    <NotepadView
      lines={data}
      userId={profile.id}
      isAdmin={profile.role === "admin"}
    />
  );
}
