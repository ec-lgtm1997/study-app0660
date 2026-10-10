import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Circle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QuestionView, questionTitle } from "@/components/learn/QuestionView";
import { Bar, Card, Chip, Page, Spinner, primaryBtn, secondaryBtn } from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { aiAvailable, gradeOpenAnswer, type AiResult } from "@/lib/ai-grade.functions";
import {
  EXAM_SIZE,
  examQuestions,
  gradeFor,
  subjectExams,
  subjectGrading,
  type GradeStep,
} from "@/lib/exams";
import {
  emptyAnswer,
  grade,
  isAnswerReady,
  saveAttempts,
  solutionLines,
  type Answer,
  type LQuestion,
} from "@/lib/learn";

interface Search {
  exam?: string | undefined;
}

export const Route = createFileRoute("/pruefung/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    exam: typeof s["exam"] === "string" ? s["exam"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Prüfung — Lernplattform" }] }),
  component: PruefungSeite,
});

function PruefungSeite() {
  const { id } = Route.useParams();
  const { exam } = Route.useSearch();
  const [run, setRun] = useState(0);
  return (
    <ExamPlayer
      key={`${exam ?? "zufall"}-${run}`}
      subjectId={id}
      examId={exam}
      onRestart={() => setRun((r) => r + 1)}
    />
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}

type Phase = "running" | "review" | "done";

interface OpenRating {
  ai: AiResult | null;
  loading: boolean;
  score: number | null;
}

function ExamPlayer({
  subjectId,
  examId,
  onRestart,
}: {
  subjectId: string;
  examId?: string | undefined;
  onRestart: () => void;
}) {
  const { data, clientId, query } = useLearnData();
  const queryClient = useQueryClient();
  const aiQuery = useQuery({
    queryKey: ["ai-available"],
    queryFn: () => aiAvailable(),
    staleTime: Infinity,
    retry: false,
  });
  const aiOn = aiQuery.data?.available === true;

  const [questions, setQuestions] = useState<LQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("running");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [ratings, setRatings] = useState<Record<string, OpenRating>>({});
  const [scores, setScores] = useState<number[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()),
  );

  const subject = data?.subjects.find((s) => s.id === subjectId);
  const exam = subjectExams(subject).find((e) => e.id === examId);
  const grading = subjectGrading(subject);
  const title = exam ? exam.name : "Zufällige Prüfung";

  const topicName = useMemo(() => new Map((data?.topics ?? []).map((t) => [t.id, t.name])), [data]);

  // Prüfung genau einmal zusammenstellen
  useEffect(() => {
    if (!data || questions || query.isFetching) return;
    const qs = data.questions.filter((q) => q.subject_id === subjectId);
    const list = exam ? examQuestions(exam, qs) : shuffle(qs).slice(0, EXAM_SIZE);
    setQuestions(list);
    setAnswers(list.map(emptyAnswer));
  }, [data, questions, query.isFetching, subjectId, exam]);

  if (!data || !questions) {
    return (
      <Page>
        <Spinner label="Prüfung wird vorbereitet …" />
      </Page>
    );
  }

  if (questions.length === 0) {
    return (
      <Page>
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-bold">Diese Prüfung ist noch leer.</p>
          <Link to="/fach/$id" params={{ id: subjectId }} className={secondaryBtn}>
            Zurück zum Fach
          </Link>
        </Card>
      </Page>
    );
  }

  const unanswered = questions.filter((q, i) => !isAnswerReady(q, answers[i] ?? emptyAnswer(q)));

  /* ---------------- Abgabe: geschlossene Fragen bewerten, offene vorbereiten -------------- */
  const submit = () => {
    if (unanswered.length && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    const s = questions.map((q, i) => {
      const a = answers[i] ?? emptyAnswer(q);
      if (q.type === "open") return Number.NaN; // folgt in der Auswertung
      return isAnswerReady(q, a) ? grade(q, a) : 0;
    });
    const r: Record<string, OpenRating> = {};
    questions.forEach((q, i) => {
      if (q.type !== "open") return;
      const a = answers[i];
      const text = a?.kind === "open" ? a.text.trim() : "";
      if (!text) {
        s[i] = 0;
        return;
      }
      r[q.id] = { ai: null, loading: aiOn, score: null };
    });
    setScores(s);
    setRatings(r);
    window.scrollTo({ top: 0 });
    if (Object.keys(r).length === 0) {
      finish(s);
      return;
    }
    setPhase("review");
    if (aiOn) {
      questions.forEach((q, i) => {
        if (!r[q.id]) return;
        const a = answers[i];
        gradeOpenAnswer({
          data: {
            question: q.content.text ?? "",
            keyPoints: q.solution.key_points ?? [],
            modelAnswer: q.solution.model_answer ?? "",
            userAnswer: a?.kind === "open" ? a.text : "",
          },
        })
          .catch((): AiResult => ({ ok: false, reason: "error" }))
          .then((res) =>
            setRatings((prev) => {
              const cur = prev[q.id];
              if (!cur) return prev;
              const suggestion = res.ok
                ? res.grade === "correct"
                  ? 1
                  : res.grade === "partial"
                    ? 0.5
                    : 0
                : null;
              return {
                ...prev,
                [q.id]: { ai: res, loading: false, score: cur.score ?? suggestion },
              };
            }),
          );
      });
    }
  };

  const finish = (final: number[]) => {
    setScores(final);
    setPhase("done");
    window.scrollTo({ top: 0 });
    if (clientId) {
      saveAttempts(
        questions.map((q, i) => ({
          questionId: q.id,
          answer: answers[i] ?? emptyAnswer(q),
          score: final[i] ?? 0,
          meta: { mode: "pruefung", exam_id: exam?.id ?? "zufall" },
        })),
        clientId,
        sessionId,
      )
        .then(() => queryClient.invalidateQueries({ queryKey: ["learn"] }))
        .catch(() => setSaveError(true));
    }
  };

  /* ---------------- Auswertung offener Fragen ---------------- */
  if (phase === "review") {
    const openItems = questions
      .map((q, i) => ({ q, i, r: ratings[q.id] }))
      .filter((x): x is { q: LQuestion; i: number; r: OpenRating } => Boolean(x.r));
    const allRated = openItems.every((x) => x.r.score !== null);
    const rate = (qid: string, score: number) =>
      setRatings((prev) => {
        const cur = prev[qid];
        return cur ? { ...prev, [qid]: { ...cur, score } } : prev;
      });

    return (
      <Page>
        <header className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-lp-muted">{title}</p>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
            Fast geschafft
          </h1>
          <p className="text-sm text-lp-ink-3">
            {aiOn
              ? "Die KI hat deine offenen Antworten eingeschätzt. Bestätige oder ändere die Bewertung."
              : "Vergleiche deine offenen Antworten mit den Kernpunkten und bewerte dich selbst."}
          </p>
        </header>

        {openItems.map(({ q, i, r }) => {
          const a = answers[i];
          const hits = r.ai?.ok ? r.ai.hits : null;
          return (
            <Card key={q.id} className="flex flex-col gap-3">
              <p className="text-[15px] font-bold leading-snug">{q.content.text}</p>
              <div className="rounded-xl bg-lp-bg px-3 py-2.5 text-sm leading-relaxed text-lp-ink-2">
                {a?.kind === "open" ? a.text : ""}
              </div>
              {r.loading ? (
                <p className="flex items-center gap-2 text-sm text-lp-muted">
                  <Sparkles className="size-4" /> Antwort wird eingeschätzt …
                </p>
              ) : r.ai?.ok ? (
                <p className="text-sm leading-relaxed text-lp-ink-2">
                  <span className="font-bold">KI: </span>
                  {r.ai.feedback}
                </p>
              ) : r.ai ? (
                <p className="text-sm text-lp-muted">
                  Die KI war gerade nicht erreichbar – bitte selbst einschätzen.
                </p>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {(q.solution.key_points ?? []).map((p, k) => {
                  const judged = Array.isArray(hits);
                  const hit = judged && hits.includes(k);
                  return (
                    <li key={p} className="flex items-start gap-2 text-sm text-lp-ink-2">
                      {judged && !hit ? (
                        <Circle
                          className="mt-0.5 size-4 flex-none text-lp-warn"
                          strokeWidth={2.2}
                        />
                      ) : (
                        <Check className="mt-0.5 size-4 flex-none text-lp-sage" strokeWidth={2.4} />
                      )}
                      <span>{p}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    [0, "Falsch"],
                    [0.5, "Teilweise"],
                    [1, "Richtig"],
                  ] as const
                ).map(([val, label]) => {
                  const active = r.score === val;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => rate(q.id, val)}
                      className={`min-h-12 rounded-[14px] border-[1.5px] text-sm font-bold transition-colors ${
                        active
                          ? "border-lp-sage bg-lp-sage text-white"
                          : "border-lp-line bg-lp-surface text-lp-ink-2 hover:border-lp-sage-line"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}

        <div className="mt-auto pt-2">
          <button
            type="button"
            disabled={!allRated}
            onClick={() =>
              finish(
                scores.map((s, i) => {
                  const q = questions[i] as LQuestion;
                  return Number.isNaN(s) ? (ratings[q.id]?.score ?? 0) : s;
                }),
              )
            }
            className={primaryBtn}
          >
            Ergebnis anzeigen
          </button>
        </div>
      </Page>
    );
  }

  /* ---------------- Ergebnis ---------------- */
  if (phase === "done") {
    return (
      <ExamResult
        questions={questions}
        scores={scores}
        title={title}
        grading={grading}
        subjectId={subjectId}
        topicName={topicName}
        saveError={saveError}
        onRestart={onRestart}
      />
    );
  }

  /* ---------------- Prüfung läuft (ohne Zeit, ohne Zwischenfeedback) ---------------- */
  const q = questions[index] as LQuestion;
  const a = answers[index] ?? emptyAnswer(q);
  const isLast = index === questions.length - 1;
  const setAnswer = (next: Answer) => {
    setConfirmSubmit(false);
    setAnswers((prev) => prev.map((x, i) => (i === index ? next : x)));
  };
  const go = (to: number) => {
    setIndex(to);
    setConfirmSubmit(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <Page>
      <div className="flex items-center gap-3">
        <Link
          to="/fach/$id"
          params={{ id: subjectId }}
          aria-label="Prüfung beenden"
          className="inline-flex size-11 flex-none items-center justify-center rounded-full text-lp-ink-3 hover:bg-lp-surface"
        >
          <X className="size-5" strokeWidth={2.2} />
        </Link>
        <div className="flex-1">
          <Bar pct={(index / questions.length) * 100} />
        </div>
        <span className="text-sm font-bold text-lp-ink-3">
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip tone="sage">{title}</Chip>
        {q.topic_id && topicName.get(q.topic_id) ? <Chip>{topicName.get(q.topic_id)}</Chip> : null}
      </div>

      <h1 className="text-[21px] font-bold leading-snug sm:text-[22px]">{questionTitle(q)}</h1>

      <QuestionView q={q} answer={a} onChange={setAnswer} revealed={false} />

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {isLast && confirmSubmit && unanswered.length ? (
          <p className="text-center text-sm text-lp-ink-3">
            {unanswered.length === 1
              ? "1 Frage ist noch offen."
              : `${unanswered.length} Fragen sind noch offen.`}{" "}
            Trotzdem abgeben?
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => (isLast ? submit() : go(index + 1))}
          className={primaryBtn}
        >
          {isLast ? (confirmSubmit ? "Ja, abgeben" : "Prüfung abgeben") : "Weiter"}
        </button>
        {index > 0 ? (
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="inline-flex min-h-11 items-center justify-center gap-1 text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
          >
            <ChevronLeft className="size-4" /> Vorherige Frage
          </button>
        ) : null}
      </div>
    </Page>
  );
}

/* ====================================================================== */

function ExamResult({
  questions,
  scores,
  title,
  grading,
  subjectId,
  topicName,
  saveError,
  onRestart,
}: {
  questions: LQuestion[];
  scores: number[];
  title: string;
  grading: GradeStep[];
  subjectId: string;
  topicName: Map<string, string>;
  saveError: boolean;
  onRestart: () => void;
}) {
  const n = questions.length;
  const sum = scores.reduce((s, x) => s + (Number.isNaN(x) ? 0 : x), 0);
  const pct = n ? Math.round((sum / n) * 100) : 0;
  const result = gradeFor(pct, grading);
  const passed = result.grade < 5;
  const steps = grading.slice().sort((a, b) => b.min - a.min);

  const byTopic = new Map<string, { name: string; sum: number; n: number }>();
  questions.forEach((q, i) => {
    const key = q.topic_id ?? "–";
    const e = byTopic.get(key) ?? { name: topicName.get(key) ?? "Ohne Thema", sum: 0, n: 0 };
    e.sum += scores[i] ?? 0;
    e.n += 1;
    byTopic.set(key, e);
  });
  const wrong = questions.filter((_, i) => (scores[i] ?? 0) < 1);

  const message = passed
    ? result.grade === 1
      ? "Hervorragend – das sitzt richtig gut!"
      : result.grade <= 3
        ? "Stark gemacht! Mit den markierten Fragen holst du noch mehr raus."
        : "Bestanden! Die Fragen unten zeigen dir, wo du noch nachlegen kannst."
    : "Jeder Durchgang bringt dich weiter – schau dir die Fragen unten in Ruhe an.";

  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <Page>
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="relative size-[132px]">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke="var(--color-lp-line)"
              strokeWidth="12"
            />
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke="var(--color-lp-sage)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * C} ${C}`}
              transform="rotate(-90 66 66)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[30px] font-extrabold">
            {pct} %
          </div>
        </div>
        <p className="text-sm font-semibold text-lp-muted">{title}</p>
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">
          Note {result.grade} · {result.label}
        </h1>
        <p className="max-w-sm text-[15px] text-lp-ink-3">{message}</p>
      </div>

      <Card className="flex flex-col gap-2">
        <span className="text-[15px] font-bold">Notenschlüssel</span>
        <ul className="flex flex-col">
          {steps.map((s, i) => {
            const upper = i === 0 ? 100 : (steps[i - 1]?.min ?? 100) - 1;
            const active = s.grade === result.grade;
            return (
              <li
                key={s.grade}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-lp-sage-soft font-bold text-lp-sage" : "text-lp-ink-2"
                }`}
              >
                <span>
                  {s.grade} · {s.label}
                </span>
                <span>
                  {s.min === 0 ? `unter ${steps[i - 1]?.min ?? 1} %` : `${s.min}–${upper} %`}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {byTopic.size > 1 ? (
        <Card className="flex flex-col gap-3">
          <span className="text-[15px] font-bold">Nach Themengebiet</span>
          {[...byTopic.values()].map((t) => (
            <div key={t.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-semibold">{t.name}</span>
                <span className="text-lp-ink-3">{Math.round((t.sum / t.n) * 100)} %</span>
              </div>
              <Bar size="sm" pct={(t.sum / t.n) * 100} />
            </div>
          ))}
        </Card>
      ) : null}

      {wrong.length ? (
        <Card className="flex flex-col gap-3">
          <span className="text-[15px] font-bold">
            {wrong.length} {wrong.length === 1 ? "Frage" : "Fragen"} zum Nachlesen
          </span>
          {wrong.map((q) => (
            <details key={q.id} className="rounded-xl bg-lp-bg px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-start gap-2.5 text-sm leading-snug text-lp-ink-2">
                <span className="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full bg-lp-warn-soft text-lp-warn">
                  <X className="size-3" strokeWidth={3.2} />
                </span>
                <span className="flex-1">{q.content.text || questionTitle(q)}</span>
              </summary>
              <div className="mt-2 flex flex-col gap-1 pl-[30px] text-sm text-lp-ink-2">
                {solutionLines(q).map((line) => (
                  <p key={line} className="font-semibold text-lp-sage">
                    {line}
                  </p>
                ))}
                {q.solution.explanation ? (
                  <p className="text-lp-ink-3">{q.solution.explanation}</p>
                ) : null}
              </div>
            </details>
          ))}
        </Card>
      ) : null}

      {saveError ? (
        <p className="text-xs text-lp-warn-ink">
          Hinweis: Das Ergebnis konnte gerade nicht gespeichert werden.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2.5">
        <button type="button" onClick={onRestart} className={primaryBtn}>
          Prüfung noch einmal schreiben
        </button>
        <Link to="/fach/$id" params={{ id: subjectId }} className={secondaryBtn}>
          Zurück zum Fach
        </Link>
      </div>
    </Page>
  );
}
