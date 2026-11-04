"use server";

// Saving notepad lines. RLS and the guard trigger in 0003_notepad.sql
// decide who may change what; these just pass the request on.
import { createClient } from "@/lib/supabase/server";
import { MAX_NOTE_LINE, NOTE_LINE_COLUMNS, type NoteLine } from "@/lib/notepad";

export type NoteResult = { ok: true; line: NoteLine } | { ok: false; error: string };
export type NoteDeleteResult = { ok: true } | { ok: false; error: string };

export async function saveNotepadLine(input: {
  id: string | null; // null = a new line
  text: string;
  position: number;
}): Promise<NoteResult> {
  const text = String(input.text ?? "").trim();
  if (!text) return { ok: false, error: "A line can't be empty." };
  if (text.length > MAX_NOTE_LINE) {
    return { ok: false, error: `Lines can be at most ${MAX_NOTE_LINE} characters.` };
  }
  const position = Number(input.position);
  if (!Number.isFinite(position)) return { ok: false, error: "Invalid position." };

  const supabase = await createClient();

  if (input.id) {
    const { data, error } = await supabase
      .from("notepad_lines")
      .update({ text })
      .eq("id", input.id)
      .select(NOTE_LINE_COLUMNS)
      .maybeSingle<NoteLine>();
    if (error) return { ok: false, error: friendlyError(error) };
    // No row back means it was deleted, or it isn't yours to change.
    if (!data) return { ok: false, error: "This line can't be changed any more. Refresh the page." };
    return { ok: true, line: data };
  }

  const { data, error } = await supabase
    .from("notepad_lines")
    .insert({ text, position })
    .select(NOTE_LINE_COLUMNS)
    .single<NoteLine>();
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, line: data };
}

export async function setNotepadLineDone(id: string, done: boolean): Promise<NoteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notepad_lines")
    .update({ done: Boolean(done) })
    .eq("id", id)
    .select(NOTE_LINE_COLUMNS)
    .maybeSingle<NoteLine>();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "This line no longer exists. Refresh the page." };
  return { ok: true, line: data };
}

export async function deleteNotepadLine(id: string): Promise<NoteDeleteResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("notepad_lines").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

// Undo a delete: puts the line back exactly as it was (same id, author,
// position and tick). restore_notepad_line() in 0022 checks who may.
export async function restoreNotepadLine(line: NoteLine): Promise<NoteResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_notepad_line", {
    p_id: line.id,
    p_text: line.text,
    p_position: line.position,
    p_created_by: line.created_by,
    p_created_at: line.created_at,
    p_done: line.done,
    p_done_at: line.done_at,
  });
  if (error) {
    console.error("restore_notepad_line:", error.message);
    return { ok: false, error: error.code === "42501" ? "You can only restore your own lines." : "Couldn't undo. Please try again." };
  }
  return { ok: true, line };
}

function friendlyError(error: { code?: string; message: string }) {
  console.error("notepad_lines:", error.message);
  if (error.message.includes("Only the admin")) return "Only the admin can tick lines.";
  if (error.code === "42501") return "You can only change your own lines.";
  return "Couldn't save. Please check your connection and try again.";
}
