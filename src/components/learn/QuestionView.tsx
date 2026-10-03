import { Check, X } from "lucide-react";
import { useState } from "react";
import { clozeBlanks, isClozeCorrect, type Answer, type LQuestion, type Option } from "@/lib/learn";

interface Props {
  q: LQuestion;
  answer: Answer;
  onChange: (a: Answer) => void;
  /** true = Lösung wird angezeigt (Feedback-Zustand) */
  revealed: boolean;
}

export function QuestionView({ q, answer, onChange, revealed }: Props) {
  switch (answer.kind) {
    case "choice":
      return <ChoiceView q={q} answer={answer} onChange={onChange} revealed={revealed} />;
    case "matching":
      return <MatchingView q={q} answer={answer} onChange={onChange} revealed={revealed} />;
    case "ordering":
      return <OrderingView q={q} answer={answer} onChange={onChange} revealed={revealed} />;
    case "cloze":
      return <ClozeView q={q} answer={answer} onChange={onChange} revealed={revealed} />;
    case "open":
      return <OpenView q={q} answer={answer} onChange={onChange} revealed={revealed} />;
  }
}

/** Fragetext; Lückentexte zeigen ihn selbst mit Eingabefeldern. */
export function questionTitle(q: LQuestion): string {
  if (q.type === "cloze") return "Ergänze die Lücken.";
  return q.content.text ?? "";
}

