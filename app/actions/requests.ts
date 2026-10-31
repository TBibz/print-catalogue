"use server";

// Saving and deleting request lines. These run on the server as the
// logged-in user, so RLS decides what is allowed.
import { createClient } from "@/lib/supabase/server";
import { addPrinting } from "@/lib/data";
import {
  isUrgency,
  REQUEST_LINE_COLUMNS,
  type RequestLine,
  type RequestLineRow,
  type Urgency,
} from "@/lib/requests";

export type SaveLineInput = {
  id: string | null; // null = a new line
  modelId: string;
  scale: string | null;
  colourMaterialId: string | null; // null = any colour
  quantity: number;
  urgency: Urgency | null;
  note: string;
};

export type SaveResult =
  | { ok: true; line: RequestLine }
  | { ok: false; error: string };

export type DeleteResult = { ok: true } | { ok: false; error: string };

const MAX_QUANTITY = 9999;
const MAX_NOTE = 1000;

export async function saveRequestLine(input: SaveLineInput): Promise<SaveResult> {
  // Never trust what the browser sends: check everything again here.
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, error: "Quantity must be a whole number from 1 to 9999." };
  }
  if (input.urgency !== null && !isUrgency(input.urgency)) {
    return { ok: false, error: "Unknown urgency." };
  }
  const note = String(input.note ?? "").trim();
  if (note.length > MAX_NOTE) {
    return { ok: false, error: `Notes can be at most ${MAX_NOTE} characters.` };
  }
  const scale = input.scale?.trim() || null;

  const supabase = await createClient();
  const values = {
    model_id: input.modelId,
    scale,
    // The database checks the colour is offered and in stock, and that the
    // model's category has colour options (0010_colours.sql).
    colour_material_id: input.colourMaterialId || null,
    quantity,
    urgency: input.urgency,
    note,
  };

  // The database refuses a quantity below what is printing (see the
  // request_lines_printing_guard trigger in 0008_print_jobs.sql), and its
  // message is passed on by friendlyError().

  let row: RequestLineRow | null = null;

  if (input.id) {
    const { data, error } = await supabase
      .from("request_lines")
      .update(values)
      .eq("id", input.id)
      .select(REQUEST_LINE_COLUMNS)
      .maybeSingle<RequestLineRow>();
    if (error) return { ok: false, error: friendlyError(error) };
    row = data; // null if someone else deleted it in the meantime
  }

  if (!row) {
    const { data, error } = await supabase
      .from("request_lines")
      .insert(values)
      .select(REQUEST_LINE_COLUMNS)
      .single<RequestLineRow>();
    if (error) return { ok: false, error: friendlyError(error) };
    row = data;
  }

  const [line] = await addPrinting(supabase, [row]);
  return { ok: true, line };
}

export async function deleteRequestLine(id: string): Promise<DeleteResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("request_lines").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

function friendlyError(error: { code?: string; message: string }) {
  console.error("request_lines:", error.message);
  // A message raised on purpose by the database, e.g. "2 of these are
  // being printed, so the quantity can't go below 2."
  if (error.code === "P0001") return error.message;
  if (error.code === "23505") {
    return "There's already a request for this model in that size and colour.";
  }
  if (error.code === "42501") {
    return "You don't have permission to do that. Try logging in again.";
  }
  return "Couldn't save. Please check your connection and try again.";
}
