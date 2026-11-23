import { generateQuestions } from "./ai-generate.functions";
import { buildAnleitung } from "./anleitung";
import {
  parseImportFile,
  type ImportQuestion,
  type ParsedImport,
  type ImportProblem,
} from "./import";

/* Fragen direkt aus Unterlagen erstellen (PDF, Word, Text) – läuft paketweise. */

export const MAX_PDF_MB = 14;
const BATCH = 25;

export type Source =
  { kind: "pdf"; base64: string; name: string } | { kind: "text"; text: string; name: string };

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

/** Minimaler ZIP-Leser: holt word/document.xml aus einer .docx und macht daraus Text. */
async function docxText(buf: ArrayBuffer): Promise<string> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder();
  // Zentrales Verzeichnis über den End-of-Central-Directory-Eintrag finden
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Die Word-Datei konnte nicht gelesen werden.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (name === "word/document.xml") {
      const lNameLen = view.getUint16(local + 26, true);
      const lExtraLen = view.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const raw = bytes.subarray(start, start + size);
      let xml: string;
      if (method === 0) xml = dec.decode(raw);
      else {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        xml = await new Response(stream).text();
      }
      return xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("In der Word-Datei wurde kein Text gefunden.");
}

/** Liest eine hochgeladene Datei so, wie sie an die Fragenerstellung geht. */
export async function readSource(file: File): Promise<Source> {
  const name = file.name;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    if (file.size > MAX_PDF_MB * 1024 * 1024)
      throw new Error(
        `Die PDF ist größer als ${MAX_PDF_MB} MB. Teile sie bitte auf (z. B. Folien in zwei Hälften).`,
      );
    return { kind: "pdf", base64: toBase64(await file.arrayBuffer()), name };
  }
  if (lower.endsWith(".docx")) {
    return { kind: "text", text: await docxText(await file.arrayBuffer()), name };
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/")) {
    return { kind: "text", text: await file.text(), name };
  }
  throw new Error("Bitte eine PDF, Word-Datei (.docx) oder Textdatei hochladen.");
}

/* ------------------------------------------------------------------ */
/* Warteschlange: mehrere Unterlagen, Einstellungen pro Datei            */
/* ------------------------------------------------------------------ */

export type Mix = "gemischt" | "mehr_offen" | "nur_mc" | "nur_offen" | "eigene";
export type Difficulty = "leicht" | "gemischt" | "schwer";
export type JobStatus = "wartet" | "laeuft" | "fertig" | "fehler";

export interface Job {
  id: string;
  name: string;
  file: Blob;
  role: "quelle" | "lernziele";
  topic: string;
  count: number;
  mix: Mix;
  /** nur bei mix = "eigene" */
  types: string[];
  difficulty: Difficulty;
  wish: string;
  status: JobStatus;
  message?: string | undefined;
  batchesDone: number;
  questions: ImportQuestion[];
  problems: ImportProblem[];
}

export const MIX_LABEL: Record<Mix, string> = {
  gemischt: "Gemischt",
  mehr_offen: "Mehr offene",
  nur_mc: "Nur Multiple Choice",
  nur_offen: "Nur offene",
  eigene: "Eigene Auswahl",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  leicht: "Eher leicht",
  gemischt: "Gemischt",
  schwer: "Anspruchsvoll",
};

function mixLine(job: Job): string | undefined {
  switch (job.mix) {
    case "mehr_offen":
      return "Fragetypen: etwa 35 % open, 40 % multiple_choice, 10 % matching, 8 % ordering, 7 % cloze.";
    case "nur_mc":
      return "Fragetypen: ausschließlich multiple_choice (gerne auch mit mehreren richtigen Antworten).";
    case "nur_offen":
      return "Fragetypen: ausschließlich open (offene Fragen mit Musterantwort und Kernpunkten).";
    case "eigene":
      return job.types.length
        ? `Fragetypen: ausschließlich ${job.types.join(", ")}, ungefähr gleich verteilt.`
        : undefined;
    default:
      return undefined;
  }
}

