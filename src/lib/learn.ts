import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Typen                                                               */
/* ------------------------------------------------------------------ */

export interface Option {
  id: string;
  text: string;
}

export interface QuestionMeta {
  difficulty?: number;
  source?: string;
  tags?: string[];
  exam_relevant?: boolean;
  source_id?: string;
}

export interface LQuestion {
  id: string;
  subject_id: string | null;
  topic_id: string | null;
  type: string;
  content: {
    text?: string;
    multiple?: boolean;
    options?: Option[];
    left?: Option[];
    right?: Option[];
    items?: Option[];
    meta?: QuestionMeta;
  };
  solution: {
    correct?: string[];
    pairs?: [string, string][];
    order?: string[];
    answers?: Record<string, string[]>;
    model_answer?: string;
    key_points?: string[];
    explanation?: string;
  };
}

export interface LSubject {
  id: string;
  name: string;
  description: string | null;
  exam_config: unknown;
}

export interface LTopic {
  id: string;
  subject_id: string | null;
  name: string;
  position: number | null;
}

export interface LAttempt {
  question_id: string | null;
  score: number | null;
  created_at: string;
  session_id: string | null;
  meta: { mode?: string; exam_id?: string } | null;
}

export interface LearnData {
  subjects: LSubject[];
  topics: LTopic[];
  questions: LQuestion[];
  attempts: LAttempt[];
}

/* ------------------------------------------------------------------ */
/* Geräte-ID (kein Login: Fortschritt wird pro Gerät gespeichert)      */
/* ------------------------------------------------------------------ */

const CLIENT_KEY = "lernplattform.client_id";

export function getClientId(): string {
  try {
    let id = window.localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    // z. B. privater Modus ohne Storage: Fortschritt gilt nur für diese Sitzung
    return "session-only";
  }
}

/* ------------------------------------------------------------------ */
/* Laden (seitenweise, damit auch > 1000 Zeilen vollständig kommen)    */
/* ------------------------------------------------------------------ */

const PAGE = 1000;

async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function loadLearnData(clientId: string): Promise<LearnData> {
  const [subjects, topics, questions, attempts] = await Promise.all([
    fetchAll<LSubject>((a, b) =>
      supabase
        .from("subjects")
        .select("id, name, description, exam_config")
        .order("created_at")
        .range(a, b),
    ),
    fetchAll<LTopic>((a, b) =>
      supabase
        .from("topics")
        .select("id, subject_id, name, position")
        .order("position")
        .order("created_at")
        .range(a, b),
    ),
    fetchAll<LQuestion>((a, b) =>
      supabase
        .from("questions")
        .select("id, subject_id, topic_id, type, content, solution")
        .order("created_at")
        .range(a, b),
    ),
    fetchAll<LAttempt>((a, b) =>
      supabase
        .from("attempts")
        .select("question_id, score, created_at, session_id, meta")
        .eq("client_id", clientId)
        .order("created_at")
        .range(a, b),
    ),
  ]);
  return { subjects, topics, questions, attempts };
}

export async function saveAttempt(input: {
  questionId: string;
  clientId: string;
  sessionId: string;
  answer: unknown;
  score: number;
  mode: string;
  extraMeta?: Record<string, unknown> | undefined;
}) {
  const { error } = await supabase.from("attempts").insert({
    question_id: input.questionId,
    client_id: input.clientId,
    session_id: input.sessionId,
    answer: input.answer,
    score: input.score,
    meta: { mode: input.mode, ...(input.extraMeta ?? {}) },
  } as never);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Fortschritt                                                         */
/* ------------------------------------------------------------------ */

/** Letztes Ergebnis je Frage (Attempts sind nach Zeit sortiert). */
export function latestScores(attempts: LAttempt[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of attempts) {
    if (a.question_id && a.score !== null) m.set(a.question_id, Number(a.score));
  }
  return m;
}

export interface Progress {
  total: number;
  practiced: number;
  correctPct: number | null;
  wrong: number;
}

export function progressOf(questions: LQuestion[], latest: Map<string, number>): Progress {
  let practiced = 0;
  let sum = 0;
  let wrong = 0;
  for (const q of questions) {
    const s = latest.get(q.id);
    if (s === undefined) continue;
    practiced++;
    sum += s;
    if (s < 1) wrong++;
  }
  return {
    total: questions.length,
    practiced,
    correctPct: practiced ? Math.round((sum / practiced) * 100) : null,
    wrong,
  };
}

export const isExamRelevant = (q: LQuestion) => q.content.meta?.exam_relevant === true;

/* ------------------------------------------------------------------ */
/* Runden zusammenstellen                                              */
/* ------------------------------------------------------------------ */

export type Mode = "thema" | "simulation" | "relevant" | "wiederholen";
export const ROUND_SIZE = 20;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/** Neue Fragen zuerst, dann falsch beantwortete, dann bereits sichere. */
function prioritized(questions: LQuestion[], latest: Map<string, number>): LQuestion[] {
  const fresh: LQuestion[] = [];
  const wrong: LQuestion[] = [];
  const known: LQuestion[] = [];
  for (const q of questions) {
    const s = latest.get(q.id);
    if (s === undefined) fresh.push(q);
    else if (s < 1) wrong.push(q);
    else known.push(q);
  }
  return [...shuffle(fresh), ...shuffle(wrong), ...shuffle(known)];
}

export function buildRound(
  mode: Mode,
  subjectQuestions: LQuestion[],
  latest: Map<string, number>,
  topicId?: string,
): LQuestion[] {
  switch (mode) {
    case "thema":
      return prioritized(
        subjectQuestions.filter((q) => q.topic_id === topicId),
        latest,
      ).slice(0, ROUND_SIZE);
    case "relevant":
      return prioritized(subjectQuestions.filter(isExamRelevant), latest).slice(0, ROUND_SIZE);
    case "wiederholen":
      return shuffle(
        subjectQuestions.filter((q) => {
          const s = latest.get(q.id);
          return s !== undefined && s < 1;
        }),
      ).slice(0, ROUND_SIZE);
    case "simulation":
    default:
      return shuffle(subjectQuestions).slice(0, ROUND_SIZE);
  }
}

/* ------------------------------------------------------------------ */
/* Antworten & Bewertung                                               */
/* ------------------------------------------------------------------ */

export type Answer =
  | { kind: "choice"; selected: string[] }
  | { kind: "matching"; pairs: Record<string, string> }
  | { kind: "ordering"; order: string[] }
  | { kind: "cloze"; values: Record<string, string> }
  | { kind: "open"; text: string };

export function emptyAnswer(q: LQuestion): Answer {
  switch (q.type) {
    case "multiple_choice":
      return { kind: "choice", selected: [] };
    case "matching":
      return { kind: "matching", pairs: {} };
    case "ordering":
      return { kind: "ordering", order: [] };
    case "cloze":
      return { kind: "cloze", values: {} };
    default:
      return { kind: "open", text: "" };
  }
}

export function clozeBlanks(q: LQuestion): string[] {
  return Array.from((q.content.text ?? "").matchAll(/\{\{(\d+)\}\}/g), (m) => m[1] ?? "");
}

/** Ist die Antwort vollständig genug, um sie zu prüfen? */
export function isAnswerReady(q: LQuestion, a: Answer): boolean {
  switch (a.kind) {
    case "choice":
      return a.selected.length > 0;
    case "matching":
      return Object.keys(a.pairs).length === (q.content.left?.length ?? 0);
    case "ordering":
      return a.order.length === (q.content.items?.length ?? 0);
    case "cloze":
      return clozeBlanks(q).every((b) => (a.values[b] ?? "").trim().length > 0);
    case "open":
      return a.text.trim().length > 0;
  }
}

export const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "");

