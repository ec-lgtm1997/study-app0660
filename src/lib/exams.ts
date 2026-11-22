import type { LAttempt, LQuestion, LSubject } from "./learn";

export interface ExamDef {
  id: string;
  name: string;
  /** Ursprüngliche Fragen-IDs aus der Importdatei (content.meta.source_id) */
  questions: string[];
}

export interface GradeStep {
  min: number;
  grade: number;
  label: string;
}

/** Wohlwollender Notenschlüssel (österreichische Noten). */
export const DEFAULT_GRADING: GradeStep[] = [
  { min: 82, grade: 1, label: "Sehr gut" },
  { min: 68, grade: 2, label: "Gut" },
  { min: 54, grade: 3, label: "Befriedigend" },
  { min: 40, grade: 4, label: "Genügend" },
  { min: 0, grade: 5, label: "Nicht genügend" },
];

/** Größe einer zufällig zusammengestellten Prüfung. */
export const EXAM_SIZE = 25;

interface ExamConfig {
  exams?: unknown;
  grading?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function subjectExams(subject: LSubject | undefined): ExamDef[] {
  const cfg = (isObj(subject?.exam_config) ? subject?.exam_config : {}) as ExamConfig;
  if (!Array.isArray(cfg.exams)) return [];
  return cfg.exams.filter(
    (e): e is ExamDef =>
      isObj(e) &&
      typeof e["id"] === "string" &&
      typeof e["name"] === "string" &&
      Array.isArray(e["questions"]),
  );
}

export function subjectGrading(subject: LSubject | undefined): GradeStep[] {
  const cfg = (isObj(subject?.exam_config) ? subject?.exam_config : {}) as ExamConfig;
  const g = Array.isArray(cfg.grading)
    ? cfg.grading.filter(
        (x): x is GradeStep =>
          isObj(x) &&
          typeof x["min"] === "number" &&
          typeof x["grade"] === "number" &&
          typeof x["label"] === "string",
      )
    : [];
  return (g.length ? g : DEFAULT_GRADING).slice().sort((a, b) => b.min - a.min);
}

export function gradeFor(pct: number, grading: GradeStep[]): GradeStep {
  const sorted = grading.slice().sort((a, b) => b.min - a.min);
  return sorted.find((s) => pct >= s.min) ?? sorted[sorted.length - 1] ?? DEFAULT_GRADING[4]!;
}

/** Fragen einer festen Prüfung in der festgelegten Reihenfolge. */
export function examQuestions(exam: ExamDef, subjectQuestions: LQuestion[]): LQuestion[] {
  const bySource = new Map<string, LQuestion>();
  for (const q of subjectQuestions) {
    bySource.set(q.id, q);
    const sid = q.content.meta?.source_id;
    if (sid) bySource.set(sid, q);
  }
  return exam.questions.map((id) => bySource.get(id)).filter((q): q is LQuestion => Boolean(q));
}

export interface ExamRun {
  pct: number;
  at: string;
}

/** Abgeschlossene Durchläufe einer Prüfung (neueste zuerst). */
export function examRuns(attempts: LAttempt[], examId: string): ExamRun[] {
  const sessions = new Map<string, { sum: number; n: number; at: string }>();
  for (const a of attempts) {
    if (a.meta?.exam_id !== examId || !a.session_id || a.score === null) continue;
    const s = sessions.get(a.session_id) ?? { sum: 0, n: 0, at: a.created_at };
    s.sum += Number(a.score);
    s.n += 1;
    if (a.created_at > s.at) s.at = a.created_at;
    sessions.set(a.session_id, s);
  }
  return [...sessions.values()]
    .map((s) => ({ pct: Math.round((s.sum / s.n) * 100), at: s.at }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Prüfungsformat (z. B. nur offene Fragen, 10 Fragen je Prüfung)       */
/* ------------------------------------------------------------------ */

export interface ExamFormat {
  /** null = alle Fragetypen */
  types: string[] | null;
  size: number;
}

export function examFormat(subject: LSubject | undefined): ExamFormat {
  const cfg = (isObj(subject?.exam_config) ? subject?.exam_config : {}) as { format?: unknown };
  const f = isObj(cfg.format) ? cfg.format : {};
  const types = Array.isArray(f["types"])
    ? (f["types"] as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const size = typeof f["size"] === "number" && f["size"] > 0 ? f["size"] : EXAM_SIZE;
  return { types: types.length ? types : null, size };
}

const isDefault = (f: ExamFormat) => f.types === null && f.size === EXAM_SIZE;

/** Fragen, die zum Format passen. */
export function formatPool(f: ExamFormat, questions: LQuestion[]): LQuestion[] {
  const types = f.types;
  return types ? questions.filter((q) => types.includes(q.type)) : questions;
}

/**
 * Die Prüfungen, die gerade gelten: im Standardformat die festen Prüfungen aus der Importdatei,
 * sonst feste, ausgewogene Prüfungen aus allen passenden Fragen.
 */
export function activeExams(
  subject: LSubject | undefined,
  subjectQuestions: LQuestion[],
): ExamDef[] {
  const f = examFormat(subject);
  if (isDefault(f)) return subjectExams(subject);
  const pool = formatPool(f, subjectQuestions);
  if (!pool.length) return [];
  const k = pool.length <= f.size ? 1 : Math.max(1, Math.round(pool.length / f.size));
  const key = `${(f.types ?? ["alle"]).slice().sort().join("+")}-${f.size}`;
  const diff = (q: LQuestion) => q.content.meta?.difficulty ?? 2;
  const sorted = pool
    .slice()
    .sort(
      (a, b) =>
        (a.topic_id ?? "").localeCompare(b.topic_id ?? "") ||
        diff(a) - diff(b) ||
        (a.content.meta?.source_id ?? a.id).localeCompare(b.content.meta?.source_id ?? b.id),
    );
  const groups: string[][] = Array.from({ length: k }, () => []);
  sorted.forEach((q, i) => {
    const round = Math.floor(i / k);
    const pos = i % k;
    groups[round % 2 === 0 ? pos : k - 1 - pos]?.push(q.content.meta?.source_id ?? q.id);
  });
  return groups.map((qs, i) => ({
    id: `${key}-${i + 1}`,
    name: `Prüfung ${i + 1}`,
    questions: qs,
  }));
}

export function formatLabel(f: ExamFormat, labels: Record<string, string>): string {
  const t = f.types ? f.types.map((x) => labels[x] ?? x).join(", ") : "Alle Fragetypen";
  return `${t}, ${f.size} Fragen`;
}
