import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GeneratorQueue } from "@/components/learn/GeneratorQueue";
import { Back, Card, Page, primaryBtn, secondaryBtn, softBtn } from "@/components/learn/ui";
import { useLearnData } from "@/hooks/use-learn";
import { generatorAvailable } from "@/lib/ai-generate.functions";
import { buildAnleitung } from "@/lib/anleitung";
import { clearDraft } from "@/lib/drafts";
import {
  forgetImport,
  lastImport,
  parseImportFile,
  previewImport,
  rememberImport,
  runImport,
  undoImport,
  type ImportPreview,
  type ImportResult,
  type ImportUndo,
  type ParsedImport,
} from "@/lib/import";

export const Route = createFileRoute("/hinzufuegen")({
  head: () => ({ meta: [{ title: "Fragen hinzufügen — Lernplattform" }] }),
  component: Hinzufuegen,
});

const NEW = "__neu__";
const input =
  "min-h-11 w-full rounded-xl border-[1.5px] border-lp-line bg-lp-surface px-3 text-[15px] text-lp-ink outline-none focus:border-lp-sage";

function Step({
  no,
  done,
  title,
  children,
}: {
  no: number;
  done?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        className={`grid size-[30px] flex-none place-items-center rounded-full text-sm font-bold ${
          done ? "bg-lp-good text-lp-surface" : "bg-lp-sage-soft text-lp-sage"
        }`}
        aria-hidden="true"
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : no}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-1">
        <h2 className="pt-1 font-lp text-[15px] font-bold tracking-normal">{title}</h2>
        {children}
      </div>
    </li>
  );
}

