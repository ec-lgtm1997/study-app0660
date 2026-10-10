import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QuestionView, questionTitle } from "@/components/learn/QuestionView";
import { Bar, Card, Chip, Page, Spinner, primaryBtn, secondaryBtn } from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { aiAvailable, gradeOpenAnswer, type AiResult } from "@/lib/ai-grade.functions";
import {
  DIFFICULTY_LABEL,
  buildRound,
  clozeBlanks,
  emptyAnswer,
  grade,
  isAnswerReady,
  isExamRelevant,
  saveAttempt,
  solutionLines,
  type Answer,
  type LQuestion,
  type Mode,
} from "@/lib/learn";

const MODES: Mode[] = ["thema", "simulation", "relevant", "wiederholen"];

interface Search {
  mode: Mode;
  topic?: string | undefined;
}

export const Route = createFileRoute("/lernen/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: MODES.includes(s["mode"] as Mode) ? (s["mode"] as Mode) : "simulation",
    topic: typeof s["topic"] === "string" ? s["topic"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Lernen — Lernplattform" }] }),
  component: LernenSeite,
});

function LernenSeite() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const [run, setRun] = useState(0);
  const navigate = useNavigate();
  const restart = (mode: Mode) => {
    void navigate({ to: "/lernen/$id", params: { id }, search: { mode } });
    setRun((r) => r + 1);
  };
  return (
    <Player
      key={`${search.mode}-${search.topic ?? ""}-${run}`}
      subjectId={id}
      mode={search.mode}
      topicId={search.topic}
      onRestart={restart}
    />
  );
}

interface Result {
  q: LQuestion;
  score: number;
}

