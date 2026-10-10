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
