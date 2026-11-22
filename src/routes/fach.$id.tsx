import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
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
import { EXAM_SIZE, subjectExams } from "@/lib/exams";
import { isExamRelevant, progressOf } from "@/lib/learn";
import { averageGrade, examSessions, formatGrade, learningCurve, masteryOf } from "@/lib/stats";

export const Route = createFileRoute("/fach/$id")({
  head: () => ({ meta: [{ title: "Fach — Lernplattform" }] }),
  component: FachSeite,
});

const tile =
  "flex flex-col gap-0.5 rounded-[18px] border border-lp-line bg-lp-surface px-4 py-3.5 transition-colors hover:border-lp-sage-line";

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
        return { ...t, mastery: masteryOf(qs, latest), progress: progressOf(qs, latest) };
      })
      .filter((t) => t.mastery.total > 0);
    const sessions = examSessions(subject, data.attempts, data.questions);
    const exams = subjectExams(subject).map((e) => {
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
      relevant: questions.filter(isExamRelevant).length,
    };
  }, [data, latest, id]);

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
            {view.progress.wrong > 0 ? (
              <Link
                to="/lernen/$id"
                params={{ id }}
                search={{ mode: "wiederholen" }}
                className={tile}
              >
                <span className="text-[15px] font-bold">Wiederholen</span>
                <span className="text-[13px] text-lp-muted">
                  {view.progress.wrong} {view.progress.wrong === 1 ? "Frage" : "Fragen"}
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
            {view.exams.length === 0 ? (
              <Link
                to="/pruefung/$id"
                params={{ id }}
                className="mt-1 flex items-center gap-3 rounded-[18px] bg-lp-sage px-4 py-4 text-lp-on-sage hover:bg-lp-sage-dark"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-bold">Prüfung schreiben</span>
                  <span className="text-[13px] opacity-85">
                    {Math.min(EXAM_SIZE, view.progress.total)} gemischte Fragen, Note am Ende
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
        </>
      ) : null}
    </Page>
  );
}
