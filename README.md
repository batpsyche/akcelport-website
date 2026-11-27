# Akcelport Industries website (design phase)

Public website for Akcelport Industries, redesigned from the 2016 PHP site. It is a static site generated from JSON files; the backoffice CMS under `cms/` edits that content and publishes rebuilt releases (see [cms/README.md](cms/README.md)). The site itself has no dependencies, no `npm install`.

## Run it locally

Needs Node 20 or newer.

```bash
npm run build     # content/ + src/ + public/  ->  dist/
npm start         # serve dist/ at http://localhost:4173/ (builds first if dist/ is missing)
npm run dev       # same, but rebuilds when content/, src/ or public/ change
npm run check     # validate content only (missing files, unknown families, broken downloads)
```

`PORT=8080 npm start` changes the port. `dist/` is generated and git-ignored; deploy its contents to any static host (Apache, Nginx, Netlify...). Deployment is not part of this phase.

`node scripts/build.mjs --content <dir> --out <dir> --assets <dir>` builds from another content directory into another output directory, overlaying extra asset directories on `public/`; the CMS in `cms/` uses this to publish. Without those flags the build behaves exactly as above.

`SITE_BASE` (default `/`) builds the site for a sub-folder, e.g. `SITE_BASE=/akcelport-website/ npm run build`; `SITE_URL` optionally overrides the origin used for canonical, sitemap and OG URLs. `.github/workflows/pages.yml` uses both to publish a client preview to GitHub Pages.

## Content structure

Everything the site says lives in `content/`. Templates never contain copy.

| File | What it holds |
|---|---|
| `content/site.json` | Company name, logo, contact details, navigation, quality marks, header stats, **enquiry form endpoint**, language menu on/off (`translate.enabled`) |
| `content/home.json` | Section order and visibility (`sections`), hero slider slides, the old animated hero's bands and copy, section headings, process steps, industries, featured products |
| `content/about.json`, `contact.json` | About page sections, certificates, contact form labels, each with its own `sections` list |
| `content/categories/<slug>.json` | The six product families (name, summary, icon, product order) |
| `content/products/<slug>.json` | One file per product page (18). See below |
| `content/downloads.json` | Every PDF (23): title, file, pages, size, thumbnail, which products it belongs to |
| `content/news/<slug>.json` | News posts (optional folder): title, date (`YYYY-MM-DD`), category, summary, optional `cover` image and `pdf` attachment, and a rich-text `body`. They make `/news/`, one page per post and the latest-3 strip on the home page. The two `sample-*` posts are placeholders |
| `content/markets.json` | Export markets by region (the "24" in the hero is counted from this) |
| `content/redirects.json` | Old `akcelport.com` URLs mapped to new ones |
| `content/countries.json`, `company-images.json` | Country list for the form; extra brochure imagery |

Tokens `{{markets}}` and `{{products}}` in any string are replaced with the counted values at build time.

### Sections: order and show/hide

