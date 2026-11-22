import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_GRADING } from "./exams";
import type { Json } from "./models";

/**
 * Importformat:
 * {
 *   "subject": "Pharmakologie 2",
 *   "topics": ["Thema A", ...],          // optional, bestimmt die Reihenfolge
 *   "topic": "Thema",                    // optional, Standard-Thema für alle Fragen
 *   "questions": [{ id, topic?, type, content, solution, meta? }],
 *   "exams": [{ id, name, questions: [Fragen-IDs] }],   // optional, feste Prüfungen
 *   "grading": [{ min, grade, label }]                  // optional, Notenschlüssel
 * }
 * Fehlen „exams“, stellt die App aus den neuen Fragen selbst Prüfungen à 25 Fragen zusammen.
 */
export interface ImportQuestion {
  id: string;
  topic?: string;
  type: string;
  content: Json;
  solution: Json;
  meta?: Json;
}

export interface ImportExam {
  id: string;
  name: string;
  questions: string[];
}

export interface ImportFile {
  subject: string;
  description?: string;
  topics?: string[];
  topic?: string;
  questions: ImportQuestion[];
  exams?: ImportExam[];
  grading?: { min: number; grade: number; label: string }[];
}

export interface ImportProblem {
  where: string;
  message: string;
}

export interface ParsedImport {
  file: ImportFile;
  /** Fragen, die wegen Fehlern nicht übernommen werden */
  problems: ImportProblem[];
}

export interface ImportPreview {
  subject: string;
  subjectExists: boolean;
  topicNames: string[];
  newCount: number;
  skipCount: number;
  invalidCount: number;
  examCount: number;
}

export interface ImportResult {
  subjectCreated: boolean;
  topicsCreated: number;
  inserted: number;
  skipped: number;
  examCount: number;
}

const TYPES = ["multiple_choice", "matching", "ordering", "cloze", "open"] as const;
export const EXAM_TARGET = 25;

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const idsOf = (list: unknown): string[] | null =>
  Array.isArray(list) && list.every((o) => isObject(o) && isStr(o["id"]) && isStr(o["text"]))
    ? list.map((o) => (o as { id: string }).id)
    : null;

/** Was an einer einzelnen Frage nicht stimmt (null = alles gut). */
function checkQuestion(q: Record<string, unknown>, hasFallbackTopic: boolean): string | null {
  if (!isStr(q["id"])) return "„id“ fehlt";
  const type = q["type"];
  if (!TYPES.includes(type as (typeof TYPES)[number]))
    return `unbekannter Fragetyp „${String(type)}“`;
  if (!isStr(q["topic"]) && !hasFallbackTopic) return "„topic“ (Themengebiet) fehlt";
  const c = q["content"];
  const s = q["solution"];
  if (!isObject(c) || !isObject(s)) return "„content“ oder „solution“ fehlt";
  if (!isStr(c["text"])) return "Fragetext („content.text“) fehlt";

  switch (type) {
    case "multiple_choice": {
      const opts = idsOf(c["options"]);
      if (!opts || opts.length < 2) return "mindestens zwei Antwortoptionen nötig";
      const correct = s["correct"];
      if (!Array.isArray(correct) || correct.length === 0) return "„solution.correct“ fehlt";
      if (!correct.every((x) => opts.includes(x as string)))
        return "„solution.correct“ verweist auf eine Option, die es nicht gibt";
      if (correct.length > 1 && c["multiple"] !== true)
        return "mehrere richtige Antworten, aber „multiple“ ist nicht true";
      return null;
    }
    case "matching": {
      const l = idsOf(c["left"]);
      const r = idsOf(c["right"]);
      if (!l || !r || l.length < 2) return "„left“ und „right“ brauchen mindestens zwei Einträge";
      if (l.length !== r.length) return "„left“ und „right“ müssen gleich viele Einträge haben";
      const pairs = s["pairs"];
      if (!Array.isArray(pairs) || pairs.length !== l.length)
        return "„solution.pairs“ muss jede linke Seite genau einmal zuordnen";
      for (const p of pairs) {
        if (!Array.isArray(p) || !l.includes(p[0]) || !r.includes(p[1]))
          return "„solution.pairs“ enthält unbekannte IDs";
      }
      if (new Set(pairs.map((p) => (p as string[])[1])).size !== r.length)
        return "jede rechte Seite darf nur einmal vorkommen";
      return null;
    }
    case "ordering": {
      const items = idsOf(c["items"]);
      const order = s["order"];
      if (!items || items.length < 2) return "mindestens zwei „items“ nötig";
      if (
        !Array.isArray(order) ||
        order.length !== items.length ||
        !order.every((x) => items.includes(x as string))
      )
        return "„solution.order“ muss alle Item-IDs genau einmal enthalten";
      return null;
    }
    case "cloze": {
      const blanks = Array.from((c["text"] as string).matchAll(/\{\{(\d+)\}\}/g), (m) => m[1]);
      if (!blanks.length) return "keine Lücken im Text (Schreibweise {{1}}, {{2}} …)";
      const ans = s["answers"];
      if (!isObject(ans)) return "„solution.answers“ fehlt";
      for (const b of blanks) {
        const v = ans[b as string];
        if (!Array.isArray(v) || !v.length || !v.every(isStr))
          return `für Lücke {{${b}}} fehlt die Lösung`;
      }
      return null;
    }
    case "open": {
      if (!isStr(s["model_answer"])) return "„solution.model_answer“ fehlt";
      const kp = s["key_points"];
      if (!Array.isArray(kp) || !kp.length || !kp.every(isStr))
        return "„solution.key_points“ fehlt";
      return null;
    }
  }
  return null;
}

