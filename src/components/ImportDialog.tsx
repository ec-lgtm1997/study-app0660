import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseImportFile,
  previewImport,
  runImport,
  type ImportFile,
  type ImportPreview,
  type ImportResult,
} from "@/lib/import";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const [file, setFile] = useState<ImportFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setError(null);
    setBusy(false);
    setProgress(null);
    setResult(null);
  }, [open]);

  const onFileChosen = async (f: File | undefined) => {
    setError(null);
    setResult(null);
    setFile(null);
    setPreview(null);
    if (!f) return;
    try {
      const parsed = parseImportFile(await f.text());
      setFile(parsed);
      setPreview(previewImport(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runImport(file, (done, total) => setProgress(`${done} / ${total} Fragen`));
      setResult(res);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fragen importieren</DialogTitle>
          <DialogDescription>
            JSON-Datei mit Fach, Themen und Fragen wählen. Bereits importierte Fragen werden
            übersprungen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-file">Datei</Label>
            <Input
              id="import-file"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => onFileChosen(e.target.files?.[0])}
            />
          </div>

          {preview && !result ? (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{preview.subject}</p>
              <p className="text-muted-foreground">
                {preview.questionCount} Fragen in {preview.topicNames.length} Themengebieten
              </p>
              <ul className="mt-2 list-inside list-disc text-muted-foreground">
                {preview.topicNames.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {progress ? (
            <p className="text-sm text-muted-foreground">Importiere … {progress}</p>
          ) : null}

          {result ? (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Import abgeschlossen</p>
              <p className="text-muted-foreground">
                {result.subjectCreated ? "Fach neu angelegt. " : "Bestehendes Fach ergänzt. "}
                {result.topicsCreated} Themen neu, {result.inserted} Fragen importiert
                {result.skipped ? `, ${result.skipped} schon vorhanden` : ""}.
              </p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {result ? "Schließen" : "Abbrechen"}
          </Button>
          {!result ? (
            <Button disabled={!file || busy} onClick={start}>
              {busy ? "Importiere …" : "Importieren"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