/* ------------------------------------------------------------------ */

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex size-7 flex-none items-center justify-center rounded-full text-white ${
        ok ? "bg-lp-sage" : "bg-lp-warn"
      }`}
    >
      {ok ? (
        <Check className="size-4" strokeWidth={3} />
      ) : (
        <X className="size-3.5" strokeWidth={3.2} />
      )}
    </span>
  );
}

const optionBase =
  "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-[15px] transition-colors min-h-[56px]";

/* Multiple Choice ---------------------------------------------------- */

function ChoiceView({
  q,
  answer,
  onChange,
  revealed,
}: Props & { answer: Extract<Answer, { kind: "choice" }> }) {
  const multiple = q.content.multiple === true;
  const correct = new Set(q.solution.correct ?? []);
  const options = q.content.options ?? [];

  const toggle = (id: string) => {
    if (revealed) return;
    const sel = answer.selected;
    const next = multiple ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id];
    onChange({ kind: "choice", selected: next });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {multiple && !revealed ? (
        <p className="text-sm font-semibold text-lp-muted">Mehrere Antworten möglich</p>
      ) : null}
      {options.map((o, i) => {
        const selected = answer.selected.includes(o.id);
        const isCorrect = correct.has(o.id);
        let cls = "border-[1.5px] border-lp-line bg-lp-surface hover:border-lp-sage-line";
        let badge = (
          <span
            className={`inline-flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold ${
              selected ? "bg-lp-ink text-white" : "bg-lp-line-soft text-lp-ink-3"
            }`}
          >
            {String.fromCharCode(65 + i)}
          </span>
        );
        if (!revealed && selected) cls = "border-2 border-lp-ink bg-lp-surface font-semibold";
        if (revealed && isCorrect) {
          cls = "border-2 border-lp-sage bg-lp-sage-soft font-semibold";
          badge = <Mark ok />;
        } else if (revealed && selected) {
          cls = "border-2 border-lp-warn bg-lp-warn-soft font-semibold";
          badge = <Mark ok={false} />;
        } else if (revealed) {
          cls = "border-[1.5px] border-lp-line bg-lp-surface opacity-70";
        }
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            disabled={revealed}
            onClick={() => toggle(o.id)}
            className={`${optionBase} ${cls}`}
          >
            {badge}
            <span className="flex-1">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Zuordnung ---------------------------------------------------------- */

function MatchingView({
  q,
  answer,
  onChange,
  revealed,
}: Props & { answer: Extract<Answer, { kind: "matching" }> }) {
  const [active, setActive] = useState<string | null>(null);
  const left = q.content.left ?? [];
  const right = q.content.right ?? [];
  const solution = new Map(q.solution.pairs ?? []);
  const pairs = answer.pairs;

  // Paare in Reihenfolge der linken Spalte nummerieren
  const pairNo = new Map<string, number>();
  left.forEach((l) => {
    if (pairs[l.id]) pairNo.set(l.id, pairNo.size + 1);
  });
  const rightNo = new Map<string, number>();
  for (const [l, r] of Object.entries(pairs)) rightNo.set(r, pairNo.get(l) ?? 0);
  const rightText = new Map(right.map((r) => [r.id, r.text]));

  const tapLeft = (id: string) => {
    if (revealed) return;
    if (pairs[id]) {
      const next = { ...pairs };
      delete next[id];
      onChange({ kind: "matching", pairs: next });
      setActive(id);
      return;
    }
    setActive(active === id ? null : id);
  };

  const tapRight = (id: string) => {
    if (revealed || !active) return;
    const next: Record<string, string> = {};
    for (const [l, r] of Object.entries(pairs)) if (r !== id) next[l] = r;
    next[active] = id;
    onChange({ kind: "matching", pairs: next });
    setActive(null);
  };

  const No = ({ n }: { n: number }) => (
    <span className="inline-flex size-[22px] flex-none items-center justify-center rounded-full bg-lp-sage text-xs font-extrabold text-white">
      {n}
    </span>
  );

  const cell = "flex min-h-[64px] w-full items-center gap-2 rounded-[14px] px-3 py-2.5 text-left";

  if (revealed) {
    return (
      <div className="flex flex-col gap-2.5">
        {left.map((l) => {
          const chosen = pairs[l.id];
          const ok = chosen === solution.get(l.id);
          return (
            <div
              key={l.id}
              className={`flex flex-col gap-1.5 rounded-2xl border-2 p-3.5 ${
                ok ? "border-lp-sage bg-lp-sage-soft" : "border-lp-warn bg-lp-warn-soft"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Mark ok={ok} />
                <span className="text-[15px] font-bold">{l.text}</span>
              </div>
              <span className="pl-[38px] text-sm text-lp-ink-2">
                {ok ? (
                  rightText.get(chosen ?? "")
                ) : (
                  <>
                    <span className="line-through opacity-70">
                      {rightText.get(chosen ?? "") ?? "–"}
                    </span>
                    <br />
                    <span className="font-semibold">
                      Richtig: {rightText.get(solution.get(l.id) ?? "")}
                    </span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-lp-muted">
        Tippe links einen Begriff an, dann rechts das Passende.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2.5">
          {left.map((l) => {
            const n = pairNo.get(l.id);
            const isActive = active === l.id;
            const cls = isActive
              ? "border-[2.5px] border-lp-ink bg-lp-surface shadow-[0_4px_14px_rgba(28,40,38,0.12)]"
              : n
                ? "border-[1.5px] border-lp-sage-line bg-lp-sage-soft"
                : "border-[1.5px] border-lp-line bg-lp-surface";
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => tapLeft(l.id)}
                className={`${cell} ${cls} text-[15px] font-bold`}
              >
                {n ? <No n={n} /> : null}
                <span>{l.text}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5">
          {right.map((r: Option) => {
            const n = rightNo.get(r.id);
            const cls = n
              ? "border-[1.5px] border-lp-sage-line bg-lp-sage-soft"
              : active
                ? "border-[1.5px] border-dashed border-[#9aa6a2] bg-lp-surface"
                : "border-[1.5px] border-lp-line bg-lp-surface";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => tapRight(r.id)}
                className={`${cell} ${cls} text-sm font-semibold`}
              >
                {n ? <No n={n} /> : null}
                <span>{r.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[13px] text-lp-muted">
        {Object.keys(pairs).length} von {left.length} zugeordnet · Tippe ein Paar links erneut an,
        um es zu lösen.
      </p>
    </div>
  );
}

/* Reihenfolge -------------------------------------------------------- */

function OrderingView({
  q,
  answer,
  onChange,
  revealed,
}: Props & { answer: Extract<Answer, { kind: "ordering" }> }) {
  const items = q.content.items ?? [];
  const text = new Map(items.map((i) => [i.id, i.text]));
  const solution = q.solution.order ?? [];
  const remaining = items.filter((i) => !answer.order.includes(i.id));

  const add = (id: string) =>
    !revealed && onChange({ kind: "ordering", order: [...answer.order, id] });
  const remove = (id: string) =>
    !revealed && onChange({ kind: "ordering", order: answer.order.filter((x) => x !== id) });

  return (
    <div className="flex flex-col gap-4">
      {!revealed ? (
        <p className="text-sm text-lp-muted">Tippe die Schritte in der richtigen Reihenfolge an.</p>
      ) : null}
      <ol className="flex flex-col gap-2">
        {answer.order.map((id, i) => {
          const ok = solution[i] === id;
          const cls = revealed
            ? ok
              ? "border-2 border-lp-sage bg-lp-sage-soft"
              : "border-2 border-lp-warn bg-lp-warn-soft"
            : "border-[1.5px] border-lp-sage-line bg-lp-sage-soft";
          return (
            <li key={id}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => remove(id)}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-[15px] font-semibold ${cls}`}
              >
                {revealed ? (
                  <Mark ok={ok} />
                ) : (
                  <span className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-lp-sage text-[13px] font-extrabold text-white">
                    {i + 1}
                  </span>
                )}
                <span className="flex-1">{text.get(id)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!revealed && remaining.length ? (
        <div className="flex flex-col gap-2">
          {remaining.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => add(i.id)}
              className="flex min-h-[52px] w-full items-center rounded-2xl border-[1.5px] border-dashed border-[#9aa6a2] bg-lp-surface px-3.5 py-2.5 text-left text-[15px]"
            >
              {i.text}
            </button>
          ))}
        </div>
      ) : null}
      {revealed && solution.some((id, i) => answer.order[i] !== id) ? (
        <div className="rounded-2xl border border-lp-line bg-lp-surface p-4">
          <p className="mb-2 text-sm font-bold text-lp-sage">Richtige Reihenfolge</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-lp-ink-2">
            {solution.map((id) => (
              <li key={id}>{text.get(id)}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/* Lückentext --------------------------------------------------------- */

function ClozeView({
  q,
  answer,
  onChange,
  revealed,
}: Props & { answer: Extract<Answer, { kind: "cloze" }> }) {
  const parts = (q.content.text ?? "").split(/(\{\{\d+\}\})/g);
  const blanks = clozeBlanks(q);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg leading-[2.4] text-lp-ink">
        {parts.map((part, i) => {
          const m = part.match(/^\{\{(\d+)\}\}$/);
          if (!m) return <span key={i}>{part}</span>;
          const b = m[1] ?? "";
          const value = answer.values[b] ?? "";
          const ok = isClozeCorrect(q, b, value);
          const cls = revealed
            ? ok
              ? "border-lp-sage bg-lp-sage-soft"
              : "border-lp-warn bg-lp-warn-soft"
            : "border-lp-sage-line bg-lp-surface focus:border-lp-sage";
          return (
            <input
              key={i}
              aria-label={`Lücke ${blanks.indexOf(b) + 1}`}
              value={value}
              disabled={revealed}
              onChange={(e) =>
                onChange({ kind: "cloze", values: { ...answer.values, [b]: e.target.value } })
              }
              className={`mx-1 inline-block w-36 rounded-lg border-2 px-2 py-0.5 text-center text-base font-semibold outline-none ${cls}`}
            />
          );
        })}
      </p>
      {revealed && blanks.some((b) => !isClozeCorrect(q, b, answer.values[b] ?? "")) ? (
        <div className="rounded-2xl border border-lp-line bg-lp-surface p-4 text-sm text-lp-ink-2">
          <p className="mb-1 font-bold text-lp-sage">Richtige Lösung</p>
          {blanks.map((b, i) => (
            <p key={b}>
              Lücke {i + 1}: <strong>{q.solution.answers?.[b]?.[0]}</strong>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* Offene Frage ------------------------------------------------------- */

function OpenView({
  q,
  answer,
  onChange,
  revealed,
}: Props & { answer: Extract<Answer, { kind: "open" }> }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`a-${q.id}`} className="text-[13px] font-bold text-lp-ink-3">
          Deine Antwort
        </label>
        <textarea
          id={`a-${q.id}`}
          rows={revealed ? 3 : 6}
          value={answer.text}
          readOnly={revealed}
          onChange={(e) => onChange({ kind: "open", text: e.target.value })}
          placeholder="Schreib deine Antwort in eigenen Worten …"
          className="w-full resize-none rounded-[14px] border-[1.5px] border-lp-line bg-lp-surface px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-lp-sage"
        />
      </div>
      {revealed ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-lp-line bg-lp-surface p-4">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-lp-sage">
            Musterlösung – Kernpunkte
          </span>
          <ul className="flex flex-col gap-2">
            {(q.solution.key_points ?? []).map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm leading-snug text-lp-ink-2">
                <Check className="mt-0.5 size-[18px] flex-none text-lp-sage" strokeWidth={2.4} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          {q.solution.model_answer ? (
            <details className="text-sm text-lp-ink-2">
              <summary className="cursor-pointer font-semibold text-lp-sage">
                Ausführliche Musterlösung
              </summary>
              <p className="mt-2 leading-relaxed">{q.solution.model_answer}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