function Player({
  subjectId,
  mode,
  topicId,
  onRestart,
}: {
  subjectId: string;
  mode: Mode;
  topicId?: string | undefined;
  onRestart: (mode: Mode) => void;
}) {
  const { data, latest, clientId, query } = useLearnData();
  const queryClient = useQueryClient();
  const [round, setRound] = useState<LQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [ai, setAi] = useState<{ loading: boolean; result: AiResult | null }>({
    loading: false,
    result: null,
  });
  const aiQuery = useQuery({
    queryKey: ["ai-available"],
    queryFn: () => aiAvailable(),
    staleTime: Infinity,
    retry: false,
  });
  const aiOn = aiQuery.data?.available === true;
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()),
  );
  const simulation = mode === "simulation";

  // Runde genau einmal zusammenstellen, sobald die Daten da sind
  useEffect(() => {
    if (!data || round || query.isFetching) return;
    const qs = data.questions.filter((q) => q.subject_id === subjectId);
    const r = buildRound(mode, qs, latest, topicId);
    setRound(r);
    if (r[0]) setAnswer(emptyAnswer(r[0]));
  }, [data, latest, round, mode, subjectId, topicId, query.isFetching]);

  const topicName = useMemo(() => new Map((data?.topics ?? []).map((t) => [t.id, t.name])), [data]);
  const subject = data?.subjects.find((s) => s.id === subjectId);
  const title =
    mode === "thema"
      ? (topicName.get(topicId ?? "") ?? "Thema")
      : mode === "simulation"
        ? "Prüfungssimulation"
        : mode === "relevant"
          ? "Prüfungsrelevant"
          : "Wiederholen";

  if (!data || !round) {
    return (
      <Page>
        <Spinner label="Runde wird vorbereitet …" />
      </Page>
    );
  }

  if (round.length === 0) {
    return (
      <Page>
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-bold">Hier gibt es gerade nichts zu üben.</p>
          <p className="text-sm text-lp-muted">
            {mode === "wiederholen"
              ? "Alle Fragen sitzen – stark!"
              : "Für diese Auswahl sind noch keine Fragen hinterlegt."}
          </p>
          <Link to="/fach/$id" params={{ id: subjectId }} className={secondaryBtn}>
            Zurück zum Fach
          </Link>
        </Card>
      </Page>
    );
  }

  const finished = index >= round.length;
  if (finished) {
    return (
      <ResultView
        results={results}
        title={title}
        subjectId={subjectId}
        topicName={topicName}
        onRepeatWrong={() => onRestart("wiederholen")}
      />
    );
  }

  const q = round[index] as LQuestion;
  const a = answer ?? emptyAnswer(q);
  const meta = q.content.meta ?? {};
  const isOpen = q.type === "open";
  const current = results.length > index ? results[index] : null;

  const record = (score: number, extraMeta?: Record<string, unknown>) => {
    setResults((r) => [...r, { q, score }]);
    if (clientId) {
      saveAttempt({
        questionId: q.id,
        clientId,
        sessionId,
        answer: a,
        score,
        mode,
        extraMeta,
      }).catch(() => setSaveError(true));
    }
  };

  const next = () => {
    const n = index + 1;
    setIndex(n);
    setRevealed(false);
    setAi({ loading: false, result: null });
    if (round[n]) setAnswer(emptyAnswer(round[n]));
    else void queryClient.invalidateQueries({ queryKey: ["learn"] });
    window.scrollTo({ top: 0 });
  };

  const check = () => {
    if (isOpen) {
      setRevealed(true);
      return;
    }
    const score = grade(q, a);
    record(score);
    if (simulation) next();
    else setRevealed(true);
  };

  const dontKnow = () => {
    if (isOpen) {
      setRevealed(true);
      return;
    }
    record(0);
    if (simulation) next();
    else setRevealed(true);
  };

  const askAi = async () => {
    if (a.kind !== "open" || !a.text.trim()) return;
    setAi({ loading: true, result: null });
    let result: AiResult;
    try {
      result = await gradeOpenAnswer({
        data: {
          question: q.content.text ?? "",
          keyPoints: q.solution.key_points ?? [],
          modelAnswer: q.solution.model_answer ?? "",
          userAnswer: a.text,
        },
      });
    } catch {
      result = { ok: false, reason: "error" };
    }
    setAi({ loading: false, result });
    setRevealed(true);
  };

  const aiGrade = ai.result?.ok ? ai.result.grade : null;

  const rate = (score: number) => {
    record(score, aiGrade ? { ai_grade: aiGrade } : undefined);
    next();
  };

  const suggested = (g: "wrong" | "partial" | "correct") =>
    aiGrade === g ? " ring-2 ring-offset-2 ring-lp-ink" : "";

  const ready = isAnswerReady(q, a);

  return (
    <Page>
      <div className="flex items-center gap-3">
        <Link
          to="/fach/$id"
          params={{ id: subjectId }}
          aria-label="Runde beenden"
          className="inline-flex size-11 flex-none items-center justify-center rounded-full text-lp-ink-3 hover:bg-lp-surface"
        >
          <X className="size-5" strokeWidth={2.2} />
        </Link>
        <div className="flex-1">
          <Bar pct={(index / round.length) * 100} />
        </div>
        <span className="text-sm font-bold text-lp-ink-3">
          {index + 1} / {round.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {q.topic_id && topicName.get(q.topic_id) ? <Chip>{topicName.get(q.topic_id)}</Chip> : null}
        {meta.difficulty ? <Chip>{DIFFICULTY_LABEL[meta.difficulty] ?? ""}</Chip> : null}
        {isExamRelevant(q) ? <Chip tone="sage">Prüfungsrelevant</Chip> : null}
      </div>

      <h1 className="text-[21px] font-bold leading-snug sm:text-[22px]">{questionTitle(q)}</h1>

      <QuestionView
        q={q}
        answer={a}
        onChange={setAnswer}
        revealed={revealed}
        aiHits={ai.result?.ok ? ai.result.hits : null}
      />

      {revealed && isOpen && ai.result ? <AiCard result={ai.result} /> : null}

      {revealed && !isOpen && current ? <Feedback q={q} score={current.score} /> : null}

      {saveError ? (
        <p className="text-xs text-lp-warn-ink">
          Hinweis: Der Fortschritt konnte gerade nicht gespeichert werden. Du kannst trotzdem
          weiterlernen.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {revealed && isOpen ? (
          <>
            <p className="text-center text-[15px] font-bold">
              {aiGrade ? "Übernimmst du die Einschätzung?" : "Wie gut war deine Antwort?"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => rate(0)}
                className={`min-h-[52px] rounded-[14px] border-[1.5px] border-lp-warn bg-lp-surface text-sm font-bold text-lp-warn-ink hover:bg-lp-warn-soft${suggested("wrong")}`}
              >
                Falsch
              </button>
              <button
                type="button"
                onClick={() => rate(0.5)}
                className={`min-h-[52px] rounded-[14px] border-[1.5px] border-[#9aa6a2] bg-lp-surface text-sm font-bold text-lp-ink-2 hover:bg-lp-bg${suggested("partial")}`}
              >
                Teilweise
              </button>
              <button
                type="button"
                onClick={() => rate(1)}
                className={`min-h-[52px] rounded-[14px] bg-lp-sage text-sm font-bold text-white hover:bg-lp-sage-dark${suggested("correct")}`}
              >
                Richtig
              </button>
            </div>
          </>
        ) : revealed ? (
          <button type="button" onClick={next} className={primaryBtn}>
            {index + 1 === round.length ? "Zur Auswertung" : "Weiter"}
          </button>
        ) : isOpen && aiOn && a.kind === "open" && a.text.trim() ? (
          <>
            <button
              type="button"
              onClick={() => void askAi()}
              disabled={ai.loading}
              className={`${primaryBtn} gap-2`}
            >
              <Sparkles className="size-[18px]" strokeWidth={2.2} />
              {ai.loading ? "Antwort wird geprüft …" : "Antwort prüfen lassen"}
            </button>
            <button
              type="button"
              onClick={check}
              disabled={ai.loading}
              className="min-h-11 text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
            >
              Nur Lösung anzeigen
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={check}
              disabled={!isOpen && !ready}
              className={primaryBtn}
            >
              {isOpen ? "Lösung anzeigen" : simulation ? "Weiter" : "Prüfen"}
            </button>
            {!(isOpen && a.kind === "open" && a.text.trim()) ? (
              <button
                type="button"
                onClick={dontKnow}
                className="min-h-11 text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
              >
                {simulation && !isOpen ? "Überspringen" : "Weiß ich nicht"}
              </button>
            ) : null}
          </>
        )}
      </div>
      {subject ? (
        <p className="text-center text-xs text-lp-muted">
          {subject.name} · {title}
        </p>
      ) : null}
    </Page>
  );
}

function AiCard({ result }: { result: AiResult }) {
  if (!result.ok) {
    const msg =
      result.reason === "limit"
        ? "Die KI macht gerade eine kurze Pause (Tageslimit erreicht). Vergleiche selbst mit den Kernpunkten."
        : result.reason === "not_configured"
          ? "Die KI-Prüfung ist noch nicht eingerichtet. Vergleiche selbst mit den Kernpunkten."
          : "Die KI war gerade nicht erreichbar. Vergleiche selbst mit den Kernpunkten.";
    return <p className="text-sm text-lp-muted">{msg}</p>;
  }
  const label =
    result.grade === "correct"
      ? "Richtig"
      : result.grade === "partial"
        ? "Teilweise richtig"
        : "Noch nicht ganz";
  const color = result.grade === "correct" ? "text-lp-sage" : "text-lp-warn-ink";
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] border border-lp-line bg-lp-surface p-4">
      <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-lp-ink-3">
        <Sparkles className="size-4" strokeWidth={2.2} /> KI-Einschätzung
      </span>
      <span className={`text-[17px] font-extrabold ${color}`}>{label}</span>
      {result.feedback ? (
        <p className="text-sm leading-relaxed text-lp-ink-2">{result.feedback}</p>
      ) : null}
      <span className="text-xs text-lp-muted">
        Die KI kann sich irren – du entscheidest unten selbst.
      </span>
    </div>
  );
}

