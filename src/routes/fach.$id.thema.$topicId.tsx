import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { QuestionRow } from "@/components/QuestionRow";
import { QuestionDialog } from "@/components/QuestionDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createQuestion, deleteQuestion, getTopic, listQuestions, listTopics } from "@/lib/db";
import type { Json, Question } from "@/lib/models";

export const Route = createFileRoute("/fach/$id/thema/$topicId")({
  head: () => ({
    meta: [
      { title: "Themengebiet — Lernplattform" },
      { name: "description", content: "Fragen eines Themengebiets verwalten." },
      { property: "og:title", content: "Themengebiet — Lernplattform" },
      { property: "og:description", content: "Fragen eines Themengebiets verwalten." },
    ],
  }),
  component: ThemaSeite,
});

function ThemaSeite() {
  const { id, topicId } = Route.useParams();
  const queryClient = useQueryClient();

  const topic = useQuery({ queryKey: ["topic", topicId], queryFn: () => getTopic(topicId) });
  const topics = useQuery({ queryKey: ["topics", id], queryFn: () => listTopics(id) });
  const questions = useQuery({
    queryKey: ["questions", topicId],
    queryFn: () => listQuestions({ topicId }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Question | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["questions", topicId] });

  const save = useMutation({
    mutationFn: (input: {
      topic_id: string | null;
      type: string;
      content: Json;
      solution: Json;
    }) => createQuestion({ ...input, subject_id: id }),
    onSuccess: () => {
      setDialogOpen(false);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (questionId: string) => deleteQuestion(questionId),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link to="/fach/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-primary">
        ← Zurück zum Fach
      </Link>

      <header className="mt-4 mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{topic.data?.name ?? "Themengebiet"}</h1>
        <Button onClick={() => setDialogOpen(true)}>Frage hinzufügen</Button>
      </header>

      {questions.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Fragen.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(questions.data ?? []).map((question) => (
            <QuestionRow key={question.id} question={question} onDelete={setDeleting} />
          ))}
        </ul>
      )}

      <QuestionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        topics={topics.data ?? []}
        defaultTopicId={topicId}
        onSubmit={(input) => save.mutate(input)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Frage löschen?"
        description="Die Frage wird endgültig gelöscht."
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </main>
  );
}