function Hinzufuegen() {
  const { data } = useLearnData();
  const queryClient = useQueryClient();

  // Schritt 1
  const [choice, setChoice] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [count, setCount] = useState(50);
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);

  // Schritt 3
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Automatisch aus Unterlagen
  const [genOn, setGenOn] = useState(false);
  const [fromQueue, setFromQueue] = useState(false);
  const [queueKey, setQueueKey] = useState(0);
  const [notice] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Rückgängig machen
  const [undo, setUndo] = useState<ImportUndo | null>(null);
  const [undoState, setUndoState] = useState<"idle" | "confirm" | "busy" | "done">("idle");

  useEffect(() => {
    if (preview || result || notice)
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [preview, result, notice]);

  useEffect(() => {
    setUndo(lastImport());
    generatorAvailable()
      .then((r) => setGenOn(r.available))
      .catch(() => setGenOn(false));
  }, []);

  const subjects = data?.subjects ?? [];
  const selected = choice || subjects[0]?.id || NEW;
  const subjectName =
    selected === NEW ? newName : (subjects.find((s) => s.id === selected)?.name ?? "");
  const topics = useMemo(
    () =>
      selected === NEW
        ? []
        : (data?.topics ?? []).filter((t) => t.subject_id === selected).map((t) => t.name),
    [data, selected],
  );
  const anleitung = buildAnleitung({ subject: subjectName, count, topics });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(anleitung);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = anleitung;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  };

  const check = async (raw: string) => {
    setError(null);
    setParsed(null);
    setPreview(null);
    setResult(null);
    try {
      const p = parseImportFile(raw);
      setFromQueue(false);
      setBusy(true);
      setPreview(await previewImport(p));
      setParsed(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (f) await check(await f.text());
  };

  const start = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runImport(parsed, (d, t) => setProgress(`${d} von ${t} Fragen`));
      setResult(res);
      rememberImport(res.undo);
      setUndo(res.undo);
      setUndoState("idle");
      if (fromQueue) {
        await clearDraft();
        setQueueKey((k) => k + 1);
        setFromQueue(false);
      }
      setParsed(null);
      setPreview(null);
      setPasted("");
      await queryClient.invalidateQueries({ queryKey: ["learn"] });
    } catch (e) {
      setError(
        `Das Hinzufügen hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}. Bereits übernommene Fragen bleiben erhalten, du kannst es einfach noch einmal versuchen.`,
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const revert = async () => {
    if (!undo) return;
    if (undoState !== "confirm") {
      setUndoState("confirm");
      return;
    }
    setUndoState("busy");
    try {
      await undoImport(undo);
      forgetImport();
      setUndoState("done");
      setResult(null);
      await queryClient.invalidateQueries({ queryKey: ["learn"] });
    } catch (e) {
      setUndoState("idle");
      setError(
        `Rückgängig machen hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const doneSubject = result
    ? subjects.find((s) => s.name === (preview?.subject ?? subjectName))
    : null;

  return (
    <Page>
      <header className="flex flex-col gap-2">
        <Back to="/">Startseite</Back>
        <h1 className="text-[31px] font-extrabold leading-[1.05] tracking-[-0.025em]">
          Fragen hinzufügen
        </h1>
        <p className="text-sm leading-relaxed text-lp-muted">
          Aus deinen Unterlagen entstehen neue Fragen samt Lösungen.
        </p>
      </header>

      {undo && undoState !== "done" && !result ? (
        <Card className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-bold">Letzter Import</span>
            <span className="text-[13px] text-lp-muted">
              {undo.questionIds.length} Fragen in {undo.subject}
              {undo.subjectCreated ? " (Fach neu angelegt)" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void revert()}
            disabled={undoState === "busy"}
            className="min-h-10 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-lp-warn-ink hover:bg-lp-warn-soft"
          >
            {undoState === "confirm"
              ? "Wirklich entfernen?"
              : undoState === "busy"
                ? "Wird entfernt …"
                : "Rückgängig machen"}
          </button>
        </Card>
      ) : null}
      {undoState === "done" ? (
        <Card>
          <p className="text-sm text-lp-muted">
            Der Import wurde entfernt. Antworten auf diese Fragen sind ebenfalls gelöscht.
          </p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-2.5 p-5">
        <h2 className="font-lp text-[15px] font-bold tracking-normal">Für welches Fach?</h2>
        <div>
          <label className="sr-only" htmlFor="fach">
            Fach
          </label>
          <select
            id="fach"
            value={selected}
            onChange={(e) => {
              setChoice(e.target.value);
              setCopied(false);
            }}
            className={input}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={NEW}>Neues Fach …</option>
          </select>
        </div>
        {selected === NEW ? (
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCopied(false);
            }}
            placeholder="Name des neuen Fachs, z. B. Gerontologie"
            className={input}
          />
        ) : null}
      </Card>

      {genOn ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-lp text-[15px] font-bold tracking-normal">
              Direkt aus deinen Unterlagen
            </h2>
            <p className="text-[13px] leading-relaxed text-lp-muted">
              Zusammenfassung, Folien, Skripte und Lernziele hochladen. Für jede Datei kannst du
              Anzahl, Fragetypen und Schwierigkeit festlegen.
            </p>
          </div>
          <GeneratorQueue
            key={queueKey}
            subject={subjectName.trim()}
            knownTopics={topics}
            onReady={(p) => {
              setError(null);
              setResult(null);
              setFromQueue(true);
              void previewImport(p)
                .then((pv) => {
                  setPreview(pv);
                  setParsed(p);
                })
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
            }}
          />
        </Card>
      ) : null}

      <h2 className="-mb-2 pt-1 text-lg font-bold">
        {genOn ? "Oder über ChatGPT" : "Über ChatGPT"}
      </h2>
      <Card className="p-5">
        <ol className="flex flex-col gap-6">
          <Step no={1} done={copied} title="Anleitung kopieren">
            <label className="flex items-center gap-2 text-[13px] text-lp-ink-3">
              Anzahl Fragen
              <input
                type="number"
                inputMode="numeric"
                min={5}
                max={200}
                value={count}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  setCount(Number.isFinite(n) ? Math.max(5, Math.min(200, n)) : 50);
                  setCopied(false);
                }}
                className="min-h-10 w-24 rounded-xl border-[1.5px] border-lp-line bg-lp-surface px-3 text-sm text-lp-ink outline-none focus:border-lp-sage"
              />
            </label>
            <p className="text-[13px] leading-relaxed text-lp-muted">
              Ein fertiger Text, der genau beschreibt, wie die Fragen aussehen müssen.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void copy()}
                disabled={selected === NEW && !newName.trim()}
                className={`${softBtn} rounded-xl disabled:opacity-50`}
              >
                {copied ? "Kopiert" : "Anleitung kopieren"}
              </button>
              <button
                type="button"
                onClick={() => setShowText((v) => !v)}
                className="text-[13px] font-semibold text-lp-muted hover:text-lp-ink"
              >
                {showText ? "Text ausblenden" : "Text ansehen"}
              </button>
            </div>
            {showText ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-lp-bg p-3 font-lp text-xs leading-relaxed text-lp-ink-3">
                {anleitung}
              </pre>
            ) : null}
          </Step>

          <Step no={2} title="Mit Unterlagen an ChatGPT geben">
            <p className="text-[13px] leading-relaxed text-lp-muted">
              Neuen Chat öffnen, Anleitung einfügen und als PDF oder Word anhängen:
            </p>
            <ul className="flex flex-col gap-1.5 text-[13px] text-lp-ink-2">
              <li>
                <b>Zusammenfassung</b>, die wichtigste Grundlage
              </li>
              <li>
                <b>Lernziele</b>, damit Prüfungsrelevantes markiert wird
              </li>
              <li>
                <b>Folien oder Skripte</b>, wenn vorhanden
              </li>
            </ul>
            <p className="text-[13px] leading-relaxed text-lp-muted">
              Die Antwort als Datei herunterladen oder den ganzen Text kopieren.
            </p>
          </Step>

          <Step no={3} done={Boolean(result)} title="Hier hochladen">
            {!paste ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void onFile(e.dataTransfer.files[0]);
                }}
                className={`flex flex-col items-center gap-1 rounded-[18px] border-[1.5px] border-dashed border-lp-sage px-4 py-5 text-[13px] text-lp-muted transition-colors ${
                  dragging ? "bg-lp-sage-on" : "bg-lp-sage-soft hover:bg-lp-sage-on"
                }`}
              >
                <Upload className="mb-1 size-5 text-lp-sage" strokeWidth={2.2} />
                <span className="text-sm font-bold text-lp-sage">Datei auswählen</span>
                oder hierher ziehen
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={6}
                  placeholder="Antwort von ChatGPT hier einfügen"
                  className="w-full resize-y rounded-xl border-[1.5px] border-lp-line bg-lp-surface p-3 text-[13px] leading-relaxed outline-none focus:border-lp-sage"
                />
                <button
                  type="button"
                  disabled={!pasted.trim() || busy}
                  onClick={() => void check(pasted)}
                  className={`${softBtn} self-start rounded-xl disabled:opacity-50`}
                >
                  Text prüfen
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => setPaste((v) => !v)}
              className="self-start text-[13px] font-semibold text-lp-muted hover:text-lp-ink"
            >
              {paste ? "Lieber eine Datei hochladen" : "Lieber Text einfügen"}
            </button>
          </Step>
        </ol>
      </Card>

      <div ref={reviewRef} className="-mb-6 scroll-mt-4" aria-hidden="true" />
      {busy && !preview ? <p className="text-sm text-lp-muted">Wird geprüft …</p> : null}

      {notice ? (
        <div className="rounded-[18px] border border-lp-line bg-lp-surface p-4 text-sm leading-relaxed text-lp-ink-3">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[18px] border border-lp-warn/40 bg-lp-warn-soft p-4 text-sm leading-relaxed text-lp-warn-ink">
          {error}
        </div>
      ) : null}

      {preview && parsed ? (
        <Card className="flex flex-col gap-2.5 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-lp-good">
            <Check className="size-4" strokeWidth={2.6} /> Inhalt geprüft
          </span>
          <Row label="Fach">
            {preview.subject}
            {preview.subjectExists ? "" : " (neu)"}
          </Row>
          <Row label="Neue Fragen">{preview.newCount}</Row>
          {preview.skipCount ? (
            <Row label="Schon vorhanden">{preview.skipCount}, werden übersprungen</Row>
          ) : null}
          {preview.invalidCount ? (
            <Row label="Fehlerhaft">{preview.invalidCount}, werden ausgelassen</Row>
          ) : null}
          <Row label="Neue Prüfungen">{preview.examCount || "keine"}</Row>
          {preview.subjectExists === false &&
          subjects.length &&
          !(selected === NEW && preview.subject === newName.trim()) ? (
            <p className="text-[13px] leading-relaxed text-lp-muted">
              Ein Fach mit diesem Namen gibt es noch nicht, es wird neu angelegt. Soll es zu einem
              bestehenden Fach? Dann muss „subject“ genau gleich heißen.
            </p>
          ) : null}
          {parsed.problems.length ? (
            <details className="text-[13px] text-lp-muted">
              <summary className="cursor-pointer font-semibold">Was ist fehlerhaft?</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {parsed.problems.slice(0, 20).map((p) => (
                  <li key={`${p.where}-${p.message}`}>
                    {p.where}: {p.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <Card className="flex flex-col gap-3">
          <p className="font-display text-xl font-bold">
            {result.inserted} {result.inserted === 1 ? "Frage" : "Fragen"} hinzugefügt
          </p>
          <p className="text-sm leading-relaxed text-lp-muted">
            {result.examCount
              ? `${result.examCount} neue ${result.examCount === 1 ? "Prüfung" : "Prüfungen"} stehen bereit.`
              : "Die Fragen sind ab sofort beim Üben dabei."}
            {result.skipped ? ` ${result.skipped} waren schon vorhanden.` : ""}
          </p>
          {doneSubject ? (
            <Link to="/fach/$id" params={{ id: doneSubject.id }} className={primaryBtn}>
              Zum Fach
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void revert()}
            disabled={undoState === "busy"}
            className="min-h-11 text-sm font-semibold text-lp-warn-ink hover:text-lp-warn"
          >
            {undoState === "confirm"
              ? "Wirklich wieder entfernen?"
              : undoState === "busy"
                ? "Wird entfernt …"
                : "Rückgängig machen"}
          </button>
        </Card>
      ) : null}

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {preview && parsed ? (
          <button
            type="button"
            disabled={busy || preview.newCount === 0}
            onClick={() => void start()}
            className={primaryBtn}
          >
            {busy
              ? (progress ?? "Wird hinzugefügt …")
              : preview.newCount === 0
                ? "Keine neuen Fragen"
                : `${preview.newCount} ${preview.newCount === 1 ? "Frage" : "Fragen"} hinzufügen`}
          </button>
        ) : null}
        <Link to="/admin" className={secondaryBtn}>
          Fächer und Fragen bearbeiten
        </Link>
      </div>
    </Page>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-lp-muted">{children}</span>
    </div>
  );
}
