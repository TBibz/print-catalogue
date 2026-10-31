"use client";

// Bulk image upload: match files to models by code, check, then upload.
import { useEffect, useMemo, useRef, useState } from "react";
import { naturalCollator } from "@/lib/catalogue";
import { codeKeyFromFileName } from "@/lib/images";
import { uploadModelImage } from "@/lib/upload-image";

export type UploadModel = {
  id: string;
  code: string;
  code_key: string;
  name: string;
  image_path: string | null;
};

type Result =
  | { kind: "waiting" }
  | { kind: "uploading" }
  | { kind: "done" }
  | { kind: "failed"; error: string };

type Entry = {
  id: number;
  file: File;
  key: string; // code key from the file name
  replace: boolean; // ticked to replace an existing image
  result: Result;
};

const PARALLEL_UPLOADS = 4;

let nextId = 1;

export function BulkUpload({ models: serverModels }: { models: UploadModel[] }) {
  const [models, setModels] = useState(serverModels);
  const [entries, setEntries] = useState<Entry[]>([]);
  // For codes with more than one file: which entry was picked.
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Next.js keeps this page alive between visits; take fresh models then.
  const [synced, setSynced] = useState(serverModels);
  if (serverModels !== synced) {
    setSynced(serverModels);
    setModels(serverModels);
  }

  const modelsByKey = useMemo(() => new Map(models.map((m) => [m.code_key, m])), [models]);

  // Group the files by code key to spot duplicates.
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) map.set(e.key, [...(map.get(e.key) ?? []), e]);
    return map;
  }, [entries]);

  // Works out what will happen to each file.
  function plan(e: Entry) {
    const model = modelsByKey.get(e.key);
    if (!e.file.type.startsWith("image/")) return { model, action: "not-image" as const };
    if (!model) return { model, action: "no-match" as const };
    const group = groups.get(e.key) ?? [];
    if (group.length > 1) {
      const choice = picked[e.key];
      if (choice === undefined) return { model, action: "pick" as const };
      if (choice !== e.id) return { model, action: "not-picked" as const };
    }
    if (model.image_path && !e.replace && e.result.kind !== "done") {
      return { model, action: "has-image" as const };
    }
    return { model, action: "upload" as const };
  }

  const rows = entries
    .map((e) => ({ entry: e, ...plan(e) }))
    .sort(
      (a, b) =>
        naturalCollator.compare(a.model?.code ?? a.entry.key, b.model?.code ?? b.entry.key) ||
        a.entry.id - b.entry.id,
    );

  const toUpload = rows.filter((r) => r.action === "upload" && r.entry.result.kind !== "done");
  const count = (action: string) => rows.filter((r) => r.action === action).length;
  const doneCount = entries.filter((e) => e.result.kind === "done").length;
  const failedCount = entries.filter((e) => e.result.kind === "failed").length;
  const replaceable = rows.filter((r) => r.action === "has-image");

  // Warn before leaving the page in the middle of an upload.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map((file) => ({
      id: nextId++,
      file,
      key: codeKeyFromFileName(file.name),
      replace: false,
      result: { kind: "waiting" } as Result,
    }));
    setEntries((prev) => [...prev, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function update(id: number, change: Partial<Entry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...change } : e)));
  }

  async function startUpload() {
    const queue = [...toUpload];
    if (queue.length === 0) return;
    setUploading(true);

    // A few uploads at once: quicker, without overloading the connection.
    async function worker() {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { entry, model } = next;
        if (!model) continue;
        update(entry.id, { result: { kind: "uploading" } });
        const result = await uploadModelImage(model.id, entry.file);
        if (result.ok) {
          update(entry.id, { result: { kind: "done" } });
          setModels((prev) =>
            prev.map((m) => (m.id === model.id ? { ...m, image_path: result.path } : m)),
          );
        } else {
          update(entry.id, { result: { kind: "failed", error: result.error } });
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
    setUploading(false);
  }

  return (
    <div>
      {/* ---- Choose files ------------------------------------------------ */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) addFiles(e.dataTransfer.files);
        }}
        className={`mb-6 rounded-lg border-2 border-dashed p-8 text-center ${
          dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
        }`}
      >
        <p className="mb-3 text-neutral-600">Drag image files here, or</p>
        <label
          className={`inline-block cursor-pointer rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white hover:bg-neutral-700 ${
            uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Choose files…
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>
      </div>

      {entries.length > 0 && (
        <>
          {/* ---- Summary and actions ------------------------------------- */}
          <div className="mb-4 space-y-3 rounded-lg border border-neutral-200 p-4">
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <li>
                <strong>{entries.length}</strong> files
              </li>
              <li className="text-green-800">
                <strong>{toUpload.length}</strong> ready to upload
              </li>
              {replaceable.length > 0 && (
                <li className="text-amber-800">
                  <strong>{replaceable.length}</strong> already have an image (tick to replace)
                </li>
              )}
              {count("pick") > 0 && (
                <li className="text-amber-800">
                  <strong>{count("pick")}</strong> duplicates to choose between
                </li>
              )}
              {count("no-match") > 0 && (
                <li className="text-red-700">
                  <strong>{count("no-match")}</strong> with no matching model (skipped)
                </li>
              )}
              {count("not-image") > 0 && (
                <li className="text-red-700">
                  <strong>{count("not-image")}</strong> not images (skipped)
                </li>
              )}
              {doneCount > 0 && (
                <li className="text-green-800">
                  <strong>{doneCount}</strong> uploaded ✓
                </li>
              )}
              {failedCount > 0 && (
                <li className="text-red-700">
                  <strong>{failedCount}</strong> failed
                </li>
              )}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startUpload()}
                disabled={uploading || toUpload.length === 0}
                className="rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
              >
                {uploading
                  ? `Uploading… ${doneCount} done`
                  : failedCount > 0 && toUpload.length === failedCount
                    ? `Retry ${failedCount} failed`
                    : `Upload ${toUpload.length} ${toUpload.length === 1 ? "image" : "images"}`}
              </button>
              {replaceable.length > 1 && !uploading && (
                <button
                  type="button"
                  onClick={() =>
                    setEntries((prev) =>
                      prev.map((e) =>
                        replaceable.some((r) => r.entry.id === e.id) ? { ...e, replace: true } : e,
                      ),
                    )
                  }
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100"
                >
                  Tick all {replaceable.length} replacements
                </button>
              )}
              {!uploading && (
                <button
                  type="button"
                  onClick={() => {
                    setEntries([]);
                    setPicked({});
                  }}
                  className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  Clear list
                </button>
              )}
            </div>
          </div>

          {/* ---- One row per file ---------------------------------------- */}
          <ul className="border-t border-neutral-200">
            {rows.map(({ entry, model, action }) => (
              <li
                key={entry.id}
                className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-neutral-100 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,18rem)] sm:items-center"
              >
                <span className="truncate font-mono" title={entry.file.name}>
                  {entry.file.name}
                </span>
                <span className="min-w-0 truncate">
                  {model ? (
                    <>
                      <span className="font-mono">{model.code}</span> · {model.name}
                    </>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </span>
                <span>
                  <RowStatus
                    entry={entry}
                    action={action}
                    duplicate={(groups.get(entry.key)?.length ?? 0) > 1 && Boolean(model)}
                    chosen={picked[entry.key] === entry.id}
                    hasImage={Boolean(model?.image_path)}
                    disabled={uploading}
                    onPick={() => setPicked((p) => ({ ...p, [entry.key]: entry.id }))}
                    onReplace={(replace) => update(entry.id, { replace })}
                  />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RowStatus({
  entry,
  action,
  duplicate,
  chosen,
  hasImage,
  disabled,
  onPick,
  onReplace,
}: {
  entry: Entry;
  action: string;
  duplicate: boolean; // another file has the same code
  chosen: boolean; // this is the one picked out of the duplicates
  hasImage: boolean;
  disabled: boolean;
  onPick: () => void;
  onReplace: (replace: boolean) => void;
}) {
  // Upload progress takes priority once it has started.
  switch (entry.result.kind) {
    case "uploading":
      return <span className="text-neutral-500">Uploading…</span>;
    case "done":
      return <span className="text-green-700">Uploaded ✓</span>;
    case "failed":
      return <span className="text-red-700">{entry.result.error}</span>;
  }

  if (action === "not-image") {
    return <span className="text-red-700">Not an image — skipped</span>;
  }
  if (action === "no-match") {
    return <span className="text-red-700">No model with this code — skipped</span>;
  }

  const replaceBox = (
    <label className="flex cursor-pointer items-center gap-2 text-amber-800">
      <input
        type="checkbox"
        checked={entry.replace}
        disabled={disabled}
        onChange={(e) => onReplace(e.target.checked)}
        className="h-4 w-4 accent-neutral-900"
      />
      Replace existing image
    </label>
  );

  // Several files for one code: pick one (it can be changed until upload).
  if (duplicate) {
    return (
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex cursor-pointer items-center gap-2 text-amber-800">
          <input
            type="radio"
            name={`pick-${entry.key}`}
            checked={chosen}
            disabled={disabled}
            onChange={onPick}
            className="h-4 w-4 accent-neutral-900"
          />
          {chosen ? "Using this one" : action === "pick" ? "Duplicate code — choose one" : "Duplicate — not used"}
        </label>
        {chosen && hasImage && replaceBox}
      </span>
    );
  }

  switch (action) {
    case "has-image":
    case "upload":
      return hasImage ? replaceBox : <span className="text-green-700">Ready</span>;
    default:
      return null;
  }
}
