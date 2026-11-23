import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Back,
  GradeBadge,
  LearningCurve,
  Mastery,
  MasteryLegend,
  Page,
  SectionTitle,
  Spinner,
  Stat,
  linkBtn,
} from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { deleteSubject } from "@/lib/db";
import { activeExams, examFormat, formatLabel, formatPool } from "@/lib/exams";
import {
  QUESTION_TYPES,
  dueQuestions,
  isExamRelevant,
  practiceTypes,
  progressOf,
  updateSubjectConfig,
  type LSubject,
} from "@/lib/learn";
import { averageGrade, examSessions, formatGrade, learningCurve, masteryOf } from "@/lib/stats";

export const Route = createFileRoute("/fach/$id")({
  head: () => ({ meta: [{ title: "Fach — Lernplattform" }] }),
  component: FachSeite,
});

const tile =
  "flex flex-col gap-0.5 rounded-[18px] border border-lp-line bg-lp-surface px-4 py-3.5 transition-colors hover:border-lp-sage-line";

function FachSeite() {
  const { id } = Route.useParams();
  const { data, latest, states } = useLearnData();
  const [formatOpen, setFormatOpen] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const subject = data.subjects.find((s) => s.id === id);
    if (!subject) return null;
    const questions = data.questions.filter((q) => q.subject_id === id);
    const topics = data.topics
      .filter((t) => t.subject_id === id)
      .map((t) => {
        const qs = questions.filter((q) => q.topic_id === t.id);
        return { ...t, mastery: masteryOf(qs, latest), progress: progressOf(qs, latest) };
      })
      .filter((t) => t.mastery.total > 0);
    const sessions = examSessions(subject, data.attempts, data.questions);
    const types = practiceTypes(subject);
    const pool = types ? questions.filter((q) => types.includes(q.type)) : questions;
    const format = examFormat(subject);
    const exams = activeExams(subject, questions).map((e) => {
      const runs = sessions.filter((s) => s.examId === e.id);
      return { ...e, runs: runs.length, last: runs[0] ?? null };
    });
    return {
      subject,
      topics,
      exams,
      sessions,
      avg: averageGrade(sessions),
      curve: learningCurve(data.attempts, new Set(questions.map((q) => q.id))),
      progress: progressOf(questions, latest),
      relevant: pool.filter(isExamRelevant).length,
      due: dueQuestions(pool, states).length,
      types,
      typeCounts: new Map(
        QUESTION_TYPES.map(([t]) => [t, questions.filter((q) => q.type === t).length]),
      ),
      format,
      formatCount: formatPool(format, questions).length,
    };
  }, [data, latest, states, id]);

  return (
    <Page>
      <header className="flex flex-col gap-2">
        <Back to="/">Fächer</Back>
        {view ? (
          <h1 className="text-[31px] font-extrabold leading-[1.05] tracking-[-0.025em]">
            {view.subject.name}
          </h1>
        ) : null}
      </header>

      {!data ? <Spinner /> : null}
      {data && !view ? (
        <p className="text-sm text-lp-muted">Dieses Fach gibt es nicht (mehr).</p>
      ) : null}

      {view ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              value={`${Math.round((view.progress.practiced / view.progress.total) * 100)} %`}
              label="geübt"
            />
            <Stat
              value={view.progress.correctPct === null ? "–" : `${view.progress.correctPct} %`}
              label="richtig"
            />
            <Stat value={view.avg === null ? "–" : formatGrade(view.avg)} label="Ø Note" />
          </div>

          <LearningCurve points={view.curve} />

          <TypeFilter subject={view.subject} selected={view.types} counts={view.typeCounts} />

          <div className="grid grid-cols-2 gap-2">
            {view.relevant > 0 ? (
              <Link to="/lernen/$id" params={{ id }} search={{ mode: "relevant" }} className={tile}>
                <span className="text-[15px] font-bold">Prüfungsrelevant</span>
                <span className="text-[13px] text-lp-muted">{view.relevant} Fragen</span>
              </Link>
            ) : (
              <Link
                to="/lernen/$id"
                params={{ id }}
                search={{ mode: "simulation" }}
                className={tile}
              >
                <span className="text-[15px] font-bold">Gemischt üben</span>
                <span className="text-[13px] text-lp-muted">20 Fragen</span>
              </Link>
            )}
            {view.due > 0 ? (
              <Link
                to="/lernen/$id"
                params={{ id }}
                search={{ mode: "wiederholen" }}
                className={tile}
              >
                <span className="text-[15px] font-bold">Wiederholen</span>
                <span className="text-[13px] text-lp-muted">
                  {view.due} {view.due === 1 ? "Frage" : "Fragen"}
                </span>
              </Link>
            ) : (
              <div className={`${tile} opacity-70 hover:border-lp-line`}>
                <span className="text-[15px] font-bold">Wiederholen</span>
                <span className="text-[13px] text-lp-muted">Gerade nichts offen</span>
              </div>
            )}
          </div>

          <section className="flex flex-col gap-3">
            <SectionTitle
              action={
                <Link to="/pruefung/$id" params={{ id }} className={linkBtn}>
                  Zufällige Prüfung
                </Link>
              }
            >
              Prüfungen
            </SectionTitle>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px] text-lp-muted">
              <span>{formatLabel(view.format, TYPE_LABEL)}</span>
              <button
                type="button"
                onClick={() => setFormatOpen((v) => !v)}
                className="font-semibold text-lp-sage hover:text-lp-sage-dark"
              >
                {formatOpen ? "Schließen" : "Format ändern"}
              </button>
            </div>
            {formatOpen ? (
              <FormatEditor
                subject={view.subject}
                counts={view.typeCounts}
                onDone={() => setFormatOpen(false)}
              />
            ) : null}
            {view.exams.length === 0 ? (
              <Link
                to="/pruefung/$id"
                params={{ id }}
                className="mt-1 flex items-center gap-3 rounded-[18px] bg-lp-sage px-4 py-4 text-lp-on-sage hover:bg-lp-sage-dark"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-bold">Prüfung schreiben</span>
                  <span className="text-[13px] opacity-85">
                    {view.formatCount
                      ? `${Math.min(view.format.size, view.formatCount)} Fragen, Note am Ende`
                      : "Zu diesem Format gibt es noch keine Fragen"}
                  </span>
                </div>
                <ChevronRight className="size-5" strokeWidth={2.4} />
              </Link>
            ) : (
              <ul className="mt-1 grid grid-cols-2 gap-2">
                {view.exams.map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/pruefung/$id"
                      params={{ id }}
                      search={{ exam: e.id }}
                      className="flex min-h-[64px] items-center gap-2 rounded-[18px] border border-lp-line bg-lp-surface px-3.5 py-3 transition-colors hover:border-lp-sage-line"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-bold">{e.name}</span>
                        <span className="text-xs text-lp-muted">
                          {e.last
                            ? `${e.last.pct} %${e.runs > 1 ? `, ${e.runs} Versuche` : ""}`
                            : `${e.questions.length} Fragen`}
                        </span>
                      </div>
                      <GradeBadge grade={e.last ? e.last.grade.grade : null} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {view.sessions.length ? (
              <Link
                to="/verlauf/$id"
                params={{ id }}
                className="flex items-center justify-between rounded-[18px] px-1 py-1 text-sm font-semibold text-lp-sage hover:text-lp-sage-dark"
              >
                Dein Verlauf und alle Ergebnisse
                <ChevronRight className="size-4" strokeWidth={2.4} />
              </Link>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>Themengebiete</SectionTitle>
            <ul className="mt-1 overflow-hidden rounded-[22px] border border-lp-line bg-lp-surface">
              {view.topics.map((t) => (
                <li key={t.id} className="border-b border-lp-line last:border-b-0">
                  <Link
                    to="/lernen/$id"
                    params={{ id }}
                    search={{ mode: "thema", topic: t.id }}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-3 hover:bg-lp-bg"
                  >
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex justify-between gap-2">
                        <span className="text-[15px] font-semibold">{t.name}</span>
                        <span className="whitespace-nowrap text-[13px] text-lp-muted">
                          {t.progress.practiced}/{t.progress.total}
                        </span>
                      </div>
                      <Mastery {...t.mastery} />
                    </div>
                    <ChevronRight className="size-4 flex-none text-lp-muted" />
                  </Link>
                </li>
              ))}
            </ul>
            <MasteryLegend />
          </section>

          <DeleteSubject
            id={id}
            name={view.subject.name}
            questions={view.progress.total}
            exams={view.sessions.length}
          />
        </>
      ) : null}
    </Page>
  );
}

const TYPE_LABEL: Record<string, string> = Object.fromEntries(QUESTION_TYPES);

const chip = (on: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[13px] font-semibold transition-colors ${
    on
      ? "border-lp-sage bg-lp-sage-soft text-lp-sage"
      : "border-lp-line bg-lp-surface text-lp-ink-3 hover:border-lp-sage-line"
  }`;

/** Welche Fragetypen beim Üben drankommen (gilt für alle Übungsrunden des Fachs). */
function TypeFilter({
  subject,
  selected,
  counts,
}: {
  subject: LSubject;
  selected: string[] | null;
  counts: Map<string, number>;
}) {
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<string[] | null>(selected);
  const available = QUESTION_TYPES.filter(([t]) => (counts.get(t) ?? 0) > 0);
  if (available.length < 2) return null;

  const save = (next: string[] | null) => {
    const value = next && next.length && next.length < available.length ? next : null;
    setLocal(value);
    updateSubjectConfig(subject.id, { practice_types: value })
      .then(() => queryClient.invalidateQueries({ queryKey: ["learn"] }))
      .catch(() => setLocal(selected));
  };
  const toggle = (t: string) => {
    const cur = local ?? [];
    save(cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  };

  return (
    <section className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-lp-ink-3">Beim Üben</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={!local}
          onClick={() => save(null)}
          className={chip(!local)}
        >
          Alle
        </button>
        {available.map(([t, label]) => {
          const on = Boolean(local?.includes(t));
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t)}
              className={chip(on)}
            >
              {label}
              <span className="text-xs font-normal opacity-70">{counts.get(t)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const SIZES = [10, 15, 20, 25, 30, 40];

/** Prüfungsformat: welche Fragetypen und wie viele Fragen je Prüfung. */
function FormatEditor({
  subject,
  counts,
  onDone,
}: {
  subject: LSubject;
  counts: Map<string, number>;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const current = examFormat(subject);
  const [types, setTypes] = useState<string[] | null>(current.types);
  const [size, setSize] = useState(current.size);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const available = QUESTION_TYPES.filter(([t]) => (counts.get(t) ?? 0) > 0);
  const pool = types
    ? types.reduce((n, t) => n + (counts.get(t) ?? 0), 0)
    : [...counts.values()].reduce((a, b) => a + b, 0);
  const examCount = pool === 0 ? 0 : pool <= size ? 1 : Math.max(1, Math.round(pool / size));

  const toggle = (t: string) => {
    const cur = types ?? [];
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    setTypes(next.length && next.length < available.length ? next : null);
  };

  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      await updateSubjectConfig(subject.id, { format: { types, size } });
      await queryClient.invalidateQueries({ queryKey: ["learn"] });
      onDone();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-lp-line bg-lp-surface p-4">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-lp-ink-3">
          Fragetypen wie in der echten Prüfung
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={!types}
            onClick={() => setTypes(null)}
            className={chip(!types)}
          >
            Alle
          </button>
          {available.map(([t, label]) => {
            const on = Boolean(types?.includes(t));
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={chip(on)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-lp-ink-3">Fragen je Prüfung</span>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={size === n}
              onClick={() => setSize(n)}
              className={chip(size === n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-lp-muted">
        {pool === 0
          ? "Zu dieser Auswahl gibt es keine Fragen."
          : `${pool} passende Fragen ergeben ${examCount} ${examCount === 1 ? "Prüfung" : "Prüfungen"}. Ergebnisse werden je Format getrennt gezählt, frühere bleiben im Verlauf.`}
      </p>
      {error ? (
        <p className="text-[13px] text-lp-warn-ink">
          Speichern hat nicht geklappt. Bitte noch einmal versuchen.
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || pool === 0}
        onClick={() => void save()}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-lp-sage px-4 text-sm font-bold text-lp-on-sage hover:bg-lp-sage-dark disabled:bg-lp-line disabled:text-lp-muted"
      >
        Format übernehmen
      </button>
    </div>
  );
}

/** Fach endgültig löschen – mit zweitem Schritt zur Bestätigung. */
function DeleteSubject({
  id,
  name,
  questions,
  exams,
}: {
  id: string;
  name: string;
  questions: number;
  exams: number;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setStep("busy");
    setError(null);
    try {
      await deleteSubject(id);
      await queryClient.invalidateQueries({ queryKey: ["learn"] });
      await navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("idle");
    }
  };

  if (step === "idle") {
    return (
      <div className="flex flex-col items-center gap-1 pt-6">
        <button
          type="button"
          onClick={() => setStep("confirm")}
          className="min-h-10 rounded-xl px-3 text-[13px] font-semibold text-lp-muted hover:bg-lp-warn-soft hover:text-lp-warn-ink"
        >
          Fach löschen
        </button>
        {error ? (
          <p className="text-[13px] text-lp-warn-ink">Löschen hat nicht geklappt: {error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-[22px] border border-lp-warn/40 bg-lp-warn-soft p-4">
      <p className="text-sm font-bold text-lp-warn-ink">„{name}“ endgültig löschen?</p>
      <p className="text-[13px] leading-relaxed text-lp-ink-2">
        Gelöscht werden {questions} Fragen, alle Themengebiete und Prüfungen
        {exams ? ` sowie ${exams} gespeicherte Prüfungsergebnisse` : ""} und der ganze Lernverlauf
        in diesem Fach. Das lässt sich nicht rückgängig machen.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={step === "busy"}
          onClick={() => setStep("idle")}
          className="min-h-11 flex-1 rounded-xl border-[1.5px] border-lp-line bg-lp-surface text-sm font-semibold text-lp-ink-2"
        >
          Abbrechen
        </button>
        <button
          type="button"
          disabled={step === "busy"}
          onClick={() => void run()}
          className="min-h-11 flex-1 rounded-xl bg-lp-warn text-sm font-bold text-lp-surface disabled:opacity-60"
        >
          {step === "busy" ? "Wird gelöscht …" : "Ja, löschen"}
        </button>
      </div>
    </div>
  );
}