/** Holt das JSON auch aus einer kopierten Chat-Antwort (mit ```json … ``` oder Begleittext). */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  return a >= 0 && b > a ? body.slice(a, b + 1) : body;
}

/** Prüft die Datei. Grundlegende Fehler werfen, fehlerhafte Einzelfragen werden aussortiert. */
export function parseImportFile(raw: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    throw new Error(
      "Der Inhalt ist kein gültiges Fragenformat. Meist fehlt am Ende etwas: Lass dir die Antwort noch einmal vollständig als Datei geben.",
    );
  }
  if (!isObject(data)) throw new Error("Der Inhalt hat nicht das erwartete Format.");
  if (!isStr(data["subject"])) throw new Error("Der Fachname („subject“) fehlt.");
  if (!Array.isArray(data["questions"]) || data["questions"].length === 0)
    throw new Error("Es sind keine Fragen enthalten („questions“ ist leer).");

  const hasFallbackTopic = isStr(data["topic"]);
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  const valid: ImportQuestion[] = [];
  (data["questions"] as unknown[]).forEach((item, i) => {
    const where = isObject(item) && isStr(item["id"]) ? `Frage ${item["id"]}` : `Frage ${i + 1}`;
    if (!isObject(item)) {
      problems.push({ where, message: "kein gültiger Eintrag" });
      return;
    }
    const msg = checkQuestion(item, hasFallbackTopic);
    if (msg) {
      problems.push({ where, message: msg });
      return;
    }
    if (seen.has(item["id"] as string)) {
      problems.push({ where, message: "ID kommt doppelt vor" });
      return;
    }
    seen.add(item["id"] as string);
    valid.push(item as unknown as ImportQuestion);
  });
  if (!valid.length) {
    const first = problems[0];
    throw new Error(
      `Keine der Fragen ist verwendbar${first ? ` (z. B. ${first.where}: ${first.message})` : ""}.`,
    );
  }

  let exams: ImportExam[] | undefined;
  if (Array.isArray(data["exams"])) {
    exams = (data["exams"] as unknown[])
      .filter(
        (e): e is Record<string, unknown> =>
          isObject(e) && isStr(e["name"]) && Array.isArray(e["questions"]),
      )
      .map((e, i) => ({
        id: isStr(e["id"]) ? e["id"] : `p${i + 1}`,
        name: e["name"] as string,
        questions: (e["questions"] as unknown[]).filter(
          (id): id is string => typeof id === "string" && seen.has(id),
        ),
      }))
      .filter((e) => e.questions.length > 0);
  }

  const file: ImportFile = {
    ...(data as unknown as ImportFile),
    subject: (data["subject"] as string).trim(),
    questions: valid,
    ...(exams ? { exams } : {}),
  };
  if (!exams) delete file.exams;
  return { file, problems };
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

