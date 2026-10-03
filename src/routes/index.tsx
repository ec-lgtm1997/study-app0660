import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SubjectCard } from "@/components/SubjectCard";
import { SubjectDialog } from "@/components/SubjectDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ImportDialog } from "@/components/ImportDialog";
import {
  countsBySubject,
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
} from "@/lib/db";
import type { Subject } from "@/lib/models";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fächer — Lernplattform" },
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
  const [importOpen, setImportOpen] = useState(false);

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
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Fächer</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Importieren
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Fach hinzufügen
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
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={refresh} />
    </main>
  );
}
