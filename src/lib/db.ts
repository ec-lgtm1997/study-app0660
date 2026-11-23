import { supabase } from "@/integrations/supabase/client";
import type { Json, Question, Subject, Topic } from "./models";

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .order("created_at", { ascending: true });
  return unwrap(data as unknown as Subject[], error);
}

export async function getSubject(id: string): Promise<Subject> {
  const { data, error } = await supabase.from("subjects").select("*").eq("id", id).single();
  return unwrap(data as unknown as Subject, error);
}

export async function createSubject(input: { name: string; description: string | null }) {
  const { error } = await supabase.from("subjects").insert(input);
  if (error) throw new Error(error.message);
}

export async function updateSubject(
  id: string,
  input: { name: string; description: string | null },
) {
  const { error } = await supabase.from("subjects").update(input).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Löscht ein Fach vollständig: Ergebnisse zu seinen Fragen, Fragen, Themengebiete, Fach.
 * Schritt für Schritt, damit es unabhängig von Datenbank-Kaskaden funktioniert.
 */
export async function deleteSubject(id: string) {
  const qs = await supabase.from("questions").select("id").eq("subject_id", id);
  if (qs.error) throw new Error(qs.error.message);
  const ids = (qs.data ?? []).map((q) => q.id as string);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const a = await supabase.from("attempts").delete().in("question_id", chunk);
    if (a.error) throw new Error(a.error.message);
    const q = await supabase.from("questions").delete().in("id", chunk);
    if (q.error) throw new Error(q.error.message);
  }
  const t = await supabase.from("topics").delete().eq("subject_id", id);
  if (t.error) throw new Error(t.error.message);
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listTopics(subjectId: string): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("subject_id", subjectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return unwrap(data as unknown as Topic[], error);
}

export async function getTopic(id: string): Promise<Topic> {
  const { data, error } = await supabase.from("topics").select("*").eq("id", id).single();
  return unwrap(data as unknown as Topic, error);
}

export async function createTopic(input: { subject_id: string; name: string }) {
  const { error } = await supabase.from("topics").insert(input);
  if (error) throw new Error(error.message);
}

export async function renameTopic(id: string, name: string) {
  const { error } = await supabase.from("topics").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTopic(id: string) {
  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listQuestions(filter: {
  subjectId?: string;
  topicId?: string;
}): Promise<Question[]> {
  let query = supabase.from("questions").select("*");
  if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
  if (filter.topicId) query = query.eq("topic_id", filter.topicId);
  const { data, error } = await query.order("created_at", { ascending: true });
  return unwrap(data as unknown as Question[], error);
}

export async function createQuestion(input: {
  subject_id: string;
  topic_id: string | null;
  type: string;
  content: Json;
  solution: Json;
}) {
  const { error } = await supabase.from("questions").insert(input as never);
  if (error) throw new Error(error.message);
}

export async function deleteQuestion(id: string) {
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface SubjectCounts {
  topics: number;
  questions: number;
}

export async function countsBySubject(): Promise<Record<string, SubjectCounts>> {
  const [topics, questions] = await Promise.all([
    supabase.from("topics").select("subject_id"),
    supabase.from("questions").select("subject_id"),
  ]);
  if (topics.error) throw new Error(topics.error.message);
  if (questions.error) throw new Error(questions.error.message);

  const counts: Record<string, SubjectCounts> = {};
  const bump = (id: string | null, key: keyof SubjectCounts) => {
    if (!id) return;
    counts[id] ??= { topics: 0, questions: 0 };
    counts[id][key] += 1;
  };
  for (const row of topics.data ?? []) bump(row.subject_id, "topics");
  for (const row of questions.data ?? []) bump(row.subject_id, "questions");
  return counts;
}

export async function countQuestionsByTopic(subjectId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("questions")
    .select("topic_id")
    .eq("subject_id", subjectId);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.topic_id) continue;
    counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
  }
  return counts;
}