function allowedTypes(job: Job): string[] | null {
  if (job.mix === "nur_mc") return ["multiple_choice"];
  if (job.mix === "nur_offen") return ["open"];
  if (job.mix === "eigene" && job.types.length) return job.types;
  return null;
}

function difficultyLine(job: Job): string | undefined {
  if (job.difficulty === "leicht")
    return "Schwierigkeit: etwa 50 % leicht (1), 40 % mittel (2), 10 % anspruchsvoll (3).";
  if (job.difficulty === "schwer")
    return "Schwierigkeit: etwa 10 % leicht (1), 40 % mittel (2), 50 % anspruchsvoll (3).";
  return undefined;
}

export const topicFromName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function newJob(file: File): Job {
  const lower = file.name.toLowerCase();
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    file,
    role: /lernziel/.test(lower) ? "lernziele" : "quelle",
    topic: topicFromName(file.name),
    count: 20,
    mix: "gemischt",
    types: [],
    difficulty: "gemischt",
    wish: "",
    status: "wartet",
    batchesDone: 0,
    questions: [],
    problems: [],
  };
}

export function checkFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!/\.(pdf|docx|txt|md)$/.test(lower) && file.type !== "application/pdf")
    return `${file.name}: bitte PDF, Word (.docx) oder Text.`;
  if (lower.endsWith(".pdf") && file.size > MAX_PDF_MB * 1024 * 1024)
    return `${file.name} ist größer als ${MAX_PDF_MB} MB. Bitte aufteilen.`;
  return null;
}

const asFile = (job: Job) => new File([job.file], job.name, { type: job.file.type });

/**
 * Arbeitet eine Datei paketweise ab und meldet nach jedem Paket den neuen Stand
 * (zum Zwischenspeichern). Bereits erledigte Pakete werden übersprungen.
 */
