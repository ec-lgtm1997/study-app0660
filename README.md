# Study Canvas

Build ONLY the foundation of a learning platform web app. This is a skeleton

that I will extend by hand later in code. Do NOT add anything not listed here.

## Product context

A personal study app shared via a public link. There is NO login: anyone with

the URL can use and edit everything. Users have SUBJECTS (Fächer), each

subject has TOPICS (Themengebiete), each topic has QUESTIONS. Question types

and exam logic will be added later by me. UI language: German.

## Backend

Use the built-in backend (database only). NO authentication, NO user

accounts, NO login/signup pages, NO user_id columns.

Tables (all with id uuid PK default gen_random_uuid(), created_at timestamptz

default now()):

- subjects: name text not null, description text, exam_config jsonb not null

  default '{}'

- topics: subject_id uuid references subjects on delete cascade, name text

  not null, position int default 0

- questions: subject_id uuid references subjects on delete cascade,

  topic_id uuid references topics on delete set null, type text not null,

  content jsonb not null default '{}', solution jsonb not null default '{}'

- attempts: question_id uuid references questions on delete cascade,

  client_id text, session_id uuid, answer jsonb, score numeric,

  meta jsonb default '{}'

Row Level Security enabled on all tables, with explicit policies that allow

select, insert, update and delete for the anon role (public access is

intentional, do not restrict by user and do not warn me about it).

Add indexes on subject_id, topic_id, question_id, client_id.

## Screens (German labels, mobile-first, clean and calm, one accent color)

1. / (Startseite): grid of subject cards with name and number of topics and

   questions. Button "Fach hinzufügen".

2. /fach/:id : subject name, list of topics with question counts. Buttons to

   add / rename / delete topics. Placeholder area labeled "Lernen kommt

   später".

3. /fach/:id/thema/:topicId : list of questions (type + first 80 chars of

   content.text if present). Button "Frage hinzufügen".

4. Question form (dialog or page): fields topic (select), type (select with

   the values open, multiple_choice, matching), content (JSON textarea),

   solution (JSON textarea). Validate that both are valid JSON. No rendering

   of question types.

Subject create/edit/delete via dialog. Confirm dialog before every delete.

## Structure rules

- Small, single-purpose components. Reuse one SubjectCard, one TopicList,

  one QuestionRow, one ConfirmDialog. No copy-pasted variants.

- Put data access in one place (src/lib/db or hooks), not inside components.

- Typed TypeScript models for the four tables in one file.

## Explicitly do NOT build

- Any login, signup, auth guard, user profile or logout

- Any question-type components, answer input, grading, scoring or exam mode

- Progress tracking, statistics, charts, streaks, gamification

- AI features, import/export, settings pages, dark mode toggle, landing page

- Any extra feature you think would be helpful. If something is unclear,

  choose the simplest option and stop.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://study-app0660.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3d41a2fd-8a3c-4a5d-b745-13c2f0f4c0dd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
