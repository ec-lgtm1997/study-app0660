import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Fragen aus Unterlagen erstellen – über Google Gemini (kostenloser Schlüssel aus AI Studio).
 * Der Schlüssel liegt NUR serverseitig als Secret GEMINI_API_KEY und ist unabhängig von
 * GROQ_API_KEY (der bleibt für die Auswertung offener Fragen).
 * Optional: GEMINI_MODEL, um ein bestimmtes Modell zu erzwingen.
 */
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];

function candidateModels(): string[] {
  const custom = process.env["GEMINI_MODEL"]?.trim();
  return [...new Set([...(custom ? [custom] : []), ...FALLBACK_MODELS])];
}

export const generatorAvailable = createServerFn({ method: "GET" }).handler(async () => {
  return { available: Boolean(process.env["GEMINI_API_KEY"]) };
});

export type GenerateResult =
  | { ok: true; json: string }
  | {
      ok: false;
      reason: "not_configured" | "limit" | "busy" | "too_large" | "error";
      detail?: string;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const Input = z.object({
  prompt: z.string().min(50).max(40_000),
  /** Unterlage als PDF (base64) … */
  pdfBase64: z.string().max(28_000_000).optional(),
  /** … oder als reiner Text (z. B. aus Word) */
  text: z.string().max(400_000).optional(),
});

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { ok: false, reason: "not_configured" };
    if (!data.pdfBase64 && !data.text)
      return { ok: false, reason: "error", detail: "Keine Unterlage" };

    const parts: unknown[] = [];
    if (data.pdfBase64)
      parts.push({ inline_data: { mime_type: "application/pdf", data: data.pdfBase64 } });
    if (data.text) parts.push({ text: `<unterlagen>\n${data.text}\n</unterlagen>` });
    parts.push({ text: data.prompt });

    let lastDetail = "";
    let sawBusy = false;
    let sawLimit = false;
    for (const model of candidateModels()) {
      // Bei Überlastung (503/500) oder kurzzeitigem Limit (429) erst warten und erneut versuchen
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": key },
              body: JSON.stringify({
                contents: [{ role: "user", parts }],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.6,
                  maxOutputTokens: 60_000,
                },
              }),
            },
          );
          if (res.status === 413) return { ok: false, reason: "too_large" };
          if (res.status === 503 || res.status === 500 || res.status === 429) {
            if (res.status === 429) sawLimit = true;
            else sawBusy = true;
            lastDetail = `${model}: ${res.status}`;
            console.error("Gemini ausgelastet", lastDetail, `Versuch ${attempt + 1}`);
            await sleep([4000, 12000, 0][attempt] ?? 0);
            continue;
          }
          if (!res.ok) {
            lastDetail = `${model}: ${res.status} ${(await res.text()).slice(0, 300)}`;
            console.error("Gemini abgelehnt", lastDetail);
            break; // nächstes Modell
          }
          const body = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
          };
          const cand = body.candidates?.[0];
          const out = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
          if (!out.trim()) {
            lastDetail = `${model}: leere Antwort (${cand?.finishReason ?? "?"})`;
            console.error("Gemini", lastDetail);
            break;
          }
          return { ok: true, json: out };
        } catch (e) {
          lastDetail = `${model}: ${e instanceof Error ? e.message : String(e)}`;
          console.error("Gemini-Aufruf fehlgeschlagen", lastDetail);
          break;
        }
      }
    }
    if (sawBusy) return { ok: false, reason: "busy", detail: lastDetail };
    if (sawLimit) return { ok: false, reason: "limit", detail: lastDetail };
    return { ok: false, reason: "error", detail: lastDetail };
  });
