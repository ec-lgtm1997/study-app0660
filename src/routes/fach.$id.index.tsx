import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TopicList } from "@/components/TopicList";
import { TopicDialog } from "@/components/TopicDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  countQuestionsByTopic,
  createTopic,
  deleteTopic,
  getSubject,
  listTopics,
  renameTopic,
} from "@/lib/db";
import type { Topic } from "@/lib/models";

export const Route = createFileRoute("/fach/$id/")({
  head: () => ({
    meta: [
      { title: "Fach — Lernplattform" },
      { name: "description", content: "Themengebiete eines Fachs mit Anzahl der Fragen." },
      { property: "og:title", content: "Fach — Lernplattform" },
      {
        property: "og:description",
        content: "Themengebiete eines Fachs mit Anzahl der Fragen.",
      },
    ],
  }),
  component: FachSeite,
});

function FachSeite() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const subject = useQuery({ queryKey: ["subject", id], queryFn: () => getSubject(id) });
  const topics = useQuery({ queryKey: ["topics", id], queryFn: () => listTopics(id) });
  const counts = useQuery({
    queryKey: ["topic-question-counts", id],
    queryFn: () => countQuestionsByTopic(id),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Topic | null>(null);
  const [deleting, setDeleting] = useState<Topic | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["topics", id] });
    queryClient.invalidateQueries({ queryKey: ["topic-question-counts", id] });
  };

  const save = useMutation({
    mutationFn: (name: string) =>
      editing ? renameTopic(editing.id, name) : createTopic({ subject_id: id, name }),
    onSuccess: () => {
      setDialogOpen(false);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (topicId: string) => deleteTopic(topicId),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
        ← Alle Fächer
      </Link>

      <header className="mt-4 mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{subject.data?.name ?? "Fach"}</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Themengebiet hinzufügen
        </Button>
      </header>

      <TopicList
        subjectId={id}
        topics={topics.data ?? []}
        questionCounts={counts.data ?? {}}
        onRename={(topic) => {
          setEditing(topic);
          setDialogOpen(true);
        }}
        onDelete={setDeleting}
      />

      <section className="mt-8 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Lernen kommt später
      </section>

      <TopicDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        topic={editing}
        onSubmit={(name) => save.mutate(name)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Themengebiet löschen?"
        description={`„${deleting?.name ?? ""}“ wird gelöscht.`}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </main>
  );
}
