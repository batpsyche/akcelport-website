-- Akcelport CMS schema. Content tables keep a live body (what the published site uses) and a draft body
-- (pending edits); status, slug and family_id are the desired values, published_* the values at the last publish.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id serial PRIMARY KEY,
  email citext UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('admin', 'editor')),
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE login_attempts (
  id bigserial PRIMARY KEY,
  email citext,
  ip text,
  succeeded boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (email, at);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, at);

CREATE TABLE password_tokens (
  token_hash text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('setup', 'reset')),
  expires_at timestamptz NOT NULL,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE TABLE media (
  id serial PRIMARY KEY,
  path text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'pdf')),
  mime text NOT NULL,
  bytes bigint NOT NULL,
  width int,
  height int,
  pages int,
  sha256 text NOT NULL,
  original_filename text,
  uploaded_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE families (
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

CREATE TABLE products (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  published_slug text,
  family_id int NOT NULL REFERENCES families(id),
  published_family_id int REFERENCES families(id),
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
CREATE INDEX products_family_idx ON products (family_id, sort_order);

CREATE TABLE downloads (
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

-- Site-wide documents: site (settings), home, about, contact, markets, countries, company-images.
CREATE TABLE pages (
  key text PRIMARY KEY,
  live jsonb,
  draft jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by int REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE redirects (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('page', 'download')),
  from_path text UNIQUE NOT NULL,
  to_path text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_versions (
  id serial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  version_no int NOT NULL,
  body jsonb NOT NULL,
  slug text,
  family_id int,
  note text,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, version_no)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  label text,
  changes jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, id DESC);

CREATE TABLE publishes (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('publish', 'preview', 'rollback')),
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_by int REFERENCES users(id) ON DELETE SET NULL,
  started_by_email text,
  release_id text,
  items jsonb,
  log text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
