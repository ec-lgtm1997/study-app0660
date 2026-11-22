import { useEffect, useState } from "react";
import { TestModeBadge } from "@/components/learn/ui";
import { isTestMode, setTestMode } from "@/lib/learn";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SubjectCard } from "@/components/SubjectCard";
import { SubjectDialog } from "@/components/SubjectDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  countsBySubject,
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
} from "@/lib/db";
import type { Subject } from "@/lib/models";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Verwaltung — Lernplattform" },
      { name: "description", content: "Übersicht aller Fächer mit Themengebieten und Fragen." },
      { property: "og:title", content: "Fächer — Lernplattform" },
      {
        property: "og:description",
        content: "Übersicht aller Fächer mit Themengebieten und Fragen.",
      },
    ],
  }),
  component: Startseite,
});

function Startseite() {
  const queryClient = useQueryClient();
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: listSubjects });
  const counts = useQuery({ queryKey: ["subject-counts"], queryFn: countsBySubject });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [test, setTest] = useState(false);
  useEffect(() => setTest(isTestMode()), []);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["subjects"] });
    queryClient.invalidateQueries({ queryKey: ["subject-counts"] });
  };

  const save = useMutation({
    mutationFn: (input: { name: string; description: string | null }) =>
      editing ? updateSubject(editing.id, input) : createSubject(input),
    onSuccess: () => {
      setDialogOpen(false);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSubject(id),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-10 pt-8 font-lp text-lp-ink sm:px-6 sm:pt-12">
      <header className="mb-6 flex flex-col gap-2">
        <Link
          to="/hinzufuegen"
          className="-ml-1 self-start text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
        >
          ‹ Fragen hinzufügen
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[31px] font-extrabold leading-[1.05] tracking-[-0.025em]">
            Fächer und Fragen
          </h1>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Fach anlegen
          </Button>
        </div>
      </header>

      {subjects.isLoading ? <p className="text-sm text-muted-foreground">Lädt …</p> : null}
      {subjects.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Fächer.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {(subjects.data ?? []).map((subject) => (
          <SubjectCard
            key={subject.id}
            subject={subject}
            topicCount={counts.data?.[subject.id]?.topics ?? 0}
            questionCount={counts.data?.[subject.id]?.questions ?? 0}
            onEdit={(s) => {
              setEditing(s);
              setDialogOpen(true);
            }}
            onDelete={setDeleting}
          />
        ))}
      </div>

      <section className="mt-10 flex items-start justify-between gap-4 rounded-[22px] border border-lp-line bg-lp-surface p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-lp text-[15px] font-bold tracking-normal">Testmodus</h2>
          <p className="text-[13px] leading-relaxed text-lp-muted">
            Zum Ausprobieren: Antworten und Prüfungen werden nicht gespeichert und tauchen in keiner
            Statistik auf. Gilt nur auf diesem Gerät.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={test}
          aria-label="Testmodus"
          onClick={() => {
            setTestMode(!test);
            setTest(!test);
          }}
          className={`relative h-7 w-12 flex-none rounded-full transition-colors ${
            test ? "bg-lp-sage" : "bg-lp-line"
          }`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${
              test ? "left-6" : "left-1"
            }`}
          />
        </button>
      </section>
      {test ? <TestModeBadge key="on" /> : null}

      <SubjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subject={editing}
        onSubmit={(input) => save.mutate(input)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Fach löschen?"
        description={`„${deleting?.name ?? ""}“ und alle zugehörigen Themengebiete und Fragen werden gelöscht.`}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </main>
  );
}
