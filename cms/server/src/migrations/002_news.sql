-- News posts: the same item model as downloads (live/draft bodies, desired and published status and slug).
CREATE TABLE news_posts (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  published_slug text,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('hidden', 'live')),
  published_status text NOT NULL DEFAULT 'hidden' CHECK (published_status IN ('hidden', 'live')),
  live jsonb,
  draft jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by int REFERENCES users(id) ON DELETE SET NULL
);