export function isClozeCorrect(q: LQuestion, blank: string, value: string): boolean {
  const ok = q.solution.answers?.[blank] ?? [];
  return ok.some((x) => normalize(x) === normalize(value ?? ""));
}

/** Liefert 0 … 1. Offene Fragen bewertet die Lernende selbst. */
export function grade(q: LQuestion, a: Answer): number {
  switch (a.kind) {
    case "choice": {
      const correct = new Set(q.solution.correct ?? []);
      const sel = new Set(a.selected);
      return correct.size === sel.size && [...correct].every((c) => sel.has(c)) ? 1 : 0;
    }
    case "matching": {
      const pairs = q.solution.pairs ?? [];
      if (!pairs.length) return 0;
      const hits = pairs.filter(([l, r]) => a.pairs[l] === r).length;
      return hits === pairs.length ? 1 : Math.round((hits / pairs.length) * 100) / 100;
    }
    case "ordering": {
      const order = q.solution.order ?? [];
      return order.length > 0 && order.every((id, i) => a.order[i] === id) ? 1 : 0;
    }
    case "cloze": {
      const blanks = clozeBlanks(q);
      if (!blanks.length) return 0;
      const hits = blanks.filter((b) => isClozeCorrect(q, b, a.values[b] ?? "")).length;
      return hits === blanks.length ? 1 : Math.round((hits / blanks.length) * 100) / 100;
    }
    case "open":
      return 0;
  }
}

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Leicht",
  2: "Mittel",
  3: "Anspruchsvoll",
};

/** Mehrere Antworten auf einmal speichern (z. B. am Ende einer Prüfung). */
export async function saveAttempts(
  rows: {
    questionId: string;
    answer: unknown;
    score: number;
    meta: Record<string, unknown>;
  }[],
  clientId: string,
  sessionId: string,
) {
  if (!rows.length) return;
  const { error } = await supabase.from("attempts").insert(
    rows.map((r) => ({
      question_id: r.questionId,
      client_id: clientId,
      session_id: sessionId,
      answer: r.answer,
      score: r.score,
      meta: r.meta,
    })) as never,
  );
  if (error) throw new Error(error.message);
}

/** Kurzfassung der richtigen Lösung (für Auswertungen). */
export function solutionLines(q: LQuestion): string[] {
  const text = (list: { id: string; text: string }[] | undefined) =>
    new Map((list ?? []).map((o) => [o.id, o.text]));
  switch (q.type) {
    case "multiple_choice": {
      const o = text(q.content.options);
      return (q.solution.correct ?? []).map((id) => o.get(id) ?? "");
    }
    case "matching": {
      const l = text(q.content.left);
      const r = text(q.content.right);
      return (q.solution.pairs ?? []).map(([a, b]) => `${l.get(a)} → ${r.get(b)}`);
    }
    case "ordering": {
      const i = text(q.content.items);
      return (q.solution.order ?? []).map((id, n) => `${n + 1}. ${i.get(id)}`);
    }
    case "cloze":
      return clozeBlanks(q).map((b, n) => `Lücke ${n + 1}: ${q.solution.answers?.[b]?.[0] ?? ""}`);
    default:
      return q.solution.key_points ?? [];
  }
}
