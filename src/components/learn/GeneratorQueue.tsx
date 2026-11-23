import { Check, FileText, RotateCcw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, primaryBtn, secondaryBtn } from "@/components/learn/ui";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import {
  DIFFICULTY_LABEL,
  MAX_PDF_MB,
  MIX_LABEL,
  checkFile,
  combineJobs,
  newJob,
  runJob,
  type Difficulty,
  type Job,
  type Mix,
} from "@/lib/generate";
import type { ParsedImport } from "@/lib/import";
import { QUESTION_TYPES } from "@/lib/learn";

interface Draft {
  subject: string;
  jobs: Job[];
}

const chip = (on: boolean) =>
  `inline-flex min-h-8 items-center rounded-full border-[1.5px] px-2.5 text-xs font-semibold transition-colors ${
    on
      ? "border-lp-sage bg-lp-sage-soft text-lp-sage"
      : "border-lp-line bg-lp-surface text-lp-ink-3 hover:border-lp-sage-line"
  }`;
const field =
  "min-h-10 w-full rounded-xl border-[1.5px] border-lp-line bg-lp-surface px-3 text-sm text-lp-ink outline-none focus:border-lp-sage";

/**
 * Mehrere Unterlagen nacheinander in Fragen verwandeln. Jeder Zwischenstand wird
 * auf dem Gerät gespeichert, nach dem Neuladen geht es an derselben Stelle weiter.
 */
