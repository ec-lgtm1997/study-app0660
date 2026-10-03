import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Bar, Card, Chip, Page, Spinner } from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { isExamRelevant, progressOf } from "@/lib/learn";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Lernplattform" }] }),
  component: Startseite,
});

const continueBtn =
  "inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-lp-sage px-5 text-[15px] font-bold text-white hover:bg-lp-sage-dark";

function Startseite() {
  const { data, latest, query } = useLearnData();

  const subjects = useMemo(() => {
    if (!data) return [];
    return data.subjects
      .map((s) => {
        const qs = data.questions.filter((q) => q.subject_id === s.id);
        return {
          ...s,
          topicCount: data.topics.filter((t) => t.subject_id === s.id).length,
          relevant: qs.filter(isExamRelevant).length,
          progress: progressOf(qs, latest),
        };
      })
      .filter((s) => s.progress.total > 0);
  }, [data, latest]);

  const last = useMemo(() => {
    if (!data || !data.attempts.length) return null;
    const qid = data.attempts.at(-1)?.question_id;
    const q = data.questions.find((x) => x.id === qid);
    const subject = data.subjects.find((s) => s.id === q?.subject_id);
    const topic = data.topics.find((t) => t.id === q?.topic_id);
    return subject ? { subject, topic } : null;
  }, [data]);

  const repeat = useMemo(
    () =>
      subjects
        .filter((s) => s.progress.wrong > 0)
        .sort((a, b) => b.progress.wrong - a.progress.wrong)[0] ?? null,
    [subjects],
  );

  return (
    <Page>
      <header className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-lp-muted">Lernbereich</p>
        <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]">
          Was lernst du heute?
        </h1>
      </header>

      {query.isLoading || !data ? <Spinner /> : null}
      {query.isError ? (
        <p className="text-sm text-lp-warn-ink">
          Die Inhalte konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      ) : null}

      {last ? (
        <section className="flex flex-col gap-3.5 rounded-[20px] bg-lp-sage-soft p-5">
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-lp-sage">
              Weitermachen
            </p>
            <p className="text-lg font-bold">
              {last.subject.name}
              {last.topic ? ` · ${last.topic.name}` : ""}
            </p>
          </div>
          {last.topic ? (
            <Link
              to="/lernen/$id"
              params={{ id: last.subject.id }}
              search={{ mode: "thema", topic: last.topic.id }}
              className={continueBtn}
            >
              Fortsetzen <ChevronRight className="size-4" strokeWidth={2.6} />
            </Link>
          ) : (
            <Link to="/fach/$id" params={{ id: last.subject.id }} className={continueBtn}>
              Fortsetzen <ChevronRight className="size-4" strokeWidth={2.6} />
            </Link>
          )}
        </section>
      ) : null}

      {data ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold">Deine Fächer</h2>
          {subjects.length === 0 ? (
            <Card>
              <p className="text-sm text-lp-muted">Hier erscheinen bald deine Fächer.</p>
            </Card>
          ) : null}
          {subjects.map((s) => {
            const p = s.progress;
            return (
              <Link
                key={s.id}
                to="/fach/$id"
                params={{ id: s.id }}
                className="flex flex-col gap-3 rounded-[20px] border border-lp-line bg-lp-surface p-[18px] transition-colors hover:border-lp-sage-line"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-bold">{s.name}</span>
                    <span className="text-sm text-lp-muted">
                      {s.topicCount} {s.topicCount === 1 ? "Themengebiet" : "Themengebiete"} ·{" "}
                      {p.total} Fragen
                    </span>
                  </div>
                  {s.relevant > 0 ? <Chip tone="sage">{s.relevant} prüfungsrelevant</Chip> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Bar pct={(p.practiced / p.total) * 100} />
                  <span className="text-[13px] text-lp-muted">
                    {p.practiced === 0
                      ? "Noch nicht begonnen"
                      : `${p.practiced} von ${p.total} geübt · ${p.correctPct} % richtig`}
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}

      {repeat ? (
        <section className="flex items-center gap-3.5 rounded-[20px] border border-lp-line bg-lp-surface px-[18px] py-4">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">
              {repeat.progress.wrong} {repeat.progress.wrong === 1 ? "Frage" : "Fragen"} zum
              Wiederholen
            </span>
            <span className="text-[13px] text-lp-muted">
              {repeat.name} · zuletzt nicht ganz richtig
            </span>
          </div>
          <Link
            to="/lernen/$id"
            params={{ id: repeat.id }}
            search={{ mode: "wiederholen" }}
            className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-lp-sage px-4 text-sm font-bold text-lp-sage hover:bg-lp-sage-soft"
          >
            Wiederholen
          </Link>
        </section>
      ) : null}
    </Page>
  );
}
