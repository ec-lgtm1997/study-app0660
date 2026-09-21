import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Topic } from "@/lib/models";

interface TopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: Topic | null;
  onSubmit: (name: string) => void;
}

export function TopicDialog({ open, onOpenChange, topic, onSubmit }: TopicDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(topic?.name ?? "");
  }, [open, topic]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {topic ? "Themengebiet umbenennen" : "Themengebiet hinzufügen"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="topic-name">Name</Label>
          <Input id="topic-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