export function GeneratorQueue({
  subject,
  knownTopics,
  onReady,
}: {
  subject: string;
  knownTopics: string[];
  onReady: (parsed: ParsedImport) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [draftSubject, setDraftSubject] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [running, setRunning] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const signal = useRef({ cancelled: false });
  const jobsRef = useRef<Job[]>([]);

  const target = draftSubject ?? subject;

  const persist = async (next: Job[], subj = target) => {
    jobsRef.current = next;
    setJobs(next);
    if (next.length) await saveDraft<Draft>({ subject: subj, jobs: next });
    else await clearDraft();
  };

  useEffect(() => {
    void loadDraft<Draft>().then((d) => {
      if (d?.jobs?.length) {
        const fixed = d.jobs.map((j) =>
          j.status === "laeuft" ? { ...j, status: "wartet" as const } : j,
        );
        jobsRef.current = fixed;
        setJobs(fixed);
        setDraftSubject(d.subject);
        setRestored(true);
      }
      setLoaded(true);
    });
  }, []);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    const problems = list.map(checkFile).filter((x): x is string => Boolean(x));
    setWarn(problems.length ? problems.join(" ") : null);
    const ok = list.filter((f) => !checkFile(f)).map(newJob);
    if (!ok.length) return;
    const subj = draftSubject ?? subject;
    if (!draftSubject) setDraftSubject(subj);
    await persist([...jobsRef.current, ...ok], subj);
    if (ok.length === 1 && ok[0]) setOpenId(ok[0].id);
  };

  const update = (id: string, patch: Partial<Job>) =>
    void persist(jobsRef.current.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const remove = (id: string) => void persist(jobsRef.current.filter((j) => j.id !== id));

  const startAll = async () => {
    signal.current = { cancelled: false };
    setRunning(true);
    const goals = jobsRef.current.find((j) => j.role === "lernziele") ?? null;
    for (const j of jobsRef.current) {
      if (signal.current.cancelled) break;
      if (j.role !== "quelle" || j.status === "fertig") continue;
      await runJob({
        job: j.status === "fehler" ? { ...j, status: "wartet" } : j,
        subject: target,
        knownTopics,
        goals,
        signal: signal.current,
        onUpdate: async (nj) => {
          await persist(jobsRef.current.map((x) => (x.id === nj.id ? nj : x)));
        },
      });
    }
    setRunning(false);
  };

  const discard = async () => {
    signal.current.cancelled = true;
    setDraftSubject(null);
    setRestored(false);
    await persist([]);
  };

  const sources = jobs.filter((j) => j.role === "quelle");
  const planned = sources.reduce((n, j) => n + j.count, 0);
  const made = sources.reduce((n, j) => n + j.questions.length, 0);
  const open = sources.filter((j) => j.status !== "fertig").length;

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-3">
      {restored && jobs.length ? (
        <p className="rounded-xl bg-lp-sage-soft px-3 py-2.5 text-[13px] leading-relaxed text-lp-ink-2">
          Dein Zwischenstand ist gespeichert{draftSubject ? ` (Fach: ${draftSubject})` : ""}. Du
          kannst einfach weitermachen.
        </p>
      ) : null}
      {draftSubject && draftSubject !== subject && jobs.length ? (
        <p className="text-[13px] text-lp-muted">
          Diese Unterlagen gehören zum Fach „{draftSubject}“. Für ein anderes Fach erst „Alles
          verwerfen“.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={running}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`flex items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-lp-sage px-4 py-4 text-left transition-colors ${
          dragging ? "bg-lp-sage-on" : "bg-lp-sage-soft hover:bg-lp-sage-on"
        }`}
      >
        <Upload className="size-6 flex-none text-lp-sage" strokeWidth={2} />
        <span className="flex flex-col">
          <span className="text-sm font-bold text-lp-sage">
            {jobs.length ? "Weitere Unterlagen hinzufügen" : "Unterlagen auswählen"}
          </span>
          <span className="text-xs text-lp-muted">
            Mehrere auf einmal möglich: PDF bis {MAX_PDF_MB} MB, Word oder Text
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,application/pdf"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {warn ? <p className="text-[13px] text-lp-warn-ink">{warn}</p> : null}

      {jobs.length ? (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              open={openId === j.id}
              locked={running}
              onToggle={() => setOpenId((cur) => (cur === j.id ? null : j.id))}
              onChange={(patch) => update(j.id, patch)}
              onRemove={() => remove(j.id)}
            />
          ))}
        </ul>
      ) : null}

      {sources.length ? (
        <div className="flex flex-col gap-2 pt-1">
          {running ? (
            <>
              <Bar pct={(made / Math.max(1, planned)) * 100} />
              <div className="flex items-center justify-between text-[13px] text-lp-muted">
                <span>
                  {made} von {planned} Fragen, wird laufend gespeichert
                </span>
                <button
                  type="button"
                  onClick={() => {
                    signal.current.cancelled = true;
                  }}
                  className="font-semibold hover:text-lp-ink"
                >
                  Pausieren
                </button>
              </div>
            </>
          ) : (
            <>
              {open > 0 ? (
                <button
                  type="button"
                  disabled={!target.trim()}
                  onClick={() => void startAll()}
                  className={made ? secondaryBtn : primaryBtn}
                >
                  {made ? `Weiter erstellen (${open} offen)` : `${planned} Fragen erstellen`}
                </button>
              ) : null}
              {made > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const c = combineJobs(target, jobsRef.current);
                    if (c) onReady(c);
                  }}
                  className={open > 0 ? secondaryBtn : primaryBtn}
                >
                  {made} Fragen prüfen und übernehmen
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void discard()}
                className="min-h-10 text-[13px] font-semibold text-lp-muted hover:text-lp-warn-ink"
              >
                Alles verwerfen
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function JobRow({
  job,
  open,
  locked,
  onToggle,
  onChange,
  onRemove,
}: {
  job: Job;
  open: boolean;
  locked: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Job>) => void;
  onRemove: () => void;
}) {
  const isGoals = job.role === "lernziele";
  const done = job.questions.length;
  const status = isGoals
    ? "Lernziele, zur Orientierung bei allen Dateien"
    : job.status === "fertig"
      ? `Fertig, ${done} Fragen`
      : job.status === "laeuft"
        ? `Wird erstellt … ${done} von ${job.count}`
        : job.status === "fehler"
          ? (job.message ?? "Hat nicht geklappt")
          : done
            ? `Pausiert, ${done} von ${job.count}`
            : `${job.count} Fragen, ${MIX_LABEL[job.mix].toLowerCase()}`;
  const editable = !locked && job.status !== "laeuft";

  return (
    <li className="rounded-[18px] border border-lp-line bg-lp-surface">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span
          className={`grid size-9 flex-none place-items-center rounded-xl ${
            job.status === "fertig"
              ? "bg-lp-good-soft text-lp-good"
              : job.status === "fehler"
                ? "bg-lp-warn-soft text-lp-warn"
                : "bg-lp-sage-soft text-lp-sage"
          }`}
        >
          {job.status === "fertig" ? (
            <Check className="size-[18px]" strokeWidth={2.6} />
          ) : job.status === "fehler" ? (
            <RotateCcw className="size-4" strokeWidth={2.4} />
          ) : (
            <FileText className="size-[18px]" strokeWidth={2} />
          )}
        </span>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate text-sm font-bold">
            {isGoals ? job.name : job.topic || job.name}
          </span>
          <span
            className={`text-xs ${job.status === "fehler" ? "text-lp-warn-ink" : "text-lp-muted"}`}
          >
            {status}
          </span>
        </button>
        {editable ? (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs font-semibold text-lp-sage hover:text-lp-sage-dark"
          >
            {open ? "Fertig" : "Anpassen"}
          </button>
        ) : null}
        {editable ? (
          <button
            type="button"
            aria-label={`${job.name} entfernen`}
            onClick={onRemove}
            className="grid size-8 flex-none place-items-center rounded-lg text-lp-muted hover:bg-lp-bg hover:text-lp-ink"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {open && editable ? (
        <div className="flex flex-col gap-3 border-t border-lp-line px-3.5 py-3">
          <p className="truncate text-xs text-lp-muted">{job.name}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={chip(!isGoals)}
              onClick={() => onChange({ role: "quelle" })}
            >
              Daraus Fragen erstellen
            </button>
            <button
              type="button"
              className={chip(isGoals)}
              onClick={() => onChange({ role: "lernziele" })}
            >
              Sind die Lernziele
            </button>
          </div>

          {!isGoals ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-lp-ink-3">Themengebiet</span>
                <input
                  value={job.topic}
                  onChange={(e) => onChange({ topic: e.target.value })}
                  placeholder="leer lassen = selbst einteilen"
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-lp-ink-3">Anzahl Fragen</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={150}
                  value={job.count}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    onChange({
                      count: Number.isFinite(n) ? Math.max(1, Math.min(150, n)) : 1,
                      ...(job.status === "fertig" && n > job.questions.length
                        ? { status: "wartet" as const }
                        : {}),
                    });
                  }}
                  className={`${field} w-28`}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-lp-ink-3">Fragetypen</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(MIX_LABEL) as Mix[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={chip(job.mix === m)}
                      onClick={() => onChange({ mix: m })}
                    >
                      {MIX_LABEL[m]}
                    </button>
                  ))}
                </div>
                {job.mix === "eigene" ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUESTION_TYPES.map(([t, label]) => {
                      const on = job.types.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          className={chip(on)}
                          onClick={() =>
                            onChange({
                              types: on ? job.types.filter((x) => x !== t) : [...job.types, t],
                            })
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-lp-ink-3">Schwierigkeit</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={chip(job.difficulty === d)}
                      onClick={() => onChange({ difficulty: d })}
                    >
                      {DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-lp-ink-3">
                  Wunsch <span className="font-normal text-lp-muted">(optional)</span>
                </span>
                <textarea
                  value={job.wish}
                  onChange={(e) => onChange({ wish: e.target.value })}
                  rows={2}
                  placeholder="z. B. Schwerpunkt Pflegemaßnahmen, viele Fallbeispiele"
                  className="w-full rounded-xl border-[1.5px] border-lp-line bg-lp-surface px-3 py-2 text-sm text-lp-ink outline-none focus:border-lp-sage"
                />
              </label>
              {done ? (
                <p className="text-xs text-lp-muted">
                  Schon erstellte Fragen bleiben erhalten. Änderungen gelten für die restlichen.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs leading-relaxed text-lp-muted">
              Aus dieser Datei entstehen keine eigenen Fragen. Sie wird bei allen anderen Dateien
              mitgeschickt, damit Prüfungsrelevantes richtig markiert wird.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
