import { Button } from "@/components/ui/button";
import type { Question } from "@/lib/models";

interface QuestionRowProps {
  question: Question;
  onDelete: (question: Question) => void;
}

function preview(question: Question): string {
  const text = (question.content as { text?: unknown }).text;
  if (typeof text !== "string" || text.length === 0) return "—";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function QuestionRow({ question, onDelete }: QuestionRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{question.type}</p>
        <p className="truncate">{preview(question)}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDelete(question)}>
        Löschen
      </Button>
    </li>
  );
}