export async function runJob(opts: {
  job: Job;
  subject: string;
  knownTopics: string[];
  goals: Job | null;
  onUpdate: (job: Job) => Promise<void> | void;
  signal: { cancelled: boolean };
}): Promise<Job> {
  let job: Job = { ...opts.job, status: "laeuft", message: undefined };
  await opts.onUpdate(job);

  let source: Source;
  let goals: Source | null = null;
  try {
    source = await readSource(asFile(job));
    if (opts.goals) goals = await readSource(asFile(opts.goals));
  } catch (e) {
    job = { ...job, status: "fehler", message: e instanceof Error ? e.message : String(e) };
    await opts.onUpdate(job);
    return job;
  }
  // zusammen höchstens ~20 MB, sonst ohne Lernziele
  if (
    goals?.kind === "pdf" &&
    source.kind === "pdf" &&
    source.base64.length + goals.base64.length > 26_000_000
  )
    goals = null;

  const stamp = job.id;
  const allowed = allowedTypes(job);
  let empty = 0;

  while (job.questions.length < job.count && empty < 2) {
    const b = job.batchesDone;
    const batches = b + Math.max(1, Math.ceil((job.count - job.questions.length) / BATCH));
    if (opts.signal.cancelled) {
      job = { ...job, status: "wartet" };
      await opts.onUpdate(job);
      return job;
    }
    const n = Math.min(BATCH, job.count - job.questions.length);
    const seen = job.questions
      .slice(-120)
      .map((q) => `- ${String((q.content as { text?: string }).text ?? "").slice(0, 110)}`);
    const prompt = `${buildAnleitung({
      subject: opts.subject,
      count: n,
      topics: opts.knownTopics,
      direct: true,
      fixedTopic: job.topic.trim() || undefined,
      mixLine: mixLine(job),
      difficultyLine: difficultyLine(job),
      wish: job.wish,
      withLernziele: Boolean(goals),
    })}

## Dieser Durchgang
Paket ${b + 1} von ${batches}. Erstelle genau ${n} Fragen. Verwende als IDs "g${stamp}-${b + 1}-001", "g${stamp}-${b + 1}-002" usw.
${
  seen.length
    ? `Diese Fragen gibt es schon. Wiederhole sie nicht, sondern decke andere Inhalte der Unterlage ab:\n${seen.join("\n")}`
    : "Beginne mit den wichtigsten Inhalten der Unterlage."
}`;

    const call = () =>
      generateQuestions({
        data: {
          prompt,
          ...(source.kind === "pdf" ? { pdfBase64: source.base64 } : { text: source.text }),
          ...(goals
            ? goals.kind === "pdf"
              ? { goalsPdfBase64: goals.base64 }
              : { goalsText: goals.text.slice(0, 100_000) }
            : {}),
        },
      });
    let res: Awaited<ReturnType<typeof call>>;
    try {
      res = await call();
      if (!res.ok && res.reason === "busy" && !opts.signal.cancelled) {
        await new Promise((r) => setTimeout(r, 20_000));
        res = await call();
      }
    } catch (e) {
      res = {
        ok: false,
        reason: "error",
        detail: e instanceof Error ? e.message.slice(0, 160) : String(e),
      };
    }
    if (!res.ok) {
      job = { ...job, status: "fehler", message: reasonText(res.reason, res.detail) };
      await opts.onUpdate(job);
      return job;
    }

    const questions = job.questions.slice();
    const problems = job.problems.slice();
    try {
      let raw = res.json;
      try {
        const o: unknown = JSON.parse(raw);
        if (Array.isArray(o)) raw = JSON.stringify({ subject: opts.subject, questions: o });
        else if (o && typeof o === "object")
          raw = JSON.stringify({ ...(o as object), subject: opts.subject });
      } catch {
        // parseImportFile meldet den Fehler verständlich
      }
      const parsed = parseImportFile(raw);
      for (const q of parsed.file.questions) {
        if (allowed && !allowed.includes(q.type)) {
          problems.push({
            where: `Frage ${q.id}`,
            message: "passt nicht zu den gewählten Fragetypen",
          });
          continue;
        }
        questions.push(job.topic.trim() ? { ...q, topic: job.topic.trim() } : q);
      }
      problems.push(...parsed.problems);
    } catch (e) {
      problems.push({
        where: `${job.name}, Paket ${b + 1}`,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (questions.length === job.questions.length) empty++;
    else empty = 0;
    job = { ...job, questions, problems, batchesDone: b + 1 };
    await opts.onUpdate(job);
  }

  job = { ...job, status: "fertig" };
  await opts.onUpdate(job);
  return job;
}

/** Alle fertigen Fragen aller Dateien als ein Import. */
export function combineJobs(subject: string, jobs: Job[]): ParsedImport | null {
  const questions: ImportQuestion[] = [];
  const problems: ImportProblem[] = [];
  const topics: string[] = [];
  const ids = new Set<string>();
  for (const j of jobs) {
    if (j.role !== "quelle") continue;
    for (const q of j.questions) {
      if (ids.has(q.id)) continue;
      ids.add(q.id);
      questions.push(q);
      const t = (q.topic ?? "").trim();
      if (t && !topics.includes(t)) topics.push(t);
    }
    problems.push(...j.problems);
  }
  return questions.length ? { file: { subject, topics, questions }, problems } : null;
}

export interface GenerateProgress {
  done: number;
  total: number;
}

export interface GenerateOutcome {
  parsed: ParsedImport | null;
  /** Grund, falls vorzeitig abgebrochen wurde (bereits erstellte Fragen bleiben nutzbar) */
  stopped?: string;
}

const reasonText = (r: string, detail?: string) =>
  r === "not_configured"
    ? "Die Fragenerstellung ist noch nicht eingerichtet (Schlüssel GEMINI_API_KEY fehlt)."
    : r === "busy"
      ? "Google ist gerade überlastet. Die bis hierhin erstellten Fragen kannst du übernehmen und den Rest später noch einmal erstellen."
      : r === "limit"
        ? "Das kostenlose Kontingent ist gerade ausgeschöpft. Die bis hierhin erstellten Fragen kannst du übernehmen, den Rest in ein paar Minuten oder morgen."
        : r === "too_large"
          ? "Die Unterlage ist zu groß. Teile sie bitte auf."
          : `Die Fragenerstellung hat nicht geklappt${detail ? ` (${detail})` : ""}.`;

export async function generateFromSource(opts: {
  subject: string;
  topics: string[];
  count: number;
  source: Source;
  onProgress: (p: GenerateProgress) => void;
  signal?: { cancelled: boolean };
}): Promise<GenerateOutcome> {
  const stamp = Date.now().toString(36);
  const batches = Math.ceil(opts.count / BATCH);
  const questions: ImportQuestion[] = [];
  const problems: ImportProblem[] = [];
  const topics = [...opts.topics];
  let stopped: string | undefined;

  for (let b = 0; b < batches; b++) {
    if (opts.signal?.cancelled) break;
    const n = Math.min(BATCH, opts.count - b * BATCH);
    opts.onProgress({ done: questions.length, total: opts.count });
    const seen = questions
      .slice(-120)
      .map((q) => `- ${String((q.content as { text?: string }).text ?? "").slice(0, 110)}`);
    const prompt = `${buildAnleitung({ subject: opts.subject, count: n, topics, direct: true })}

## Dieser Durchgang
Paket ${b + 1} von ${batches}. Erstelle genau ${n} Fragen. Verwende als IDs "g${stamp}-${b + 1}-001", "g${stamp}-${b + 1}-002" usw.
${
  seen.length
    ? `Diese Fragen gibt es schon. Wiederhole sie nicht, sondern decke andere Inhalte der Unterlagen ab:\n${seen.join("\n")}`
    : "Beginne mit den wichtigsten Inhalten der Unterlagen."
}`;

    const call = () =>
      generateQuestions({
        data: {
          prompt,
          ...(opts.source.kind === "pdf"
            ? { pdfBase64: opts.source.base64 }
            : { text: opts.source.text }),
        },
      });
    let res = await call();
    // Google überlastet: einmal kurz warten und dasselbe Paket erneut versuchen
    if (!res.ok && res.reason === "busy" && !opts.signal?.cancelled) {
      await new Promise((r) => setTimeout(r, 20_000));
      res = await call();
    }
    if (!res.ok) {
      stopped = reasonText(res.reason, res.detail);
      break;
    }
    try {
      // Fachname immer vorgeben, auch wenn die Antwort ihn weglässt oder nur eine Liste liefert
      let raw = res.json;
      try {
        const o: unknown = JSON.parse(raw);
        if (Array.isArray(o)) raw = JSON.stringify({ subject: opts.subject, questions: o });
        else if (o && typeof o === "object")
          raw = JSON.stringify({ ...(o as object), subject: opts.subject });
      } catch {
        // parseImportFile meldet den Fehler verständlich
      }
      const parsed = parseImportFile(raw);
      for (const q of parsed.file.questions) {
        questions.push(q);
        const t = (q.topic ?? "").trim();
        if (t && !topics.includes(t)) topics.push(t);
      }
      problems.push(...parsed.problems);
    } catch (e) {
      problems.push({
        where: `Paket ${b + 1}`,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  opts.onProgress({ done: questions.length, total: opts.count });

  if (!questions.length) return { parsed: null, ...(stopped ? { stopped } : {}) };
  return {
    parsed: {
      file: { subject: opts.subject, topics, questions },
      problems,
    },
    ...(stopped ? { stopped } : {}),
  };
}
