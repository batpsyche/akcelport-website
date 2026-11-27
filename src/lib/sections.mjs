// Section order and visibility for the CMS-edited pages. A page document may carry
//   "sections": [{ "id": "stats", "enabled": true }, ...]
// The array order is the order on the page; "enabled": false hides that section. Unknown ids are ignored, and a known
// section missing from the list is shown, inserted after the section that precedes it in the default order.
// The CMS keeps its own copy of these ids, with labels (cms/shared/page-fields.ts); a CMS test checks they match.

export const PAGE_SECTIONS = {
  home: ['slider', 'hero', 'stats', 'products', 'families', 'process', 'featured', 'industries', 'global', 'brochure', 'news', 'cta'],
  about: ['story', 'quality', 'usp', 'manufacturing', 'global', 'certificates', 'cta'],
  contact: ['details'],
};

// The default visibility of a section when the document does not list it: everything is shown, except the old
// animated home hero, which stays hidden once the home document has hero slider slides.
function defaultEnabled(page, id, doc) {
  if (page === 'home' && id === 'hero') return !(doc?.slider?.slides?.length > 0);
  return true;
}

/** The page's sections in order, each { id, enabled }. */
export function resolveSections(page, doc) {
  const known = PAGE_SECTIONS[page] || [];
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(doc?.sections) ? doc.sections : []) {
    if (!s || !known.includes(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, enabled: s.enabled !== false });
  }
  known.forEach((id, i) => {
    if (seen.has(id)) return;
    const prev = known.slice(0, i).reverse().find((p) => seen.has(p));
    const at = prev ? out.findIndex((s) => s.id === prev) + 1 : 0;
    out.splice(at, 0, { id, enabled: defaultEnabled(page, id, doc) });
    seen.add(id);
  });
  return out;
}

/** Ids of the sections to render, in order. */
export const visibleSections = (page, doc) => resolveSections(page, doc).filter((s) => s.enabled).map((s) => s.id);

/** Problems with a page's "sections" list (for the content check). */
export function sectionProblems(page, doc) {
  if (doc?.sections === undefined) return [];
  if (!Array.isArray(doc.sections)) return [`${page}: sections must be a list`];
  const known = PAGE_SECTIONS[page] || [];
  const problems = [];
  const ids = new Set();
  for (const s of doc.sections) {
    if (!s || typeof s.id !== 'string') { problems.push(`${page}: a section has no id`); continue; }
    if (!known.includes(s.id)) problems.push(`${page}: unknown section ${s.id}`);
    if (ids.has(s.id)) problems.push(`${page}: section ${s.id} is listed twice`);
    if (s.enabled !== undefined && typeof s.enabled !== 'boolean') problems.push(`${page}: section ${s.id} enabled must be true or false`);
    ids.add(s.id);
  }
  return problems;
}