`home.json`, `about.json` and `contact.json` carry `"sections": [{ "id": "stats", "enabled": true }, ...]`. The build renders the enabled sections in that order (`src/lib/sections.mjs` holds the ids per page; a section missing from the list is shown in its default place, an unknown id fails `npm run check`). The CMS edits this list with a switch per section (Home sections can also be dragged into a new order). Home sections: `slider`, `hero` (the old animated canvas hero, hidden by default), `stats`, `products` (the products page's search, family filter and grid, right after the statistics by default), `families`, `process`, `featured`, `industries`, `global`, `brochure`, `news`, `cta`. About: `story`, `quality`, `usp`, `manufacturing`, `global`, `certificates`, `cta`. Contact: `details` (office and enquiry form). The page heading of About and Contact always shows.

### Hero slider

`home.slider.slides[]`: `image` (landscape, about 16:9, for desktops and laptops), `imagePortrait` (about 9:16, for phones in portrait; a `<picture>` source picks it), `kicker`, `headline`, `text`, `cta` (`label`, `href`) and `tone`: `dark` (dark caption text, the default, for the white banners) or `light` (white text on a dark scrim, for darker images). `intervalSeconds` sets the autoplay pace. The slider is plain JavaScript in `src/client/site.js`: autoplay with a pause button, arrows, dots, arrow keys and swipe; autoplay stops while the pointer or keyboard focus is inside, and never starts for visitors who prefer reduced motion. The first slide's headline is the page's `h1`.

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
- `public/img/`: product and company images (WebP). Sources are the company's own: old-site photos and tables, and images extracted from the 10 PDFs.
- `public/img/hero/`: the three hero slider banners (landscape 1920x1086 and portrait 1080x1920 WebP), generated with Higgsfield (GPT Image 2.5) as exploded technical views of Akcelport components on white with red callout lines. No text is baked in; captions are live text. Banner 3's portrait (`public/img/hero/banner-3-portrait.webp`) is, for now, a recomposition of its landscape image: the generation of its own portrait was blocked by the plan's daily limit. 11.25 of the approved 150 Higgsfield credits are spent; one portrait job (about 2.25 credits) is still approved, to replace that file when the daily limit allows.
- **AI-enhanced hero photos (8 products).** The main photo of the 8 products flagged below (and so their card and family thumbnails) was upscaled and cleaned with Higgsfield's Bytedance Image Upscale from the company's original image, with no change to the product. Those images are flagged `"aiEnhanced": true` in the product JSON, carry the untouched original in `public/img/products/<slug>/originals/` (linked from the product page as "View original"), and the footer discloses it (`aiNotice` in `content/site.json`). The 8 are Cable Lugs, Cable Ducts, Copper Busbars, Flexibars, Copper Grounding Bars, Neutral / Earth Bars, Test Terminal Blocks and Cable Glands; every other photo is the unmodified original (the client can supply HD photos later). Remove the flag and point `hero.src` at the original to revert one.
- `public/fonts/`: self-hosted Archivo, IBM Plex Sans and IBM Plex Mono (latin subset).
- Old URLs: the build writes `dist/.htaccess` (Apache) and `dist/_redirects` (Netlify style) from `content/redirects.json`, including the 13 old PDF paths.

## Enquiry form

The contact form posts to one configurable endpoint, `form.endpoint` in `content/site.json` (a Formspree-style URL that accepts a POST and returns JSON). It is **empty on purpose**: until a value is set, the form shows a "Form endpoint not configured" notice and the submit button is disabled. No account has been created anywhere.

A slim bar above the header on every page carries Google Translate's free "Select Language" menu (every language Google offers; no key or account). It is on while `translate.enabled` in `content/site.json` is not `false` (the CMS switch is under Settings → Language menu and takes effect on the next Publish). `src/client/site.js` loads Google's script only after the page has loaded, and removes the bar if the script is blocked or fails. Google's top banner is hidden so the page does not jump; while a page is translated, a "Show original" button beside the menu clears the `googtrans` cookie and reloads in English. The logo is marked `notranslate`.

## Design notes

- Theme: switchgear grey and signal red (tokens at the top of `src/styles/base.css`); red is the accent, used for calls to action, focus and the chamfered-corner device on cards.
- The home page opens with the white hero slider (see Hero slider above). The earlier hero, built in code (`src/client/hero.js`, a scroll-scrubbed canvas glide down three copper busbars), is kept and can be switched back on as the `hero` section; `hero.js` loads only while it is shown. Phones, portrait tablets and reduced-motion visitors get that scene as a still. The five static-hero conditions are identical in `hero.js` and `src/styles/home.css`.
- Layout: `src/templates/` (plain JS template functions), `src/styles/`, `src/client/`. `scripts/build.mjs` and `scripts/serve.mjs` are the only scripts.

## Data caveats

Product tables were transcribed from the company PDFs (text extraction where the PDF has text, manual reading where it is a picture). The datasheet PDF is the reference. Two oddities are kept as printed in the source: `ERCS31500` appears twice in the copper bonded rod table (the 1800 mm row), and coupler `CP20` lists a 1/4" thread. The old-site PDFs are scans and the old product tables are pictures, so those pages show the original table images (click to enlarge) next to the structured data. The old cable lugs scan was recompressed from 20.7 MB to 3.2 MB (17 pages, 150 dpi); the original is not shipped.
