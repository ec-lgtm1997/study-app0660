import { supabase } from "@/integrations/supabase/client";
import type { Json } from "./models";

/**
 * Importformat (wie von Claude erzeugt):
 * {
 *   "subject": "Pharmakologie 2",
 *   "topics": ["Thema A", ...],          // optional, bestimmt die Reihenfolge
 *   "topic": "Thema",                    // optional, Standard-Thema für alle Fragen
 *   "questions": [{ id, topic?, type, content, solution, meta? }]
 * }
 */
export interface ImportQuestion {
  id: string;
  topic?: string;
  type: string;
  content: Json;
  solution: Json;
  meta?: Json;
}

export interface ImportFile {
  subject: string;
  description?: string;
  topics?: string[];
  topic?: string;
  questions: ImportQuestion[];
}

export interface ImportPreview {
  subject: string;
  topicNames: string[];
  questionCount: number;
}

export interface ImportResult {
  subjectCreated: boolean;
  topicsCreated: number;
  inserted: number;
  skipped: number;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

interface RawFile {
  subject?: unknown;
  topic?: unknown;
  questions?: unknown;
}

interface RawQuestion {
  id?: unknown;
  topic?: unknown;
  type?: unknown;
  content?: unknown;
  solution?: unknown;
}

/** Prüft die Datei und wirft verständliche Fehler. */
export function parseImportFile(raw: string): ImportFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.");
  }
  if (!isObject(data)) throw new Error("Oberste Ebene muss ein JSON-Objekt sein.");
  const f = data as RawFile;
  if (typeof f.subject !== "string" || !f.subject.trim())
    throw new Error("Feld „subject“ (Fachname) fehlt.");
  if (!Array.isArray(f.questions) || f.questions.length === 0)
    throw new Error("Feld „questions“ fehlt oder ist leer.");

  const hasFallbackTopic = typeof f.topic === "string";
  (f.questions as unknown[]).forEach((item, i) => {
    const where = `Frage ${i + 1}`;
    if (!isObject(item)) throw new Error(`${where}: kein Objekt.`);
    const q = item as RawQuestion;
    if (typeof q.id !== "string") throw new Error(`${where}: „id“ fehlt.`);
    if (typeof q.type !== "string") throw new Error(`${q.id}: „type“ fehlt.`);
    if (!isObject(q.content) || !isObject(q.solution))
      throw new Error(`${q.id}: „content“ oder „solution“ ist kein Objekt.`);
    if (typeof q.topic !== "string" && !hasFallbackTopic)
      throw new Error(`${q.id}: kein Thema angegeben.`);
  });
  return data as unknown as ImportFile;
}

export function previewImport(file: ImportFile): ImportPreview {
  return {
    subject: file.subject.trim(),
    topicNames: orderedTopics(file),
    questionCount: file.questions.length,
  };
}

function topicOf(file: ImportFile, q: ImportQuestion): string {
  return (q.topic ?? file.topic ?? "").trim();
}

function orderedTopics(file: ImportFile): string[] {
  const names: string[] = [];
  const add = (n: string) => {
    const t = n.trim();
    if (t && !names.includes(t)) names.push(t);
  };
  (file.topics ?? []).forEach(add);
  file.questions.forEach((q) => add(topicOf(file, q)));
  return names;
}

/**
 * Legt Fach und Themen an (falls nicht vorhanden) und fügt die Fragen ein.
 * Mehrfaches Importieren derselben Datei ist sicher: Fragen werden über ihre
 * ursprüngliche ID (content.meta.source_id) erkannt und übersprungen.
 */
export async function runImport(
  file: ImportFile,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const subjectName = file.subject.trim();

  // 1) Fach finden oder anlegen
  const existing = await supabase.from("subjects").select("id").eq("name", subjectName).limit(1);
  if (existing.error) throw new Error(existing.error.message);
  let subjectId = existing.data?.[0]?.id as string | undefined;
  const subjectCreated = !subjectId;
  if (!subjectId) {
    const created = await supabase
      .from("subjects")
      .insert({ name: subjectName, description: file.description ?? null } as never)
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    subjectId = (created.data as { id: string }).id;
  }

  // 2) Themen finden oder anlegen (Reihenfolge = position)
  const topicRows = await supabase.from("topics").select("id, name").eq("subject_id", subjectId);
  if (topicRows.error) throw new Error(topicRows.error.message);
  const topicIds = new Map<string, string>(
    (topicRows.data ?? []).map((t) => [t.name as string, t.id as string]),
  );
  const missing = orderedTopics(file).filter((n) => !topicIds.has(n));
  if (missing.length) {
    const offset = topicIds.size;
    const created = await supabase
      .from("topics")
      .insert(
        missing.map((name, i) => ({ subject_id: subjectId, name, position: offset + i })) as never,
      )
      .select("id, name");
    if (created.error) throw new Error(created.error.message);
    for (const t of (created.data ?? []) as { id: string; name: string }[])
      topicIds.set(t.name, t.id);
  }

  // 3) Bereits importierte Fragen erkennen
  const existingQ = await supabase.from("questions").select("content").eq("subject_id", subjectId);
  if (existingQ.error) throw new Error(existingQ.error.message);
  const known = new Set<string>();
  for (const row of existingQ.data ?? []) {
    const meta = (row.content as { meta?: { source_id?: string } } | null)?.meta;
    if (meta?.source_id) known.add(meta.source_id);
  }

  // 4) Fragen in Paketen einfügen; Metadaten wandern nach content.meta
  const rows = file.questions
    .filter((q) => !known.has(q.id))
    .map((q) => ({
      subject_id: subjectId,
      topic_id: topicIds.get(topicOf(file, q)) ?? null,
      type: q.type,
      content: { ...q.content, meta: { ...(q.meta ?? {}), source_id: q.id } },
      solution: q.solution,
    }));

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("questions").insert(rows.slice(i, i + BATCH) as never);
    if (error) throw new Error(`Fehler nach ${i} Fragen: ${error.message}`);
    onProgress?.(Math.min(i + BATCH, rows.length), rows.length);
  }

  return {
    subjectCreated,
    topicsCreated: missing.length,
    inserted: rows.length,
    skipped: file.questions.length - rows.length,
  };
}
