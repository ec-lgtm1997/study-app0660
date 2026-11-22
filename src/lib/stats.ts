import { activeExams, gradeFor, subjectExams, subjectGrading, type GradeStep } from "./exams";
import type { LAttempt, LQuestion, LSubject, LTopic } from "./learn";

/* Auswertungen über alle gespeicherten Ergebnisse (geräteübergreifend). */

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const counts = (a: LAttempt) => a.score !== null && a.meta?.mode !== "merken";

export interface CurvePoint {
  day: string;
  pct: number;
  n: number;
}

/** Prozent richtig je Lerntag (nur Tage mit Antworten), höchstens die letzten `max` Tage. */
export function learningCurve(
  attempts: LAttempt[],
  questionIds: Set<string>,
  max = 12,
): CurvePoint[] {
  const days = new Map<string, { sum: number; n: number }>();
  for (const a of attempts) {
    if (!a.question_id || !questionIds.has(a.question_id) || !counts(a)) continue;
    const k = dayKey(a.created_at);
    const d = days.get(k) ?? { sum: 0, n: 0 };
    d.sum += Number(a.score);
    d.n += 1;
    days.set(k, d);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-max)
    .map(([day, d]) => ({ day, pct: Math.round((d.sum / d.n) * 100), n: d.n }));
}

export interface ExamSession {
  sessionId: string;
  examId: string;
  name: string;
  at: string;
  pct: number;
  grade: GradeStep;
  attempts: LAttempt[];
}

/** Alle abgeschlossenen Prüfungen eines Fachs, neueste zuerst. */
export function examSessions(
  subject: LSubject,
  attempts: LAttempt[],
  questions: LQuestion[],
): ExamSession[] {
  const ownQs = questions.filter((q) => q.subject_id === subject.id);
  const own = new Set(ownQs.map((q) => q.id));
  const names = new Map(
    [...subjectExams(subject), ...activeExams(subject, ownQs)].map((e) => [e.id, e.name]),
  );
  const grading = subjectGrading(subject);
  const map = new Map<string, LAttempt[]>();
  for (const a of attempts) {
    if (a.meta?.mode !== "pruefung" || !a.session_id || !a.question_id || !own.has(a.question_id))
      continue;
    const list = map.get(a.session_id) ?? [];
    list.push(a);
    map.set(a.session_id, list);
  }
  return [...map.entries()]
    .map(([sessionId, list]) => {
      const sum = list.reduce((s, a) => s + Number(a.score ?? 0), 0);
      const pct = Math.round((sum / list.length) * 100);
      const examId = list[0]?.meta?.exam_id ?? "zufall";
      return {
        sessionId,
        examId,
        name: names.get(examId) ?? "Zufällige Prüfung",
        at: list.reduce((m, a) => (a.created_at > m ? a.created_at : m), ""),
        pct,
        grade: gradeFor(pct, grading),
        attempts: list,
      };
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Durchschnittsnote über den jeweils letzten Versuch jeder Prüfung. */
export function averageGrade(sessions: ExamSession[]): number | null {
  const latest = new Map<string, ExamSession>();
  for (const s of sessions) if (!latest.has(s.examId)) latest.set(s.examId, s);
  if (!latest.size) return null;
  const sum = [...latest.values()].reduce((x, s) => x + s.grade.grade, 0);
  return Math.round((sum / latest.size) * 10) / 10;
}

export const formatGrade = (g: number) => g.toFixed(1).replace(".", ",");

export interface Mastery {
  total: number;
  good: number;
  bad: number;
}

export function masteryOf(questions: LQuestion[], latest: Map<string, number>): Mastery {
  let good = 0;
  let bad = 0;
  for (const q of questions) {
    const s = latest.get(q.id);
    if (s === undefined) continue;
    if (s >= 1) good++;
    else bad++;
  }
  return { total: questions.length, good, bad };
}

export interface Focus {
  key: string;
  label: string;
  good: number;
  practiced: number;
  questionIds: string[];
}

/**
 * Stärken und Baustellen nach Stichwort (Tags), ersatzweise nach Themengebiet.
 * Berücksichtigt nur, was schon mehrmals geübt wurde.
 */
export function focusAreas(
  questions: LQuestion[],
  topics: LTopic[],
  latest: Map<string, number>,
): { strong: Focus[]; weak: Focus[] } {
  const groups = new Map<string, Focus>();
  const add = (key: string, label: string, q: LQuestion, s: number) => {
    const g = groups.get(key) ?? { key, label, good: 0, practiced: 0, questionIds: [] };
    g.practiced += 1;
    if (s >= 1) g.good += 1;
    g.questionIds.push(q.id);
    groups.set(key, g);
  };
  const generic = new Set(["Fallbeispiel", "Fallvignette", "Verknüpfung", "Grundlagen", "Praxis"]);
  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  for (const q of questions) {
    const s = latest.get(q.id);
    if (s === undefined) continue;
    const tags = (q.content.meta?.tags ?? []).filter((t) => !generic.has(t));
    if (tags.length) for (const t of tags) add(`tag:${t}`, t, q, s);
    else if (q.topic_id)
      add(`topic:${q.topic_id}`, topicName.get(q.topic_id) ?? "Ohne Thema", q, s);
  }
  const list = [...groups.values()].filter((g) => g.practiced >= 2);
  const rate = (g: Focus) => g.good / g.practiced;
  const strong = list
    .filter((g) => rate(g) >= 0.85 && g.practiced >= 3)
    .sort((a, b) => rate(b) - rate(a) || b.practiced - a.practiced)
    .slice(0, 5);
  const weak = list
    .filter((g) => rate(g) < 0.7)
    .sort((a, b) => rate(a) - rate(b) || b.practiced - a.practiced)
    .slice(0, 4);
  return { strong, weak };
}

/** „heute“, „gestern“, Wochentag oder „vor x Wochen“ – bewusst ohne Datum. */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5,
  );
  if (days <= 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return d.toLocaleDateString("de-AT", { weekday: "long" });
  const w = Math.round(days / 7);
  return w <= 1 ? "Vor einer Woche" : `Vor ${w} Wochen`;
}
