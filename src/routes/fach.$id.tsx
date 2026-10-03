import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Bar, Page, Spinner, Stat } from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { isExamRelevant, progressOf, ROUND_SIZE } from "@/lib/learn";

export const Route = createFileRoute("/fach/$id")({
  head: () => ({ meta: [{ title: "Fach — Lernplattform" }] }),
  component: FachSeite,
});

function FachSeite() {
  const { id } = Route.useParams();
  const { data, latest } = useLearnData();

  const view = useMemo(() => {
    if (!data) return null;
    const subject = data.subjects.find((s) => s.id === id);
    if (!subject) return null;
    const questions = data.questions.filter((q) => q.subject_id === id);
    const topics = data.topics
      .filter((t) => t.subject_id === id)
      .map((t) => {
        const qs = questions.filter((q) => q.topic_id === t.id);
        return { ...t, progress: progressOf(qs, latest) };
      })
      .filter((t) => t.progress.total > 0);
    return {
      subject,
      topics,
      progress: progressOf(questions, latest),
      relevant: questions.filter(isExamRelevant).length,
    };
  }, [data, latest, id]);

  return (
    <Page>
      <header className="flex flex-col gap-2.5">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
        >
          <ChevronLeft className="size-[18px]" strokeWidth={2.2} /> Fächer
        </Link>
        {view ? (
          <>
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">{view.subject.name}</h1>
            <p className="text-sm text-lp-muted">
              {view.progress.total} Fragen · {view.topics.length}{" "}
              {view.topics.length === 1 ? "Themengebiet" : "Themengebiete"}
            </p>
          </>
        ) : null}
      </header>

      {!data ? <Spinner /> : null}
      {data && !view ? (
        <p className="text-sm text-lp-muted">Dieses Fach gibt es nicht (mehr).</p>
      ) : null}

      {view ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat
              value={`${Math.round((view.progress.practiced / view.progress.total) * 100)} %`}
              label="geübt"
            />
            <Stat
              value={view.progress.correctPct === null ? "–" : `${view.progress.correctPct} %`}
              label="richtig"
            />
            <Stat value={String(view.progress.wrong)} label="wiederholen" />
          </div>

          <div className="flex flex-col gap-2.5">
            <Link
              to="/lernen/$id"
              params={{ id }}
              search={{ mode: "simulation" }}
              className="flex items-center gap-3.5 rounded-[18px] bg-lp-sage px-[18px] py-4 text-white hover:bg-lp-sage-dark"
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-base font-bold">Prüfungssimulation</span>
                <span className="text-[13px] text-lp-sage-on">
                  {Math.min(ROUND_SIZE, view.progress.total)} gemischte Fragen, Auswertung am Ende
                </span>
              </div>
              <ChevronRight className="size-5" strokeWidth={2.4} />
            </Link>
            <div className="grid grid-cols-2 gap-2.5">
              {view.relevant > 0 ? (
                <Link
                  to="/lernen/$id"
                  params={{ id }}
                  search={{ mode: "relevant" }}
                  className="flex flex-col gap-0.5 rounded-[18px] border border-lp-line bg-lp-surface px-4 py-3.5 hover:border-lp-sage-line"
                >
                  <span className="text-[15px] font-bold">Prüfungsrelevant</span>
                  <span className="text-[13px] text-lp-muted">{view.relevant} Fragen</span>
                </Link>
              ) : null}
              {view.progress.wrong > 0 ? (
                <Link
                  to="/lernen/$id"
                  params={{ id }}
                  search={{ mode: "wiederholen" }}
                  className="flex flex-col gap-0.5 rounded-[18px] border border-lp-line bg-lp-surface px-4 py-3.5 hover:border-lp-sage-line"
                >
                  <span className="text-[15px] font-bold">Falsche wiederholen</span>
                  <span className="text-[13px] text-lp-muted">
                    {view.progress.wrong} {view.progress.wrong === 1 ? "Frage" : "Fragen"}
                  </span>
                </Link>
              ) : (
                <div className="flex flex-col gap-0.5 rounded-[18px] border border-lp-line bg-lp-surface px-4 py-3.5 opacity-70">
                  <span className="text-[15px] font-bold">Falsche wiederholen</span>
                  <span className="text-[13px] text-lp-muted">Gerade nichts offen</span>
                </div>
              )}
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="mb-1 text-[17px] font-bold">Themengebiete</h2>
            <ul className="overflow-hidden rounded-[18px] border border-lp-line bg-lp-surface">
              {view.topics.map((t) => (
                <li key={t.id} className="border-b border-lp-line-soft last:border-b-0">
                  <Link
                    to="/lernen/$id"
                    params={{ id }}
                    search={{ mode: "thema", topic: t.id }}
                    className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 hover:bg-lp-bg"
                  >
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-[15px] font-semibold">{t.name}</span>
                        <span className="whitespace-nowrap text-[13px] text-lp-muted">
                          {t.progress.practiced}/{t.progress.total}
                        </span>
                      </div>
                      <Bar size="sm" pct={(t.progress.practiced / t.progress.total) * 100} />
                    </div>
                    <ChevronRight className="size-4 flex-none text-lp-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </Page>
  );
}
