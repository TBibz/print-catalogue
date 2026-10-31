// Types shared by the notepad page and its server actions.

export type NoteLine = {
  id: string;
  text: string;
  created_by: string;
  created_at: string;
  done: boolean;
  done_at: string | null;
  position: number;
};

export const NOTE_LINE_COLUMNS = "id, text, created_by, created_at, done, done_at, position";

export const MAX_NOTE_LINE = 500;
