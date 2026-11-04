# Akcelport CMS (backoffice)

A self-hosted backoffice for the Akcelport Industries website. Content lives in PostgreSQL; a **Publish** button exports it to the `content/` JSON shape, runs the website's own build (`scripts/build.mjs`), validates it and swaps the result into place atomically. The public site stays a zero-dependency static site; everything in this folder is the CMS only.

- **Stack:** Node 22, Fastify 5, PostgreSQL, TypeScript; React + Vite admin UI with shadcn/ui (Radix + Tailwind) and dnd-kit for drag ordering.
- **Auth:** email and password inside the app (scrypt hashing), server-side sessions in PostgreSQL, HttpOnly `SameSite=Strict` cookie, CSRF token header on every state-changing call, login rate limiting. Roles: **admin** (users, site settings, form endpoint, redirects, rollback) and **editor** (products, families, downloads, pages, media, publish when allowed).
- **Content model:** every item has a *live* body (what the published site uses) and an optional *draft* (pending edits), a *visible/hidden* status, numbered versions you can revert to, and an audit log of who changed what.
- **Publish:** `PUBLISH_DIR/releases/<id>/` per publish, `PUBLISH_DIR/current` symlink swapped atomically, the last `PUBLISH_KEEP` releases kept for one-click rollback, and `PUBLISH_DIR/preview/` for a build of the drafts (served behind login at `/preview/`). A failed build leaves the published site untouched and shows the build log.

## Run locally (development)

Needs Node 22+ and PostgreSQL (Docker is the easiest way to get one).

```bash
cd cms
cp .env.example .env          # set POSTGRES_PASSWORD and SESSION_SECRET
docker compose up -d db       # PostgreSQL 17 on localhost:5432
npm install
npm run migrate               # create the schema
npm run seed                  # load content/ and public/ from the website repo into the database and MEDIA_DIR
npm run create-admin -- --email you@example.com   # first administrator (prompts for a password)
npm run dev                   # API + admin on http://localhost:3000, published site on http://localhost:4174
```

For UI development with hot reload run `npm run dev:client` as well and open http://localhost:5173 (it proxies the API to port 3000). Otherwise build the admin once with `npm run build` and port 3000 serves it.

`npm run seed -- --reset` replaces the content tables with the repository content again (users and the audit log are kept). `npm test` runs the test suite against `TEST_DATABASE_URL` (defaults to the `DATABASE_URL` database name with `_test` appended; the database is created if missing).

## Run with Docker (self-hosting)

```bash
cd cms
cp .env.example .env          # set POSTGRES_PASSWORD, SESSION_SECRET, ADMIN_PASSWORD (bootstrap only); SITE_URL for the public origin
docker compose up -d --build  # builds the image from the repository root and starts db + cms
docker compose exec cms npm run seed
docker compose exec cms npm run create-admin -- --email you@example.com    # uses ADMIN_PASSWORD from .env
```

The backoffice is on http://127.0.0.1:3000/ and the published site on http://127.0.0.1:4174/. Both ports are bound to localhost only; put a web server with HTTPS in front (below) and set `SESSION_SECURE=1` and `TRUST_PROXY=1` in `.env`.

