import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Circle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QuestionView, questionTitle } from "@/components/learn/QuestionView";
import {
  Back,
  Bar,
  Card,
  Chip,
  GradeBadge,
  Mastery,
  Page,
  SectionTitle,
  Spinner,
  primaryBtn,
  secondaryBtn,
} from "@/components/learn/ui";
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
  markForRepeat,
  saveAttempts,
  type Answer,
  type LQuestion,
} from "@/lib/learn";
import { examSessions, whenLabel } from "@/lib/stats";

interface Search {
  exam?: string | undefined;
  review?: string | undefined;
}

export const Route = createFileRoute("/pruefung/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    exam: typeof s["exam"] === "string" ? s["exam"] : undefined,
    review: typeof s["review"] === "string" ? s["review"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Prüfung — Lernplattform" }] }),
  component: PruefungSeite,
});

function PruefungSeite() {
  const { id } = Route.useParams();
  const { exam, review } = Route.useSearch();
  const [run, setRun] = useState(0);
  if (review) return <PastExam subjectId={id} sessionId={review} />;
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
        questions.map((q, i) => {
          const r = ratings[q.id];
          const hits = r?.ai?.ok ? r.ai.hits : undefined;
          return {
            questionId: q.id,
            answer: answers[i] ?? emptyAnswer(q),
            score: final[i] ?? 0,
            meta: {
              mode: "pruefung",
              exam_id: exam?.id ?? "zufall",
              ...(hits ? { hits } : {}),
            },
          };
        }),
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
          <p className="text-sm text-lp-muted">{title}</p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.025em]">
            Fast geschafft
          </h1>
          <p className="text-sm leading-relaxed text-lp-ink-3">
            {aiOn
              ? "Deine offenen Antworten sind ausgewertet. Bestätige die Bewertung oder ändere sie."
              : "Vergleiche deine offenen Antworten mit den Kernpunkten und bewerte sie selbst."}
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
                <p className="text-sm text-lp-muted">Wird ausgewertet …</p>
              ) : r.ai?.ok ? (
                <p className="text-sm leading-relaxed text-lp-ink-2">{r.ai.feedback}</p>
              ) : r.ai ? (
                <p className="text-sm text-lp-muted">
                  Die Auswertung ist gerade nicht möglich. Bitte selbst einschätzen.
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
                        <Check className="mt-0.5 size-4 flex-none text-lp-good" strokeWidth={2.4} />
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
                          ? "border-lp-sage bg-lp-sage text-lp-on-sage"
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
    const hitsOf = (q: LQuestion) => {
      const r = ratings[q.id];
      return r?.ai?.ok ? r.ai.hits : null;
    };
    return (
      <ExamResult
        questions={questions}
        answers={answers}
        scores={scores}
        hits={questions.map(hitsOf)}
        title={title}
        examId={exam?.id ?? null}
        sessionId={sessionId}
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

      <h1 className="font-lp text-[21px] font-bold leading-snug tracking-normal sm:text-[22px]">
        {questionTitle(q)}
      </h1>

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
/* Ergebnis                                                               */
/* ====================================================================== */

function GradeScale({
  pct,
  grading,
  current,
}: {
  pct: number;
  grading: GradeStep[];
  current: number;
}) {
  const asc = grading.slice().sort((a, b) => a.min - b.min);
  const pass = asc.find((s) => s.grade === 4)?.min ?? asc[1]?.min ?? 40;
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex justify-between gap-2 text-[13px]">
        <span className="font-bold">Notenschlüssel</span>
        <span className="text-lp-muted">Genügend ab {pass} %</span>
      </div>
      <div className="relative pt-4">
        <span
          className="absolute top-0 -translate-x-1/2 text-[11px] font-bold"
          style={{ left: `${Math.min(96, Math.max(4, pct))}%` }}
        >
          {pct} %
        </span>
        <span
          className="absolute bottom-[-4px] top-[13px] w-0.5 -translate-x-1/2 rounded bg-lp-ink"
          style={{ left: `${pct}%` }}
        />
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {asc.map((s, i) => {
            const upper = asc[i + 1]?.min ?? 100;
            const tone =
              s.grade === 5
                ? "bg-lp-warn-soft"
                : s.grade <= 2
                  ? "bg-lp-good-soft"
                  : "bg-lp-sage-soft";
            return (
              <i
                key={s.grade}
                className={`block ${tone} ${s.grade === current ? "outline outline-2 -outline-offset-2 outline-lp-ink-3" : ""}`}
                style={{ width: `${upper - s.min}%` }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex text-[11px] text-lp-muted">
        {asc.map((s, i) => (
          <span
            key={s.grade}
            className={s.grade === current ? "font-bold text-lp-ink" : ""}
            style={{ width: `${(asc[i + 1]?.min ?? 100) - s.min}%` }}
            title={`${s.label} ab ${s.min} %`}
          >
            {s.grade}
          </span>
        ))}
      </div>
    </Card>
  );
}

function ExamResult({
  questions,
  answers,
  scores,
  hits,
  title,
  examId,
  sessionId,
  grading,
  subjectId,
  topicName,
  saveError,
  onRestart,
  past = false,
}: {
  questions: LQuestion[];
  answers: Answer[];
  scores: number[];
  hits: (number[] | null)[];
  title: string;
  examId: string | null;
  sessionId: string;
  grading: GradeStep[];
  subjectId: string;
  topicName: Map<string, string>;
  saveError: boolean;
  onRestart?: () => void;
  past?: boolean;
}) {
  const { data } = useLearnData();
  const [reviewing, setReviewing] = useState(false);

  const n = questions.length;
  const sum = scores.reduce((s, x) => s + (Number.isNaN(x) ? 0 : x), 0);
  const pct = n ? Math.round((sum / n) * 100) : 0;
  const result = gradeFor(pct, grading);
  const points = Math.round(sum * 10) / 10;

  // Vergleich mit dem vorherigen Versuch derselben Prüfung
  const previous = useMemo(() => {
    if (!data || !examId || examId === "zufall") return null;
    const subject = data.subjects.find((s) => s.id === subjectId);
    if (!subject) return null;
    const runs = examSessions(subject, data.attempts, data.questions).filter(
      (s) => s.examId === examId,
    );
    const mine = runs.findIndex((s) => s.sessionId === sessionId);
    return mine >= 0 ? (runs[mine + 1] ?? null) : (runs[0] ?? null);
  }, [data, examId, subjectId, sessionId]);

  const byTopic = new Map<string, { name: string; good: number; n: number }>();
  questions.forEach((q, i) => {
    const key = q.topic_id ?? "–";
    const e = byTopic.get(key) ?? { name: topicName.get(key) ?? "Ohne Thema", good: 0, n: 0 };
    if ((scores[i] ?? 0) >= 1) e.good += 1;
    e.n += 1;
    byTopic.set(key, e);
  });
  const wrongIds = questions.filter((_, i) => (scores[i] ?? 0) < 1).map((q) => q.id);

  if (reviewing) {
    return (
      <ExamReview
        questions={questions}
        answers={answers}
        scores={scores}
        hits={hits}
        topicName={topicName}
        onBack={() => {
          setReviewing(false);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  const diff = previous ? pct - previous.pct : 0;

  return (
    <Page>
      {past ? (
        <Back to="/verlauf/$id" params={{ id: subjectId }}>
          Verlauf
        </Back>
      ) : (
        <Back to="/fach/$id" params={{ id: subjectId }}>
          {data?.subjects.find((s) => s.id === subjectId)?.name ?? "Fach"}
        </Back>
      )}

      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-sm text-lp-muted">
          {title} {past ? "" : "abgeschlossen"}
        </p>
        <div className="my-2">
          <GradeBadge grade={result.grade} size="lg" />
        </div>
        <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">{result.label}</h1>
        <p className="text-sm text-lp-muted">
          {pct} % richtig, {String(points).replace(".", ",")} von {n} Punkten
        </p>
      </div>

      <GradeScale pct={pct} grading={grading} current={result.grade} />

      {previous && !past ? (
        <Card className="flex items-center gap-3">
          {diff > 0 ? (
            <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-lp-good-soft font-display text-[15px] font-extrabold text-lp-good">
              +{diff}
            </span>
          ) : null}
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-bold">
              {diff > 0 ? "Besser als beim letzten Mal" : "Beim letzten Mal"}
            </span>
            <span className="text-[13px] text-lp-muted">
              {diff > 0 ? "Damals " : ""}
              {previous.pct} %, Note {previous.grade.grade}
            </span>
          </div>
        </Card>
      ) : null}

      {byTopic.size > 1 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Nach Themen</SectionTitle>
          <ul className="mt-1 overflow-hidden rounded-[22px] border border-lp-line bg-lp-surface">
            {[...byTopic.values()].map((t) => (
              <li
                key={t.name}
                className="flex flex-col gap-2 border-b border-lp-line px-4 py-3 last:border-b-0"
              >
                <div className="flex justify-between gap-2 text-sm font-semibold">
                  {t.name}
                  <span className="whitespace-nowrap text-[13px] font-normal text-lp-muted">
                    {t.good} von {t.n}
                  </span>
                </div>
                <Mastery total={t.n} good={t.good} bad={t.n - t.good} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {saveError ? (
        <p className="text-xs text-lp-warn-ink">
          Das Ergebnis konnte nicht gespeichert werden. Prüfe die Internetverbindung.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <button
          type="button"
          onClick={() => {
            setReviewing(true);
            window.scrollTo({ top: 0 });
          }}
          className={primaryBtn}
        >
          Fragen durchsehen
        </button>
        {wrongIds.length ? (
          <Link
            to="/lernen/$id"
            params={{ id: subjectId }}
            search={{ mode: "auswahl", ids: wrongIds.join(",") }}
            className={secondaryBtn}
          >
            {wrongIds.length} {wrongIds.length === 1 ? "falsche Frage" : "falsche Fragen"} üben
          </Link>
        ) : null}
        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="min-h-11 text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
          >
            Prüfung noch einmal schreiben
          </button>
        ) : null}
      </div>
    </Page>
  );
}

/* ====================================================================== */
/* Fragen durchsehen                                                      */
/* ====================================================================== */

type Filter = "alle" | "falsch" | "richtig";

function ExamReview({
  questions,
  answers,
  scores,
  hits,
  topicName,
  onBack,
}: {
  questions: LQuestion[];
  answers: Answer[];
  scores: number[];
  hits: (number[] | null)[];
  topicName: Map<string, string>;
  onBack: () => void;
}) {
  const { clientId } = useLearnData();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("alle");
  const [marked, setMarked] = useState<Set<string>>(new Set());

  const items = questions.map((q, i) => ({ q, i, score: scores[i] ?? 0 }));
  const wrong = items.filter((x) => x.score < 1);
  const right = items.filter((x) => x.score >= 1);
  const shown = filter === "falsch" ? wrong : filter === "richtig" ? right : items;

  const mark = (qid: string) => {
    if (!clientId) return;
    setMarked((m) => new Set(m).add(qid));
    markForRepeat(qid, clientId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["learn"] }))
      .catch(() =>
        setMarked((m) => {
          const n = new Set(m);
          n.delete(qid);
          return n;
        }),
      );
  };

  const tabs: [Filter, string][] = [
    ["alle", `Alle ${items.length}`],
    ["falsch", `Falsch ${wrong.length}`],
    ["richtig", `Richtig ${right.length}`],
  ];

  return (
    <Page>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex min-h-10 items-center gap-0.5 self-start rounded-lg pr-2 text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
      >
        <ChevronLeft className="size-[18px]" strokeWidth={2.2} /> Ergebnis
      </button>

      <div
        role="tablist"
        className="flex gap-1 rounded-[14px] border border-lp-line bg-lp-surface p-1"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`min-h-10 flex-1 rounded-[10px] text-sm font-semibold transition-colors ${
              filter === key ? "bg-lp-sage-soft text-lp-sage" : "text-lp-muted hover:text-lp-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <p className="text-sm text-lp-muted">Hier gibt es keine Fragen.</p>
        </Card>
      ) : null}

      {shown.map(({ q, i, score }) => {
        const h = hits[i] ?? null;
        const keyCount = q.solution.key_points?.length ?? 0;
        const status =
          q.type === "open"
            ? Array.isArray(h) && keyCount
              ? `${h.length} von ${keyCount} Punkten`
              : score >= 1
                ? "richtig"
                : score > 0
                  ? "teilweise"
                  : "falsch"
            : score >= 1
              ? "richtig"
              : score > 0
                ? "teilweise"
                : "falsch";
        const tone = score >= 1 ? "text-lp-good" : score > 0 ? "text-lp-sage" : "text-lp-warn";
        return (
          <Card key={q.id} className="flex flex-col gap-3">
            <div className="flex justify-between gap-2 text-xs text-lp-muted">
              <span>
                Frage {i + 1}
                {q.topic_id && topicName.get(q.topic_id) ? `, ${topicName.get(q.topic_id)}` : ""}
              </span>
              <span className={`font-bold ${tone}`}>{status}</span>
            </div>
            <p className="text-[15px] font-bold leading-snug">{questionTitle(q)}</p>
            <QuestionView
              q={q}
              answer={answers[i] ?? emptyAnswer(q)}
              onChange={() => undefined}
              revealed
              aiHits={h}
            />
            {q.solution.explanation ? (
              <p className="text-sm leading-relaxed text-lp-ink-3">{q.solution.explanation}</p>
            ) : null}
            <button
              type="button"
              disabled={marked.has(q.id)}
              onClick={() => mark(q.id)}
              className="self-start text-sm font-semibold text-lp-sage hover:text-lp-sage-dark disabled:text-lp-muted"
            >
              {marked.has(q.id) ? "Zum Wiederholen vorgemerkt" : "Später wiederholen"}
            </button>
          </Card>
        );
      })}
    </Page>
  );
}

/* ====================================================================== */
/* Frühere Prüfung ansehen                                                */
/* ====================================================================== */

function PastExam({ subjectId, sessionId }: { subjectId: string; sessionId: string }) {
  const { data } = useLearnData();

  const view = useMemo(() => {
    if (!data) return null;
    const subject = data.subjects.find((s) => s.id === subjectId);
    if (!subject) return null;
    const session = examSessions(subject, data.attempts, data.questions).find(
      (s) => s.sessionId === sessionId,
    );
    if (!session) return null;
    const byQ = new Map(session.attempts.map((a) => [a.question_id, a]));
    const exam = subjectExams(subject).find((e) => e.id === session.examId);
    const subjectQs = data.questions.filter((q) => q.subject_id === subjectId);
    const qById = new Map(subjectQs.map((q) => [q.id, q]));
    const ordered = exam
      ? examQuestions(exam, subjectQs).filter((q) => byQ.has(q.id))
      : session.attempts
          .map((a) => qById.get(a.question_id ?? ""))
          .filter((q): q is LQuestion => Boolean(q));
    const isAnswer = (x: unknown): x is Answer =>
      typeof x === "object" && x !== null && "kind" in x;
    return {
      session,
      grading: subjectGrading(subject),
      questions: ordered,
      answers: ordered.map((q) => {
        const a = byQ.get(q.id)?.answer;
        return isAnswer(a) ? a : emptyAnswer(q);
      }),
      scores: ordered.map((q) => Number(byQ.get(q.id)?.score ?? 0)),
      hits: ordered.map((q) => {
        const h = (byQ.get(q.id)?.meta as { hits?: unknown } | null)?.hits;
        return Array.isArray(h) ? (h as number[]) : null;
      }),
      topicName: new Map(data.topics.map((t) => [t.id, t.name])),
    };
  }, [data, subjectId, sessionId]);

  if (!data) {
    return (
      <Page>
        <Spinner />
      </Page>
    );
  }
  if (!view) {
    return (
      <Page>
        <Back to="/verlauf/$id" params={{ id: subjectId }}>
          Verlauf
        </Back>
        <p className="text-sm text-lp-muted">Diese Prüfung wurde nicht gefunden.</p>
      </Page>
    );
  }
  return (
    <ExamResult
      questions={view.questions}
      answers={view.answers}
      scores={view.scores}
      hits={view.hits}
      title={`${view.session.name}, ${whenLabel(view.session.at)}`}
      examId={view.session.examId}
      sessionId={sessionId}
      grading={view.grading}
      subjectId={subjectId}
      topicName={view.topicName}
      saveError={false}
      past
    />
  );
}
