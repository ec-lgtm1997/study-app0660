import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Json, QuestionType, Topic } from "@/lib/models";

const TYPES: QuestionType[] = ["open", "multiple_choice", "matching"];

interface QuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: Topic[];
  defaultTopicId: string | null;
  onSubmit: (input: { topic_id: string | null; type: string; content: Json; solution: Json }) => void;
}

function parseJson(value: string): Json | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Json;
  } catch {
    return null;
  }
}

export function QuestionDialog({
  open,
  onOpenChange,
  topics,
  defaultTopicId,
  onSubmit,
}: QuestionDialogProps) {
  const [topicId, setTopicId] = useState<string>("");
  const [type, setType] = useState<string>("open");
  const [content, setContent] = useState("{}");
  const [solution, setSolution] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTopicId(defaultTopicId ?? "");
    setType("open");
    setContent("{}");
    setSolution("{}");
    setError(null);
  }, [open, defaultTopicId]);

  const submit = () => {
    const parsedContent = parseJson(content);
    const parsedSolution = parseJson(solution);
    if (!parsedContent) return setError("Inhalt ist kein gültiges JSON-Objekt.");
    if (!parsedSolution) return setError("Lösung ist kein gültiges JSON-Objekt.");
    setError(null);
    onSubmit({
      topic_id: topicId || null,
      type,
      content: parsedContent,
      solution: parsedSolution,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Frage hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Themengebiet</Label>
            <Select value={topicId} onValueChange={setTopicId}>
              <SelectTrigger>
                <SelectValue placeholder="Themengebiet wählen" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="question-content">Inhalt (JSON)</Label>
            <Textarea
              id="question-content"
              rows={5}
              className="font-mono text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="question-solution">Lösung (JSON)</Label>
            <Textarea
              id="question-solution"
              rows={5}
              className="font-mono text-sm"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
