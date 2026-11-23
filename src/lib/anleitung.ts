/**
 * Anleitung, die zusammen mit den Unterlagen an ChatGPT (oder ein ähnliches Tool) geht.
 * Das Ergebnis lässt sich unter „Fragen hinzufügen“ direkt hochladen.
 */
export function buildAnleitung(input: {
  subject: string;
  count: number;
  topics: string[];
  /** true = direkt aus der App (keine Datei anbieten, keine Aufteilung) */
  direct?: boolean;
  /** Alle Fragen in genau dieses Themengebiet */
  fixedTopic?: string | undefined;
  /** ersetzt die Zeile zur Fragetypen-Mischung */
  mixLine?: string | undefined;
  /** ersetzt die Zeile zur Schwierigkeit */
  difficultyLine?: string | undefined;
  /** eigener Wunsch der Nutzerin */
  wish?: string | undefined;
  /** true = es liegen zusätzlich die Lernziele bei */
  withLernziele?: boolean | undefined;
}): string {
  const subject = input.subject.trim() || "NAME DES FACHS";
  const topics = input.fixedTopic
    ? `Alle Fragen gehören zum Themengebiet „${input.fixedTopic}“. Setze bei jeder Frage "topic": "${input.fixedTopic}" und "topics": ["${input.fixedTopic}"].`
    : input.topics.length
      ? `Diese Themengebiete gibt es im Fach schon. Verwende sie, wenn eine Frage dazu passt (exakt gleich geschrieben), sonst lege neue an:\n${input.topics.map((t) => `- ${t}`).join("\n")}`
      : "Teile die Fragen in sinnvolle Themengebiete ein (3 bis 8, kurze Namen).";

  return `Du erstellst Prüfungsfragen für das Pflegestudium (Gesundheits- und Krankenpflege, Österreich) zum Fach „${subject}“. Die Fragen werden in eine Lern-App importiert. Halte dich exakt an das Format unten.

## Unterlagen
Ich hänge meine Unterlagen an. Verwende sie so:
1. Zusammenfassung = wichtigste Grundlage. Alles, was dort steht, soll abgefragt werden.
2. Lernziele = Orientierung, was in der Prüfung wichtig ist. Fragen zu Lernzielen markierst du mit "exam_relevant": true.
3. Folien und Skripte = Ergänzung, falls etwas in der Zusammenfassung fehlt oder unklar ist.
Erfinde keine Inhalte, die nicht durch die Unterlagen gedeckt sind. Wenn du etwas ableitest (z. B. ein Fallbeispiel), setze "derived": true.

## Umfang und Mischung
- Erstelle ${input.count} Fragen. Decke die Unterlagen möglichst vollständig ab, keine doppelten Fragen.
- ${input.difficultyLine ?? "Schwierigkeit: etwa 25 % leicht (1), 45 % mittel (2), 30 % anspruchsvoll (3)."}
- ${input.mixLine ?? "Fragetypen mischen: etwa 60 % multiple_choice, 15 % matching, 8 % ordering, 7 % cloze, 10 % open."}
- Viele kurze Fallbeispiele aus dem Pflegealltag („Frau M., 74, …“), besonders bei mittleren und anspruchsvollen Fragen.
- Falsche Antwortoptionen müssen plausibel sein, nicht offensichtlich falsch. Die richtige Option nicht immer an dieselbe Stelle setzen.
- Jede Frage bekommt eine kurze Erklärung („explanation“), warum die Lösung stimmt.
- Sprache: Deutsch, österreichische Begriffe, geschlechtergerecht wie in den Unterlagen.

${input.withLernziele ? '\n## Lernziele\nDie Lernziele liegen als eigene Unterlage bei (markiert als <lernziele> oder als zweites Dokument). Erstelle aus ihnen KEINE eigenen Fragen, sondern nutze sie nur, um prüfungsrelevante Inhalte zu erkennen und mit "exam_relevant": true zu markieren. Grundlage der Fragen ist ausschließlich die andere Unterlage.\n' : ""}${input.wish?.trim() ? `\n## Besonderer Wunsch\n${input.wish.trim()}\n` : ""}
## Themengebiete
${topics}

## Format
Antworte ausschließlich mit EINEM JSON-Objekt, ohne Text davor oder danach.${input.direct ? "" : " Biete es mir am besten als Datei „fragen.json“ zum Herunterladen an."} Aufbau:

{
  "subject": "${subject}",
  "topics": ["Themengebiet A", "Themengebiet B"],
  "questions": [ … ]
}

Jede Frage hat: "id" (eindeutig, z. B. "f001", "f002" …), "topic" (eines der Themengebiete), "type", "content", "solution" und "meta".
"meta" sieht immer so aus: {"difficulty": 1|2|3, "source": "woher, z. B. Zusammenfassung S. 4", "tags": ["1–3 Stichworte"], "derived": false, "exam_relevant": true|false}

So sehen die fünf Fragetypen aus (genau diese Feldnamen verwenden):

1. multiple_choice – eine oder mehrere richtige Antworten. Bei mehreren richtigen: "multiple": true und im Fragetext „(Mehrfachauswahl)“.
{"id":"f001","topic":"Themengebiet A","type":"multiple_choice",
 "content":{"text":"Fragetext?","multiple":false,"options":[{"id":"a","text":"…"},{"id":"b","text":"…"},{"id":"c","text":"…"},{"id":"d","text":"…"}]},
 "solution":{"correct":["c"],"explanation":"Warum c stimmt."},
 "meta":{"difficulty":2,"source":"Zusammenfassung S. 3","tags":["Stichwort"],"derived":false,"exam_relevant":true}}

2. matching – Paare zuordnen. "left" und "right" gleich viele Einträge (3 bis 6), jede rechte Seite genau einmal und mit unterschiedlichem Text. Rechte Spalte in gemischter Reihenfolge.
{"id":"f002","topic":"…","type":"matching",
 "content":{"text":"Ordne zu.","left":[{"id":"l1","text":"…"},{"id":"l2","text":"…"},{"id":"l3","text":"…"}],"right":[{"id":"r1","text":"…"},{"id":"r2","text":"…"},{"id":"r3","text":"…"}]},
 "solution":{"pairs":[["l1","r2"],["l2","r3"],["l3","r1"]],"explanation":"…"},
 "meta":{…}}

3. ordering – Schritte in die richtige Reihenfolge bringen. "items" in gemischter Reihenfolge, "order" = richtige Reihenfolge der IDs.
{"id":"f003","topic":"…","type":"ordering",
 "content":{"text":"Bringe in die richtige Reihenfolge.","items":[{"id":"i1","text":"…"},{"id":"i2","text":"…"},{"id":"i3","text":"…"}]},
 "solution":{"order":["i2","i3","i1"],"explanation":"…"},
 "meta":{…}}

4. cloze – Lückentext. Lücken im Text als {{1}}, {{2}}. Pro Lücke eine Liste erlaubter Schreibweisen.
{"id":"f004","topic":"…","type":"cloze",
 "content":{"text":"Eine Mikroschulung dauert ca. {{1}} Minuten."},
 "solution":{"answers":{"1":["20–30","20-30","20 bis 30"]},"explanation":"…"},
 "meta":{…}}

5. open – offene Frage, meist ein Fallbeispiel. Musterantwort plus 3 bis 5 Kernpunkte, an denen die Antwort gemessen wird.
{"id":"f005","topic":"…","type":"open",
 "content":{"text":"Fallbeispiel … Wie gehst du vor?"},
 "solution":{"model_answer":"Ausführliche Musterantwort.","key_points":["Kernpunkt 1","Kernpunkt 2","Kernpunkt 3"]},
 "meta":{…}}

## Wichtig
- Gültiges JSON: doppelte Anführungszeichen, keine Kommentare, keine abgeschnittenen Stellen.
${input.direct ? "" : "- Wenn die Antwort zu lang wird, teile in mehrere vollständige JSON-Dateien auf (z. B. je 40 Fragen) und nummeriere die IDs fortlaufend weiter.\n"}- Keine Prüfungen und keinen Notenschlüssel erstellen, das macht die App selbst.`;
}
