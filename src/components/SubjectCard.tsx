import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Subject } from "@/lib/models";

interface SubjectCardProps {
  subject: Subject;
  topicCount: number;
  questionCount: number;
  onEdit: (subject: Subject) => void;
  onDelete: (subject: Subject) => void;
}

export function SubjectCard({
  subject,
  topicCount,
  questionCount,
  onEdit,
  onDelete,
}: SubjectCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Link to="/admin/fach/$id" params={{ id: subject.id }} className="hover:text-primary">
            {subject.name}
          </Link>
        </CardTitle>
        {subject.description ? (
          <p className="text-sm text-muted-foreground">{subject.description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {topicCount} Themengebiete · {questionCount} Fragen
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(subject)}>
            Bearbeiten
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(subject)}>
            Löschen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