const textOf = (content: unknown) =>
  String((content as { text?: unknown } | null)?.text ?? "")
    .trim()
    .toLowerCase();

interface Existing {
  subjectId: string | null;
  /** source_id → Fragetext der vorhandenen Fragen */
  known: Map<string, string>;
  /** Fragetexte, die es im Fach schon gibt */
  texts: Set<string>;
}

async function loadExisting(subjectName: string): Promise<Existing> {
  const s = await supabase.from("subjects").select("id").eq("name", subjectName).limit(1);
  if (s.error) throw new Error(s.error.message);
  const subjectId = (s.data?.[0]?.id as string | undefined) ?? null;
  const known = new Map<string, string>();
  const texts = new Set<string>();
  if (subjectId) {
    const q = await supabase.from("questions").select("content").eq("subject_id", subjectId);
    if (q.error) throw new Error(q.error.message);
    for (const row of q.data ?? []) {
      const t = textOf(row.content);
      texts.add(t);
      const sid = (row.content as { meta?: { source_id?: string } } | null)?.meta?.source_id;
      if (sid) known.set(sid, t);
    }
  }
  return { subjectId, known, texts };
}

/**
 * Trennt neue von schon vorhandenen Fragen. Eine Frage gilt als vorhanden, wenn ihr Text im
 * Fach schon existiert. Kollidiert nur die ID (z. B. „q1“ aus zwei verschiedenen Durchgängen),
 * bekommt die neue Frage eine eigene ID.
 */
