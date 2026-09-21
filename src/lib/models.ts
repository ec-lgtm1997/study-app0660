export type QuestionType = "open" | "multiple_choice" | "matching";

export type Json = Record<string, unknown>;

export interface Subject {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  exam_config: Json;
}

export interface Topic {
  id: string;
  created_at: string;
  subject_id: string | null;
  name: string;
  position: number | null;
}

export interface Question {
  id: string;
  created_at: string;
  subject_id: string | null;
  topic_id: string | null;
  type: string;
  content: Json;
  solution: Json;
}

export interface Attempt {
  id: string;
  created_at: string;
  question_id: string | null;
  client_id: string | null;
  session_id: string | null;
  answer: Json | null;
  score: number | null;
  meta: Json | null;
}
