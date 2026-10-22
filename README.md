# Akcelport Industries website (design phase)

Public website for Akcelport Industries, redesigned from the 2016 PHP site. It is a static site generated from JSON files, so a CMS can edit `content/` later and trigger a rebuild. No dependencies, no `npm install`.

## Run it locally

Needs Node 20 or newer.

```bash
npm run build     # content/ + src/ + public/  ->  dist/
npm start         # serve dist/ at http://localhost:4173/ (builds first if dist/ is missing)
npm run dev       # same, but rebuilds when content/, src/ or public/ change
npm run check     # validate content only (missing files, unknown families, broken downloads)
```

`PORT=8080 npm start` changes the port. `dist/` is generated and git-ignored; deploy its contents to any static host (Apache, Nginx, Netlify...). Deployment is not part of this phase.

## Content structure

Everything the site says lives in `content/`. Templates never contain copy.

| File | What it holds |
|---|---|
| `content/site.json` | Company name, logo, contact details, navigation, quality marks, header stats, **enquiry form endpoint** |
| `content/home.json` | Hero bands and copy, section headings, process steps, industries, featured products |
| `content/about.json`, `contact.json` | About page sections, certificates, contact form labels |
| `content/categories/<slug>.json` | The six product families (name, summary, icon, product order) |
| `content/products/<slug>.json` | One file per product page (18). See below |
| `content/downloads.json` | Every PDF (23): title, file, pages, size, thumbnail, which products it belongs to |
| `content/markets.json` | Export markets by region (the "24" in the hero is counted from this) |
| `content/redirects.json` | Old `akcelport.com` URLs mapped to new ones |
| `content/countries.json`, `company-images.json` | Country list for the form; extra brochure imagery |

Tokens `{{markets}}` and `{{products}}` in any string are replaced with the counted values at build time.

### A product file

```jsonc
{
  "slug": "cable-lugs", "name": "Cable Lugs", "family": "connection-terminals", "order": 1,
  "legacyUrl": "cable-lugs.php",            // page on the old site, or null for new ranges
  "source": "existing",                     // "existing" (on the old site) or "new" (only in the new PDF datasheets)
  "summary": "...", "facts": [{ "label": "Material", "value": "ETP copper" }],
  "intro": ["paragraph", "..."], "features": ["..."], "applications": ["..."],
  "hero": { "src": "/img/products/cable-lugs/x.webp", "w": 870, "h": 420, "alt": "..." },
  "gallery": [ /* images */ ],
  "variants": [{ "id": "csla", "name": "...", "summary": "...", "images": [], "table": {}, "specImage": {} }],
  "tables": [{ "id": "ampacity", "title": "...", "columns": ["..."], "rows": [["..."]], "note": "..." }],
  "downloads": ["cable-lugs-legacy"],       // ids from content/downloads.json (must not be empty)
  "seo": { "description": "..." }
}
```

Add a product by adding a JSON file, listing its slug in its family under `content/categories/`, and adding its PDF to `public/downloads/` and `content/downloads.json`. `npm run check` fails if any referenced file or id is missing.

## Assets

- `public/downloads/catalogue/`: the 10 current datasheet PDFs supplied by the company. `public/downloads/legacy/`: the 13 PDFs from the old site (kept so every old download still works).
- `public/img/`: product and company images (WebP). Sources are the company's own: old-site photos and tables, and images extracted from the 10 PDFs. Nothing is AI generated.
- `public/fonts/`: self-hosted Archivo, IBM Plex Sans and IBM Plex Mono (latin subset).
- Old URLs: the build writes `dist/.htaccess` (Apache) and `dist/_redirects` (Netlify style) from `content/redirects.json`, including the 13 old PDF paths.

## Enquiry form

The contact form posts to one configurable endpoint, `form.endpoint` in `content/site.json` (a Formspree-style URL that accepts a POST and returns JSON). It is **empty on purpose**: until a value is set, the form shows a "Form endpoint not configured" notice and the submit button is disabled. No account has been created anywhere.

## Design notes

- Theme: switchgear grey and signal red (tokens at the top of `src/styles/base.css`); red is the accent, used for calls to action, focus and the chamfered-corner device on cards.
- The home hero is built in code (`src/client/hero.js`): a scroll-scrubbed canvas glide down three copper busbars on red standoff insulators, ending at a bolted splice joint. Phones, portrait tablets and reduced-motion visitors get the same scene as a still, with the copy laid out in the page. The five static-hero conditions are identical in `hero.js` and `src/styles/home.css`.
- Layout: `src/templates/` (plain JS template functions), `src/styles/`, `src/client/`. `scripts/build.mjs` and `scripts/serve.mjs` are the only scripts.

## Data caveats

Product tables were transcribed from the company PDFs (text extraction where the PDF has text, manual reading where it is a picture). The datasheet PDF is the reference. Two oddities are kept as printed in the source: `ERCS31500` appears twice in the copper bonded rod table (the 1800 mm row), and coupler `CP20` lists a 1/4" thread. The old-site PDFs are scans and the old product tables are pictures, so those pages show the original table images (click to enlarge) next to the structured data.
