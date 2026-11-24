ALTER TABLE projects ADD COLUMN IF NOT EXISTS pillar text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sub_pillar text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revenue_forecast numeric(18,2) NOT NULL DEFAULT 0 CHECK(revenue_forecast>=0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revenue_actual numeric(18,2) NOT NULL DEFAULT 0 CHECK(revenue_actual>=0);
CREATE TABLE IF NOT EXISTS project_modules (
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('operations','risks','assignments','mom')),
 data jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,kind)
);
CREATE TABLE IF NOT EXISTS corporate_meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, date date NOT NULL,
 moderator text NOT NULL DEFAULT '', notulis text NOT NULL DEFAULT '', participants text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final')),
 previous_id uuid REFERENCES corporate_meetings(id), created_by uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz
);
CREATE TABLE IF NOT EXISTS corporate_meeting_projects (
 meeting_id uuid NOT NULL REFERENCES corporate_meetings(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES projects(id), snapshot jsonb NOT NULL,
 previous_notes text NOT NULL DEFAULT '', review jsonb NOT NULL DEFAULT '{"review":"pending","health":"unrated","summary":"","items":[],"actions":[]}',
 PRIMARY KEY(meeting_id,project_id)
);
