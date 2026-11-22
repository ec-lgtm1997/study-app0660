import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { questionTitle } from "@/components/learn/QuestionView";
import {
  Back,
  Card,
  GradeBadge,
  Mastery,
  MasteryLegend,
  Page,
  SectionTitle,
  Spinner,
  primaryBtn,
} from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { progressOf } from "@/lib/learn";
import { examSessions, focusAreas, masteryOf, whenLabel } from "@/lib/stats";

export const Route = createFileRoute("/verlauf/$id")({
  head: () => ({ meta: [{ title: "Verlauf — Lernplattform" }] }),
  component: VerlaufSeite,
});

type Tab = "pruefungen" | "themen" | "fragen";

function VerlaufSeite() {
  const { id } = Route.useParams();
  const { data, latest } = useLearnData();
  const [tab, setTab] = useState<Tab>("pruefungen");

  const view = useMemo(() => {
    if (!data) return null;
    const subject = data.subjects.find((s) => s.id === id);
    if (!subject) return null;
    const questions = data.questions.filter((q) => q.subject_id === id);
    const topics = data.topics.filter((t) => t.subject_id === id);
    return {
      subject,
      sessions: examSessions(subject, data.attempts, data.questions),
      topics: topics
        .map((t) => {
          const qs = questions.filter((q) => q.topic_id === t.id);
          return { ...t, mastery: masteryOf(qs, latest), progress: progressOf(qs, latest) };
        })
        .filter((t) => t.mastery.total > 0),
      focus: focusAreas(questions, topics, latest),
      toRepeat: questions.filter((q) => {
        const s = latest.get(q.id);
        return s !== undefined && s < 1;
      }),
      topicName: new Map(topics.map((t) => [t.id, t.name])),
    };
  }, [data, latest, id]);

  const tabs: [Tab, string][] = [
    ["pruefungen", "Prüfungen"],
    ["themen", "Themen"],
    ["fragen", "Fragen"],
  ];

  const weakIds = view ? [...new Set(view.focus.weak.flatMap((f) => f.questionIds))] : [];

  return (
    <Page>
      <header className="flex flex-col gap-2">
        <Back to="/fach/$id" params={{ id }}>
          {view?.subject.name ?? "Fach"}
        </Back>
        <h1 className="text-[31px] font-extrabold leading-[1.05] tracking-[-0.025em]">
          Dein Verlauf
        </h1>
      </header>

      {!view ? <Spinner /> : null}

      {view ? (
        <>
          <div
            role="tablist"
            className="flex gap-1 rounded-[14px] border border-lp-line bg-lp-surface p-1"
          >
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`min-h-10 flex-1 rounded-[10px] text-sm font-semibold transition-colors ${
                  tab === key ? "bg-lp-sage-soft text-lp-sage" : "text-lp-muted hover:text-lp-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "pruefungen" ? (
            view.sessions.length === 0 ? (
              <Card>
                <p className="text-sm text-lp-muted">
                  Hier erscheinen deine Prüfungen, sobald du die erste abgegeben hast.
                </p>
              </Card>
            ) : (
              <ul className="overflow-hidden rounded-[22px] border border-lp-line bg-lp-surface">
                {view.sessions.map((s) => (
                  <li key={s.sessionId} className="border-b border-lp-line last:border-b-0">
                    <Link
                      to="/pruefung/$id"
                      params={{ id }}
                      search={{ review: s.sessionId }}
                      className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-lp-bg"
                    >
                      <GradeBadge grade={s.grade.grade} />
                      <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm font-bold">{s.name}</span>
                        <span className="text-xs text-lp-muted">
                          {whenLabel(s.at)}, {s.attempts.length} Fragen
                        </span>
                      </div>
                      <span className="text-sm font-bold">{s.pct} %</span>
                      <ChevronRight className="size-4 flex-none text-lp-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "themen" ? (
            <>
              <ul className="overflow-hidden rounded-[22px] border border-lp-line bg-lp-surface">
                {view.topics.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-2 border-b border-lp-line px-4 py-3 last:border-b-0"
                  >
                    <div className="flex justify-between gap-2 text-[15px] font-semibold">
                      {t.name}
                      <span className="whitespace-nowrap text-[13px] font-normal text-lp-muted">
                        {t.mastery.good} von {t.mastery.total} sitzen
                      </span>
                    </div>
                    <Mastery {...t.mastery} />
                  </li>
                ))}
              </ul>
              <MasteryLegend />
            </>
          ) : null}

          {tab === "fragen" ? (
            view.toRepeat.length === 0 ? (
              <Card>
                <p className="text-sm text-lp-muted">Gerade gibt es nichts zu wiederholen.</p>
              </Card>
            ) : (
              <>
                <ul className="overflow-hidden rounded-[22px] border border-lp-line bg-lp-surface">
                  {view.toRepeat.slice(0, 40).map((q) => (
                    <li
                      key={q.id}
                      className="flex flex-col gap-1 border-b border-lp-line px-4 py-3 last:border-b-0"
                    >
                      <span className="text-xs text-lp-muted">
                        {view.topicName.get(q.topic_id ?? "") ?? ""}
                      </span>
                      <span className="text-sm leading-snug">
                        {q.content.text?.replace(/\{\{\d+\}\}/g, "___") || questionTitle(q)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/lernen/$id"
                  params={{ id }}
                  search={{ mode: "wiederholen" }}
                  className={primaryBtn}
                >
                  {view.toRepeat.length} {view.toRepeat.length === 1 ? "Frage" : "Fragen"} üben
                </Link>
              </>
            )
          ) : null}

          {tab !== "fragen" && (view.focus.strong.length || view.focus.weak.length) ? (
            <>
              {view.focus.strong.length ? (
                <section className="flex flex-col gap-3">
                  <SectionTitle>Am stärksten</SectionTitle>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {view.focus.strong.map((f) => (
                      <span
                        key={f.key}
                        className="rounded-full border border-lp-line bg-lp-surface px-3 py-1.5 text-xs font-semibold text-lp-ink-3"
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}
              {view.focus.weak.length ? (
                <section className="flex flex-col gap-3">
                  <SectionTitle>Lohnt sich zu wiederholen</SectionTitle>
                  <ul className="mt-1 overflow-hidden rounded-[22px] border border-lp-line bg-lp-surface">
                    {view.focus.weak.map((f) => (
                      <li
                        key={f.key}
                        className="flex flex-col gap-2 border-b border-lp-line px-4 py-3 last:border-b-0"
                      >
                        <div className="flex justify-between gap-2 text-sm font-semibold">
                          {f.label}
                          <span className="whitespace-nowrap text-[13px] font-normal text-lp-muted">
                            {f.good} von {f.practiced} richtig
                          </span>
                        </div>
                        <Mastery total={f.practiced} good={f.good} bad={f.practiced - f.good} />
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/lernen/$id"
                    params={{ id }}
                    search={{ mode: "auswahl", ids: weakIds.join(",") }}
                    className={primaryBtn}
                  >
                    Diese Fragen üben
                  </Link>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
