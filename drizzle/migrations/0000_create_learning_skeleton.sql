CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  description text,
  exam_config jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int DEFAULT 0
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  type text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  solution jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  client_id text,
  session_id uuid,
  answer jsonb,
  score numeric,
  meta jsonb DEFAULT '{}'
);

CREATE INDEX idx_topics_subject_id ON public.topics(subject_id);
CREATE INDEX idx_questions_subject_id ON public.questions(subject_id);
CREATE INDEX idx_questions_topic_id ON public.questions(topic_id);
CREATE INDEX idx_attempts_question_id ON public.attempts(question_id);
CREATE INDEX idx_attempts_client_id ON public.attempts(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempts TO anon, authenticated;
GRANT ALL ON public.subjects TO service_role;
GRANT ALL ON public.topics TO service_role;
GRANT ALL ON public.questions TO service_role;
GRANT ALL ON public.attempts TO service_role;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public select subjects" ON public.subjects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert subjects" ON public.subjects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update subjects" ON public.subjects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete subjects" ON public.subjects FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "public select topics" ON public.topics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert topics" ON public.topics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update topics" ON public.topics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete topics" ON public.topics FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "public select questions" ON public.questions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert questions" ON public.questions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update questions" ON public.questions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete questions" ON public.questions FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "public select attempts" ON public.attempts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert attempts" ON public.attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update attempts" ON public.attempts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete attempts" ON public.attempts FOR DELETE TO anon, authenticated USING (true);