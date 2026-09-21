import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/lib/models";

interface TopicListProps {
  subjectId: string;
  topics: Topic[];
  questionCounts: Record<string, number>;
  onRename: (topic: Topic) => void;
  onDelete: (topic: Topic) => void;
}

export function TopicList({
  subjectId,
  topics,
  questionCounts,
  onRename,
  onDelete,
}: TopicListProps) {
  if (topics.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch keine Themengebiete.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {topics.map((topic) => (
        <li key={topic.id} className="flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <Link
              to="/fach/$id/thema/$topicId"
              params={{ id: subjectId, topicId: topic.id }}
              className="font-medium hover:text-primary"
            >
              {topic.name}
            </Link>
            <p className="text-sm text-muted-foreground">
              {questionCounts[topic.id] ?? 0} Fragen
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onRename(topic)}>
            Umbenennen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(topic)}>
            Löschen
          </Button>
        </li>
      ))}
    </ul>
  );
}
