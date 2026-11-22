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
  answer?: unknown;
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
/* Geräte-ID (nur zur Herkunft; Ergebnisse gelten geräteübergreifend) */
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

// Alle Ergebnisse werden zentral gespeichert: auf jedem Gerät derselbe Stand.
export async function loadLearnData(): Promise<LearnData> {
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
        .select("question_id, score, created_at, session_id, meta, answer")
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
  if (isTestMode()) return;
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

export type Mode = "thema" | "simulation" | "relevant" | "wiederholen" | "auswahl";
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

/* Wiederholen nach Abständen: jede richtige Antwort in Folge verlängert die Pause. */
export interface QState {
  /** letztes Ergebnis 0 … 1 */
  last: number;
  /** Zeitpunkt der letzten Antwort */
  at: string;
  /** richtige Antworten in Folge (am Ende) */
  streak: number;
}

/** Tage bis zur nächsten Wiederholung, je nach Anzahl richtiger Antworten in Folge. */
const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];

export function questionStates(attempts: LAttempt[]): Map<string, QState> {
  const m = new Map<string, QState>();
  for (const a of attempts) {
    if (!a.question_id || a.score === null) continue;
    const score = Number(a.score);
    const prev = m.get(a.question_id);
    m.set(a.question_id, {
      last: score,
      at: a.created_at,
      streak: score >= 1 ? (prev?.streak ?? 0) + 1 : 0,
    });
  }
  return m;
}

/** Fällig = zuletzt falsch oder die Pause seit der letzten richtigen Antwort ist um. */
export function isDue(s: QState | undefined, now = Date.now()): boolean {
  if (!s) return false;
  if (s.last < 1) return true;
  const days = INTERVAL_DAYS[Math.min(s.streak, INTERVAL_DAYS.length - 1)] ?? 35;
  // zwei Stunden Spielraum, damit „morgen früh“ schon zählt
  return now - Date.parse(s.at) >= days * 864e5 - 2 * 3600e3;
}

export function dueQuestions(questions: LQuestion[], states: Map<string, QState>): LQuestion[] {
  const now = Date.now();
  return questions.filter((q) => isDue(states.get(q.id), now));
}

/** Neue Fragen zuerst, dann fällige, dann die, deren Pause noch läuft. */
function prioritized(questions: LQuestion[], states: Map<string, QState>): LQuestion[] {
  const now = Date.now();
  const fresh: LQuestion[] = [];
  const due: LQuestion[] = [];
  const later: LQuestion[] = [];
  for (const q of questions) {
    const s = states.get(q.id);
    if (!s) fresh.push(q);
    else if (isDue(s, now)) due.push(q);
    else later.push(q);
  }
  return [...shuffle(fresh), ...shuffle(due), ...shuffle(later)];
}

/** Fragetypen, die es gibt (Reihenfolge für Filter und Anzeige). */
export const QUESTION_TYPES = [
  ["multiple_choice", "Multiple Choice"],
  ["matching", "Zuordnung"],
  ["ordering", "Reihenfolge"],
  ["cloze", "Lückentext"],
  ["open", "Offen"],
] as const;

export function buildRound(
  mode: Mode,
  subjectQuestions: LQuestion[],
  states: Map<string, QState>,
  topicId?: string,
  ids?: string[],
  types?: string[] | null,
): LQuestion[] {
  if (mode === "auswahl") {
    const set = new Set(ids ?? []);
    return prioritized(
      subjectQuestions.filter((q) => set.has(q.id)),
      states,
    ).slice(0, ROUND_SIZE);
  }
  const pool = types?.length
    ? subjectQuestions.filter((q) => types.includes(q.type))
    : subjectQuestions;
  switch (mode) {
    case "thema":
      return prioritized(
        pool.filter((q) => q.topic_id === topicId),
        states,
      ).slice(0, ROUND_SIZE);
    case "relevant":
      return prioritized(pool.filter(isExamRelevant), states).slice(0, ROUND_SIZE);
    case "wiederholen":
      return shuffle(dueQuestions(pool, states)).slice(0, ROUND_SIZE);
    case "simulation":
    default:
      return shuffle(pool).slice(0, ROUND_SIZE);
  }
}

/* ------------------------------------------------------------------ */
/* Testmodus: Antworten werden nicht gespeichert (zum Ausprobieren)     */
/* ------------------------------------------------------------------ */

const TEST_KEY = "lernplattform.testmodus";

export function isTestMode(): boolean {
  try {
    return window.localStorage.getItem(TEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTestMode(on: boolean) {
  try {
    if (on) window.localStorage.setItem(TEST_KEY, "1");
    else window.localStorage.removeItem(TEST_KEY);
  } catch {
    // ohne Speicher kein Testmodus
  }
}

/* ------------------------------------------------------------------ */
/* Einstellungen am Fach (zentral gespeichert in exam_config)           */
/* ------------------------------------------------------------------ */

export async function updateSubjectConfig(subjectId: string, patch: Record<string, unknown>) {
  const cur = await supabase.from("subjects").select("exam_config").eq("id", subjectId).single();
  if (cur.error) throw new Error(cur.error.message);
  const prev = ((cur.data as { exam_config: Record<string, unknown> | null }).exam_config ??
    {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("subjects")
    .update({ exam_config: { ...prev, ...patch } } as never)
    .eq("id", subjectId);
  if (error) throw new Error(error.message);
}

export function practiceTypes(subject: LSubject | undefined): string[] | null {
  const cfg = subject?.exam_config as { practice_types?: unknown } | null | undefined;
  const t = cfg?.practice_types;
  return Array.isArray(t) && t.length ? t.filter((x): x is string => typeof x === "string") : null;
}

/** Frage nach einer Korrektur speichern (Metadaten bleiben erhalten). */
export async function updateQuestion(
  q: LQuestion,
  content: LQuestion["content"],
  solution: LQuestion["solution"],
) {
  const { error } = await supabase
    .from("questions")
    .update({ content: { ...content, meta: q.content.meta }, solution } as never)
    .eq("id", q.id);
  if (error) throw new Error(error.message);
}

export async function removeQuestion(id: string) {
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) throw new Error(error.message);
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
      // Vergleich über den Text: gleich lautende Ziele (z. B. „Barriere“) sind austauschbar
      const txt = new Map((q.content.right ?? []).map((x) => [x.id, x.text]));
      const hits = pairs.filter(([l, r]) => {
        const chosen = a.pairs[l];
        return chosen !== undefined && (chosen === r || txt.get(chosen) === txt.get(r));
      }).length;
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

/** Frage für später vormerken: zählt bis zur nächsten richtigen Antwort als „wiederholen“. */
export async function markForRepeat(questionId: string, clientId: string) {
  await saveAttempt({
    questionId,
    clientId,
    sessionId: crypto.randomUUID(),
    answer: null,
    score: 0,
    mode: "merken",
  });
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
  if (!rows.length || isTestMode()) return;
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