function Feedback({ q, score }: { q: LQuestion; score: number }) {
  const label = score === 1 ? "Richtig!" : score > 0 ? "Teilweise richtig" : "Nicht ganz";
  const color = score === 1 ? "text-lp-sage" : "text-lp-warn-ink";
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] border border-lp-line bg-lp-surface p-4">
      <span className={`text-[15px] font-extrabold ${color}`}>{label}</span>
      {q.solution.explanation ? (
        <p className="text-sm leading-relaxed text-lp-ink-2">{q.solution.explanation}</p>
      ) : null}
      {q.content.meta?.source ? (
        <span className="text-xs text-lp-muted">Quelle: {q.content.meta.source}</span>
      ) : null}
    </div>
  );
}

/** Kurzfassung der richtigen Lösung für die Auswertung. */
function ResultView({
  results,
  title,
  subjectId,
  topicName,
  onRepeatWrong,
}: {
  results: Result[];
  title: string;
  subjectId: string;
  topicName: Map<string, string>;
  onRepeatWrong: () => void;
}) {
  const n = results.length;
  const sum = results.reduce((s, r) => s + r.score, 0);
  const pct = n ? Math.round((sum / n) * 100) : 0;
  const right = results.filter((r) => r.score === 1).length;
  const wrong = results.filter((r) => r.score < 1);

  const byTopic = new Map<string, { name: string; sum: number; n: number }>();
  for (const r of results) {
    const key = r.q.topic_id ?? "–";
    const e = byTopic.get(key) ?? { name: topicName.get(key) ?? "Ohne Thema", sum: 0, n: 0 };
    e.sum += r.score;
    e.n += 1;
    byTopic.set(key, e);
  }

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
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Runde geschafft</h1>
        <p className="text-[15px] text-lp-ink-3">
          {right} von {n} Fragen richtig · {title}
        </p>
      </div>

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
            {wrong.length} {wrong.length === 1 ? "Frage" : "Fragen"} zum Wiederholen
          </span>
          {wrong.map(({ q }) => (
            <details key={q.id} className="group rounded-xl bg-lp-bg px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-start gap-2.5 text-sm leading-snug text-lp-ink-2">
                <span className="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full bg-lp-warn-soft text-lp-warn">
                  <X className="size-3" strokeWidth={3.2} />
                </span>
                <span className="flex-1">{questionTitle(q) || q.content.text}</span>
              </summary>
              {
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
              }
            </details>
          ))}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-lp-ink-2">Alles richtig – richtig stark!</p>
        </Card>
      )}

      <div className="mt-auto flex flex-col gap-2.5">
        {wrong.length ? (
          <button type="button" onClick={onRepeatWrong} className={primaryBtn}>
            Falsche jetzt wiederholen
          </button>
        ) : null}
        <Link to="/fach/$id" params={{ id: subjectId }} className={secondaryBtn}>
          Zurück zum Fach
        </Link>
      </div>
    </Page>
  );
}
