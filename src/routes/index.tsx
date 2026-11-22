import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, Page, Ring, SectionTitle, Spinner, softBtn } from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { subjectExams } from "@/lib/exams";
import { progressOf } from "@/lib/learn";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Lernplattform" }] }),
  component: Startseite,
});

function useGreeting() {
  const [text, setText] = useState("Schön, dass du da bist");
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 11 ? "Guten Morgen" : h < 18 ? "Schön, dass du da bist" : "Guten Abend");
  }, []);
  return text;
}

function Startseite() {
  const { data, latest, query } = useLearnData();
  const greeting = useGreeting();

  const subjects = useMemo(() => {
    if (!data) return [];
    return data.subjects
      .map((s) => {
        const qs = data.questions.filter((q) => q.subject_id === s.id);
        return { ...s, examCount: subjectExams(s).length, progress: progressOf(qs, latest) };
      })
      .filter((s) => s.progress.total > 0);
  }, [data, latest]);

  const last = useMemo(() => {
    if (!data) return null;
    const a = [...data.attempts].reverse().find((x) => x.meta?.mode !== "merken" && x.question_id);
    const q = data.questions.find((x) => x.id === a?.question_id);
    const subject = data.subjects.find((s) => s.id === q?.subject_id);
    if (!subject || !q) return null;
    const topic = data.topics.find((t) => t.id === q.topic_id);
    const inTopic = topic ? data.questions.filter((x) => x.topic_id === topic.id) : [];
    return { subject, topic, progress: topic ? progressOf(inTopic, latest) : null };
  }, [data, latest]);

  const repeat = useMemo(
    () =>
      subjects
        .filter((s) => s.progress.wrong > 0)
        .sort((a, b) => b.progress.wrong - a.progress.wrong)[0] ?? null,
    [subjects],
  );

  return (
    <Page>
      <header className="flex flex-col gap-1.5 pt-2">
        <p className="text-sm text-lp-muted">{greeting}</p>
        <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.025em]">
          Was lernst du heute?
        </h1>
      </header>

      {query.isLoading ? <Spinner /> : null}
      {query.isError ? (
        <p className="text-sm text-lp-warn-ink">
          Die Inhalte konnten nicht geladen werden. Prüfe die Internetverbindung und lade die Seite
          neu.
        </p>
      ) : null}

      {last ? (
        <section className="flex flex-col gap-4 rounded-[26px] bg-lp-hero p-5 text-white">
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-semibold text-white/80">Weitermachen</p>
            <p className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em]">
              {last.subject.name}
              {last.topic ? (
                <>
                  <br />
                  {last.topic.name}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            {last.topic ? (
              <Link
                to="/lernen/$id"
                params={{ id: last.subject.id }}
                search={{ mode: "thema", topic: last.topic.id }}
                className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[15px] font-bold text-[#1f3aa3] hover:bg-white/90"
              >
                Fortsetzen
              </Link>
            ) : (
              <Link
                to="/fach/$id"
                params={{ id: last.subject.id }}
                className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[15px] font-bold text-[#1f3aa3] hover:bg-white/90"
              >
                Fortsetzen
              </Link>
            )}
            {last.progress ? (
              <span className="text-[13px] text-white/85">
                {last.progress.practiced} von {last.progress.total} geübt
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Deine Fächer</SectionTitle>
          <div className="mt-1 flex flex-col gap-2.5">
            {subjects.length === 0 ? (
              <Card className="flex flex-col items-start gap-3">
                <p className="text-sm text-lp-muted">
                  Noch keine Fächer. Lade deine ersten Fragen hoch, dann erscheinen sie hier.
                </p>
                <Link to="/hinzufuegen" className={softBtn}>
                  Fragen hinzufügen
                </Link>
              </Card>
            ) : null}
            {subjects.map((s) => {
              const p = s.progress;
              return (
                <Link
                  key={s.id}
                  to="/fach/$id"
                  params={{ id: s.id }}
                  className="flex items-center gap-3.5 rounded-[22px] border border-lp-line bg-lp-surface p-4 transition-colors hover:border-lp-sage-line"
                >
                  <Ring pct={(p.practiced / p.total) * 100} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-bold">{s.name}</span>
                    <span className="text-[13px] text-lp-muted">
                      {p.total} Fragen
                      {s.examCount ? `, ${s.examCount} Prüfungen` : ""}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {repeat ? (
        <Card className="flex items-center gap-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">
              {repeat.progress.wrong} {repeat.progress.wrong === 1 ? "Frage" : "Fragen"} zum
              Wiederholen
            </span>
            <span className="text-[13px] text-lp-muted">{repeat.name}</span>
          </div>
          <Link
            to="/lernen/$id"
            params={{ id: repeat.id }}
            search={{ mode: "wiederholen" }}
            className={softBtn}
          >
            Los
          </Link>
        </Card>
      ) : null}

      <div className="mt-auto flex justify-center pt-4">
        <Link
          to="/hinzufuegen"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-lp-sage hover:bg-lp-sage-soft"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Fragen hinzufügen
        </Link>
      </div>
    </Page>
  );
}