function plan(file: ImportFile, ex: Existing) {
  const fresh: ImportQuestion[] = [];
  const rename = new Map<string, string>();
  let skipped = 0;
  const used = new Set(ex.known.keys());
  for (const q of file.questions) {
    const t = textOf(q.content);
    if (ex.texts.has(t)) {
      skipped++;
      continue;
    }
    let id = q.id;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${q.id}-${n}`)) n++;
      id = `${q.id}-${n}`;
      rename.set(q.id, id);
    }
    used.add(id);
    fresh.push({ ...q, id });
  }
  return { fresh, rename, skipped };
}

export async function previewImport(parsed: ParsedImport): Promise<ImportPreview> {
  const ex = await loadExisting(parsed.file.subject);
  const p = plan(parsed.file, ex);
  return {
    subject: parsed.file.subject,
    subjectExists: ex.subjectId !== null,
    topicNames: orderedTopics(parsed.file),
    newCount: p.fresh.length,
    skipCount: p.skipped,
    invalidCount: parsed.problems.length,
    examCount: parsed.file.exams?.length ? parsed.file.exams.length : autoExamCount(p.fresh.length),
  };
}

/** Wie viele Prüfungen aus n neuen Fragen entstehen (ab 20 Fragen eine eigene Prüfung). */
function autoExamCount(n: number): number {
  return n < 20 ? 0 : Math.max(1, Math.round(n / EXAM_TARGET));
}

const diffOf = (q: ImportQuestion) => {
  const d = (q.meta as { difficulty?: unknown } | undefined)?.difficulty;
  return typeof d === "number" ? d : 2;
};

/** Verteilt Fragen ausgewogen (Thema, Schwierigkeit, Fragetyp) auf k Prüfungen. */
function buildAutoExams(file: ImportFile, questions: ImportQuestion[], k: number): string[][] {
  const sorted = questions
    .slice()
    .sort(
      (a, b) =>
        topicOf(file, a).localeCompare(topicOf(file, b)) ||
        diffOf(a) - diffOf(b) ||
        a.type.localeCompare(b.type),
    );
  const exams: string[][] = Array.from({ length: k }, () => []);
  // Schlangenlinie: 0,1,…,k-1,k-1,…,0 – gleicht Reihenfolgeeffekte aus
  sorted.forEach((q, i) => {
    const round = Math.floor(i / k);
    const pos = i % k;
    exams[round % 2 === 0 ? pos : k - 1 - pos]?.push(q.id);
  });
  return exams;
}

/**
 * Legt Fach und Themen an (falls nicht vorhanden) und fügt die neuen Fragen ein.
 * Mehrfaches Importieren derselben Datei ist sicher.
 */
export async function runImport(
  parsed: ParsedImport,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const file = parsed.file;
  const ex = await loadExisting(file.subject);
  const { fresh, rename, skipped } = plan(file, ex);

  // 1) Fach finden oder anlegen
  let subjectId = ex.subjectId;
  const subjectCreated = !subjectId;
  if (!subjectId) {
    const created = await supabase
      .from("subjects")
      .insert({ name: file.subject, description: file.description ?? null } as never)
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
  const missing = orderedTopics({ ...file, questions: fresh }).filter((n) => !topicIds.has(n));
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

  // 3) Fragen in Paketen einfügen; Metadaten wandern nach content.meta
  const rows = fresh.map((q) => ({
    subject_id: subjectId,
    topic_id: topicIds.get(topicOf(file, q)) ?? null,
    type: q.type,
    content: { ...(q.content as object), meta: { ...((q.meta as object) ?? {}), source_id: q.id } },
    solution: q.solution,
  }));
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("questions").insert(rows.slice(i, i + BATCH) as never);
    if (error) throw new Error(`Fehler nach ${i} Fragen: ${error.message}`);
    onProgress?.(Math.min(i + BATCH, rows.length), rows.length);
  }

  // 4) Prüfungen ergänzen – bestehende bleiben erhalten
  const cur = await supabase.from("subjects").select("exam_config").eq("id", subjectId).single();
  if (cur.error) throw new Error(cur.error.message);
  const prev = ((cur.data as { exam_config: Record<string, unknown> | null }).exam_config ??
    {}) as { exams?: ImportExam[]; grading?: unknown };
  const exams: ImportExam[] = Array.isArray(prev.exams) ? prev.exams.slice() : [];
  const freshIds = new Set(fresh.map((q) => q.id));
  const nextNo = () => exams.length + 1;
  const uniqueId = () => {
    let n = nextNo();
    while (exams.some((e) => e.id === `p${n}`)) n++;
    return `p${n}`;
  };
  let added = 0;

  if (file.exams?.length) {
    for (const e of file.exams) {
      const qs = e.questions.map((id) => rename.get(id) ?? id);
      const same = exams.findIndex((x) => x.id === e.id && x.questions.join("|") === qs.join("|"));
      if (same >= 0) continue; // dieselbe Datei erneut importiert
      if (!qs.some((id) => freshIds.has(id))) continue;
      const clash = exams.some((x) => x.id === e.id);
      const name = /^Prüfung \d+$/.test(e.name) && clash ? `Prüfung ${nextNo()}` : e.name;
      exams.push({ id: clash ? uniqueId() : e.id, name, questions: qs });
      added++;
    }
  } else {
    const k = autoExamCount(fresh.length);
    for (const qs of buildAutoExams(file, fresh, k)) {
      exams.push({ id: uniqueId(), name: `Prüfung ${nextNo()}`, questions: qs });
      added++;
    }
  }

  const grading = file.grading?.length ? file.grading : (prev.grading ?? DEFAULT_GRADING);
  if (added || file.grading?.length) {
    const upd = await supabase
      .from("subjects")
      .update({ exam_config: { ...prev, exams, grading } } as never)
      .eq("id", subjectId);
    if (upd.error) throw new Error(upd.error.message);
  }

  return {
    subjectCreated,
    topicsCreated: missing.length,
    inserted: rows.length,
    skipped,
    examCount: added,
  };
}