Media and releases live in the named volumes `akcelport-cms_media` and `akcelport-cms_publish`; the database in `akcelport-cms_pgdata`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `SESSION_SECRET` | required | Signs the session cookie; at least 32 random characters |
| `PORT` | `3000` | Backoffice API and admin UI |
| `SITE_PORT` | `4174` | Serves the currently published site at the root path |
| `MEDIA_DIR` | `./data/media` | Uploaded photos and PDFs (`img/...`, `downloads/...`, the website's `public/` layout) |
| `PUBLISH_DIR` | `./data/publish` | `releases/`, `current`, `preview/` |
| `SITE_ROOT` | `..` | The website repository (build script, templates, fonts, seed content) |
| `SITE_URL` | from Site settings | Public origin for canonical URLs and the sitemap |
| `PUBLISH_KEEP` | `5` | Releases kept for rollback |
| `SESSION_SECURE` | `1` in production | Mark the cookie `Secure` (HTTPS only) |
| `TRUST_PROXY` | `0` | Trust `X-Forwarded-For` behind a reverse proxy |
| `SESSION_IDLE_HOURS` / `SESSION_MAX_DAYS` | `12` / `7` | Session idle and absolute lifetime |
| `UPLOAD_IMAGE_MAX_MB` / `UPLOAD_PDF_MAX_MB` | `10` / `25` | Upload limits |
| `ADMIN_PASSWORD` | | Only read by `create-admin` when no password is typed |

No secrets are committed: `.env` is git-ignored and `.env.example` holds placeholders only.

## Users

- `npm run create-admin -- --email you@example.com [--name "Name"] [--password "..."]` creates an administrator. Without `--password` it prompts, or reads `ADMIN_PASSWORD`.
- Administrators add users on the **Users** page. A new user gets a one-time setup link (valid 48 hours) to copy and hand over, or a temporary password they must change at first sign-in. **Reset password** works the same way and signs the user out everywhere. The CMS sends no email.
- Sign-in is limited to 5 failed attempts per account (20 per IP) in 15 minutes.

## Editing and publishing

- Saving an item stores a **draft**; the live site is unchanged until someone presses **Publish**. The Publish page lists every pending change (edits, new items, hidden/shown, deletions) with checkboxes.
- **Preview changes** builds the drafts into `/preview/` (signed-in users only) without touching the published site.
- **Hidden** items stay in the CMS but are left out of the site at the next publish. Deleting a published item marks it for deletion until the next publish (restore is possible until then); never-published items are removed immediately.
- Every save is a **version**; **Restore** next to an earlier version copies it back as the draft. **Discard draft** returns to the live body.
- **Rollback** (admin) re-points the site at an earlier release without changing the database.
- Editors can publish by default; an administrator can reserve publishing to admins in **Site settings**.

## Serving the published site

The CMS already serves `PUBLISH_DIR/current` on `SITE_PORT` with the site's `_redirects` honoured, which is enough for local use. In production let a web server serve the directory directly:

```nginx
# nginx: the published site
server {
  server_name www.akcelport.com;
  root /var/lib/docker/volumes/akcelport-cms_publish/_data/current;   # or a bind mount of PUBLISH_DIR
  index index.html;
  location / { try_files $uri $uri/ =404; }
  error_page 404 /404.html;
  # include the 301 rules from current/_redirects (or use the generated .htaccess with Apache)
}
# nginx: the backoffice, HTTPS only
server {
  server_name cms.akcelport.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header Host $host; client_max_body_size 30m; }
}
```

Because `current` is a symlink that is replaced atomically, visitors never see a half-written site, and rollback is instant. Apache can use the generated `current/.htaccess` for the old-URL redirects.

## Backups

- **Database:** `docker compose exec db pg_dump -U akcelport akcelport_cms > backup.sql` (restore with `psql`). Contains all content, versions, users (hashed passwords), audit log and publish history.
- **Media:** copy the `media` volume (`docker run --rm -v akcelport-cms_media:/m -v "$PWD":/b alpine tar czf /b/media.tgz -C /m .`) or `MEDIA_DIR` when running without Docker.
- **Releases** (`PUBLISH_DIR`) are reproducible from the database and media, so backing them up is optional.

## Tests

`npm test` covers authentication and roles (cookies, CSRF, rate limiting, admin-only routes, invitations and resets), the content round trip (seed → export → build is byte-identical to a build of the repository), content editing rules (validation, versions, revert, ordering, media uploads) and publishing (release swap, served site, failed build leaves the site and the drafts untouched, preview, selective publish, pruning, rollback). `.github/workflows/cms-tests.yml` runs them with a PostgreSQL service.

## Layout

```
cms/
  server/src/        Fastify API: auth/, users/, content/, media/, publish/, seed.ts, migrations/
  shared/            zod content schemas (mirror content/*.json) and page field specs
  client/            React admin (Vite): pages/, components/, lib/
  test/              node:test suites (real PostgreSQL)
  Dockerfile, docker-compose.yml, .env.example
```
