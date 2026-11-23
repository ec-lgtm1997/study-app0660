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
    : r === "limit"
      ? "Das kostenlose Kontingent ist gerade ausgeschöpft. Versuch es in ein paar Minuten oder morgen wieder."
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

    const res = await generateQuestions({
      data: {
        prompt,
        ...(opts.source.kind === "pdf"
          ? { pdfBase64: opts.source.base64 }
          : { text: opts.source.text }),
      },
    });
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
