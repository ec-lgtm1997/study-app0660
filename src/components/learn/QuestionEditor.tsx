import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { checkQuestion } from "@/lib/import";
import { QUESTION_TYPES, removeQuestion, updateQuestion, type LQuestion } from "@/lib/learn";

/* Formular zum Korrigieren einer Frage – ohne JSON, für alle fünf Fragetypen. */

interface Row {
  id: string;
  text: string;
}
interface Pair {
  lid: string;
  rid: string;
  left: string;
  right: string;
}

const field =
  "w-full rounded-xl border-[1.5px] border-lp-line bg-lp-surface px-3 py-2.5 text-sm leading-relaxed text-lp-ink outline-none focus:border-lp-sage";
const small = "text-[13px] font-semibold text-lp-ink-3";

let counter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${counter++}`;

function Label({ children, hint }: { children: ReactNode; hint?: string | undefined }) {
  return (
    <span className={small}>
      {children}
      {hint ? <span className="ml-1 font-normal text-lp-muted">{hint}</span> : null}
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 flex-none place-items-center rounded-lg text-lp-muted hover:bg-lp-bg hover:text-lp-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function QuestionEditor({
  q,
  onClose,
  onSaved,
  onDeleted,
}: {
  q: LQuestion;
  onClose: () => void;
  onSaved?: (q: LQuestion) => void;
  onDeleted?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const c = q.content;
  const s = q.solution;

  const [text, setText] = useState(c.text ?? "");
  const [explanation, setExplanation] = useState(s.explanation ?? "");
  // Multiple Choice
  const [options, setOptions] = useState<(Row & { correct: boolean })[]>(
    (c.options ?? []).map((o) => ({ ...o, correct: (s.correct ?? []).includes(o.id) })),
  );
  // Zuordnung
  const [pairs, setPairs] = useState<Pair[]>(() => {
    const r = new Map((c.right ?? []).map((x) => [x.id, x.text]));
    const l = new Map((c.left ?? []).map((x) => [x.id, x.text]));
    return (s.pairs ?? []).map(([lid, rid]) => ({
      lid,
      rid,
      left: l.get(lid) ?? "",
      right: r.get(rid) ?? "",
    }));
  });
  // Reihenfolge (in richtiger Reihenfolge bearbeitet)
  const [items, setItems] = useState<Row[]>(() => {
    const t = new Map((c.items ?? []).map((x) => [x.id, x.text]));
    return (s.order ?? []).map((id) => ({ id, text: t.get(id) ?? "" }));
  });
  // Lückentext
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(s.answers ?? {}).map(([k, v]) => [k, v.join(" | ")])),
  );
  // Offen
  const [model, setModel] = useState(s.model_answer ?? "");
  const [keys, setKeys] = useState((s.key_points ?? []).join("\n"));

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose]);

  const blanks = Array.from(text.matchAll(/\{\{(\d+)\}\}/g), (m) => m[1] ?? "");

  const build = (): Pick<LQuestion, "content" | "solution"> => {
    const content: LQuestion["content"] = { text: text.trim() };
    const solution: LQuestion["solution"] = {};
    if (explanation.trim()) solution.explanation = explanation.trim();
    switch (q.type) {
      case "multiple_choice": {
        const opts = options.filter((o) => o.text.trim());
        content.options = opts.map(({ id, text: t }) => ({ id, text: t.trim() }));
        solution.correct = opts.filter((o) => o.correct).map((o) => o.id);
        content.multiple = solution.correct.length > 1;
        break;
      }
      case "matching": {
        const ps = pairs.filter((p) => p.left.trim() || p.right.trim());
        content.left = ps.map((p) => ({ id: p.lid, text: p.left.trim() }));
        // rechte Spalte in bisheriger (gemischter) Reihenfolge, neue hinten an
        const known = (c.right ?? []).map((r) => r.id).filter((id) => ps.some((p) => p.rid === id));
        const added = ps.map((p) => p.rid).filter((id) => !known.includes(id));
        const rText = new Map(ps.map((p) => [p.rid, p.right.trim()]));
        content.right = [...known, ...added].map((id) => ({ id, text: rText.get(id) ?? "" }));
        solution.pairs = ps.map((p) => [p.lid, p.rid]);
        break;
      }
      case "ordering": {
        const its = items.filter((i) => i.text.trim());
        const shown = (c.items ?? []).map((i) => i.id).filter((id) => its.some((x) => x.id === id));
        const added = its.map((i) => i.id).filter((id) => !shown.includes(id));
        const t = new Map(its.map((i) => [i.id, i.text.trim()]));
        let display = [...shown, ...added];
        const correct = its.map((i) => i.id);
        // nie in Lösungsreihenfolge anzeigen
        if (display.join() === correct.join() && display.length > 1)
          display = [...display.slice(1), display[0] as string];
        content.items = display.map((id) => ({ id, text: t.get(id) ?? "" }));
        solution.order = correct;
        break;
      }
      case "cloze":
        solution.answers = Object.fromEntries(
          blanks.map((b) => [
            b,
            (answers[b] ?? "")
              .split("|")
              .map((x) => x.trim())
              .filter(Boolean),
          ]),
        );
        break;
      case "open":
        solution.model_answer = model.trim();
        solution.key_points = keys
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
        break;
    }
    return { content, solution };
  };

  const save = async () => {
    const next = build();
    const problem = checkQuestion(
      { id: "x", topic: "x", type: q.type, content: next.content, solution: next.solution },
      true,
    );
    if (problem) {
      setError(`Noch nicht vollständig: ${problem}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateQuestion(q, next.content, next.solution);
      await queryClient.invalidateQueries({ queryKey: ["learn"] });
      onSaved?.({
        ...q,
        content: q.content.meta ? { ...next.content, meta: q.content.meta } : next.content,
        solution: next.solution,
      });
      onClose();
    } catch (e) {
      setError(`Speichern hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await removeQuestion(q.id);
      await queryClient.invalidateQueries({ queryKey: ["learn"] });
      onDeleted?.(q.id);
      onClose();
    } catch (e) {
      setError(`Löschen hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  const move = <T,>(list: T[], i: number, d: number): T[] => {
    const n = list.slice();
    const j = i + d;
    if (j < 0 || j >= n.length) return n;
    [n[i], n[j]] = [n[j] as T, n[i] as T];
    return n;
  };

  const typeLabel = Object.fromEntries(QUESTION_TYPES)[q.type] ?? q.type;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1020]/45 sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[26px] bg-lp-bg font-lp text-lp-ink sm:rounded-[26px]">
        <div className="flex items-center justify-between gap-3 border-b border-lp-line px-5 py-4">
          <div className="flex flex-col">
            <h2 id="editor-title" className="text-lg font-bold">
              Frage bearbeiten
            </h2>
            <span className="text-xs text-lp-muted">{typeLabel}</span>
          </div>
          <IconBtn label="Schließen" onClick={onClose} disabled={busy}>
            <X className="size-5" />
          </IconBtn>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <Label hint={q.type === "cloze" ? "Lücken als {{1}}, {{2}} …" : undefined}>
              Fragetext
            </Label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className={field}
            />
          </label>

          {q.type === "multiple_choice" ? (
            <div className="flex flex-col gap-2">
              <Label hint="Haken = richtige Antwort">Antworten</Label>
              {options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={o.correct}
                    aria-label="richtige Antwort"
                    onChange={(e) =>
                      setOptions((l) =>
                        l.map((x, k) => (k === i ? { ...x, correct: e.target.checked } : x)),
                      )
                    }
                    className="size-5 flex-none accent-[var(--lp-good)]"
                  />
                  <input
                    value={o.text}
                    onChange={(e) =>
                      setOptions((l) =>
                        l.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    className={field}
                  />
                  <IconBtn
                    label="Antwort entfernen"
                    onClick={() => setOptions((l) => l.filter((_, k) => k !== i))}
                  >
                    <X className="size-4" />
                  </IconBtn>
                </div>
              ))}
              <AddBtn
                onClick={() =>
                  setOptions((l) => [...l, { id: newId("o"), text: "", correct: false }])
                }
              >
                Antwort hinzufügen
              </AddBtn>
            </div>
          ) : null}

          {q.type === "matching" ? (
            <div className="flex flex-col gap-2">
              <Label hint="links und das, was dazugehört">Paare</Label>
              {pairs.map((p, i) => (
                <div key={p.lid} className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-1 gap-1.5 rounded-xl sm:grid-cols-2 sm:gap-2">
                    <input
                      value={p.left}
                      onChange={(e) =>
                        setPairs((l) =>
                          l.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)),
                        )
                      }
                      className={field}
                    />
                    <input
                      value={p.right}
                      onChange={(e) =>
                        setPairs((l) =>
                          l.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)),
                        )
                      }
                      className={field}
                    />
                  </div>
                  <IconBtn
                    label="Paar entfernen"
                    onClick={() => setPairs((l) => l.filter((_, k) => k !== i))}
                  >
                    <X className="size-4" />
                  </IconBtn>
                </div>
              ))}
              <AddBtn
                onClick={() =>
                  setPairs((l) => [...l, { lid: newId("l"), rid: newId("r"), left: "", right: "" }])
                }
              >
                Paar hinzufügen
              </AddBtn>
            </div>
          ) : null}

          {q.type === "ordering" ? (
            <div className="flex flex-col gap-2">
              <Label hint="in der richtigen Reihenfolge">Schritte</Label>
              {items.map((it, i) => (
                <div key={it.id} className="flex items-center gap-1.5">
                  <span className="w-5 flex-none text-center text-[13px] font-bold text-lp-muted">
                    {i + 1}
                  </span>
                  <input
                    value={it.text}
                    onChange={(e) =>
                      setItems((l) =>
                        l.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    className={field}
                  />
                  <IconBtn
                    label="nach oben"
                    disabled={i === 0}
                    onClick={() => setItems((l) => move(l, i, -1))}
                  >
                    <ArrowUp className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="nach unten"
                    disabled={i === items.length - 1}
                    onClick={() => setItems((l) => move(l, i, 1))}
                  >
                    <ArrowDown className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Schritt entfernen"
                    onClick={() => setItems((l) => l.filter((_, k) => k !== i))}
                  >
                    <X className="size-4" />
                  </IconBtn>
                </div>
              ))}
              <AddBtn onClick={() => setItems((l) => [...l, { id: newId("i"), text: "" }])}>
                Schritt hinzufügen
              </AddBtn>
            </div>
          ) : null}

          {q.type === "cloze" ? (
            <div className="flex flex-col gap-2">
              <Label hint="mehrere Schreibweisen mit | trennen">Lösungen</Label>
              {blanks.length === 0 ? (
                <p className="text-[13px] text-lp-muted">
                  Setze im Fragetext Lücken als {"{{1}}"}, {"{{2}}"} …
                </p>
              ) : null}
              {blanks.map((b) => (
                <label key={b} className="flex items-center gap-2">
                  <span className="w-14 flex-none text-[13px] font-semibold text-lp-muted">
                    Lücke {b}
                  </span>
                  <input
                    value={answers[b] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [b]: e.target.value }))}
                    className={field}
                  />
                </label>
              ))}
            </div>
          ) : null}

          {q.type === "open" ? (
            <>
              <label className="flex flex-col gap-1.5">
                <Label hint="eine Zeile pro Punkt">Kernpunkte</Label>
                <textarea
                  value={keys}
                  onChange={(e) => setKeys(e.target.value)}
                  rows={5}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <Label>Musterantwort</Label>
                <textarea
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  rows={5}
                  className={field}
                />
              </label>
            </>
          ) : null}

          {q.type !== "open" ? (
            <label className="flex flex-col gap-1.5">
              <Label>Erklärung</Label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                rows={3}
                className={field}
              />
            </label>
          ) : null}

          {error ? <p className="text-[13px] text-lp-warn-ink">{error}</p> : null}
        </div>

        <div className="flex items-center gap-2 border-t border-lp-line px-5 py-4">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="min-h-11 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-lp-warn-ink hover:bg-lp-warn-soft"
          >
            {confirmDelete ? "Wirklich löschen?" : "Frage löschen"}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-lp-ink-3 hover:bg-lp-surface"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="min-h-11 rounded-xl bg-lp-sage px-5 text-sm font-bold text-lp-on-sage hover:bg-lp-sage-dark disabled:opacity-60"
          >
            {busy ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg px-2 text-[13px] font-semibold text-lp-sage hover:bg-lp-sage-soft"
    >
      <Plus className="size-4" strokeWidth={2.4} />
      {children}
    </button>
  );
}
