// Field specifications that drive the generic document forms (site-wide documents and site settings).
// Paths are dot paths into the JSON document; inside an object-list they are relative to the item.
export type FieldSpec =
  | { type: 'text' | 'textarea' | 'number' | 'boolean' | 'image' | 'image-list' | 'string-list'; path: string; label: string; help?: string; rows?: number; mono?: boolean; required?: boolean }
  | { type: 'select'; path: string; label: string; help?: string; options: Array<{ value: string; label: string }> }
  | { type: 'object-list'; path: string; label: string; help?: string; itemLabel: string; titleField?: string; fields: FieldSpec[] }
  | { type: 'group'; path: string; label: string; help?: string; fields: FieldSpec[] }
  | { type: 'json'; path: string; label: string; help?: string };

const kickerTitle = (path: string, label: string, extra: FieldSpec[] = []): FieldSpec => ({
  type: 'group', path, label, fields: [{ type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'title', label: 'Title' }, ...extra],
});

export const pageFieldSpecs: Record<string, { title: string; description: string; fields: FieldSpec[] }> = {
  home: {
    title: 'Home page',
    description: 'Copy for the home page: hero, sections and calls to action. Section order and layout are fixed by the design.',
    fields: [
      { type: 'text', path: 'title', label: 'Browser title' },
      { type: 'group', path: 'hero', label: 'Hero', fields: [
        { type: 'text', path: 'cue', label: 'Scroll cue' },
        { type: 'object-list', path: 'bands', label: 'Scroll bands', itemLabel: 'Band', titleField: 'headline', help: 'Four bands shown while scrolling the animated hero. Timing and effects are set by the design.', fields: [
          { type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'headline', label: 'Headline' }, { type: 'textarea', path: 'text', label: 'Text', rows: 2 },
        ] },
        { type: 'group', path: 'static', label: 'Static hero (phones and reduced motion)', fields: [
          { type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'headline', label: 'Headline' }, { type: 'textarea', path: 'text', label: 'Text', rows: 2 },
        ] },
        { type: 'group', path: 'primaryCta', label: 'Primary button', fields: [{ type: 'text', path: 'label', label: 'Label' }, { type: 'text', path: 'href', label: 'Link', mono: true }] },
        { type: 'group', path: 'secondaryCta', label: 'Secondary button', fields: [{ type: 'text', path: 'label', label: 'Label' }, { type: 'text', path: 'href', label: 'Link', mono: true }] },
      ] },
      kickerTitle('families', 'Product families section', [{ type: 'textarea', path: 'lede', label: 'Lede', rows: 2 }]),
      kickerTitle('process', 'Process section', [
        { type: 'textarea', path: 'lede', label: 'Lede', rows: 2 },
        { type: 'object-list', path: 'steps', label: 'Steps', itemLabel: 'Step', titleField: 'title', fields: [{ type: 'text', path: 'title', label: 'Title' }, { type: 'textarea', path: 'text', label: 'Text', rows: 2 }] },
        { type: 'group', path: 'circuit', label: 'Close-the-circuit interaction', fields: [
          { type: 'text', path: 'title', label: 'Title' }, { type: 'text', path: 'hint', label: 'Hint' }, { type: 'text', path: 'done', label: 'Done message' }, { type: 'text', path: 'button', label: 'Button' },
          { type: 'string-list', path: 'items', label: 'Promises' },
        ] },
      ]),
      kickerTitle('featured', 'Featured products', [{ type: 'string-list', path: 'slugs', label: 'Product slugs, in order', help: 'Use the slug shown on each product page.' }]),
      kickerTitle('industries', 'Industries', [
        { type: 'object-list', path: 'items', label: 'Industries', itemLabel: 'Industry', titleField: 'name', fields: [
          { type: 'text', path: 'id', label: 'Id', mono: true }, { type: 'text', path: 'name', label: 'Name' }, { type: 'text', path: 'headline', label: 'Headline' }, { type: 'textarea', path: 'text', label: 'Text', rows: 2 },
          { type: 'string-list', path: 'areas', label: 'Application areas' }, { type: 'string-list', path: 'products', label: 'Related product slugs' },
        ] },
      ]),
      kickerTitle('global', 'Global presence'),
      kickerTitle('downloads', 'Brochure section', [{ type: 'textarea', path: 'text', label: 'Text', rows: 2 }, { type: 'text', path: 'docId', label: 'Download id', mono: true }]),
      { type: 'group', path: 'cta', label: 'Closing call to action', fields: [{ type: 'text', path: 'title', label: 'Title' }, { type: 'textarea', path: 'text', label: 'Text', rows: 2 }, { type: 'text', path: 'label', label: 'Button' }, { type: 'text', path: 'href', label: 'Link', mono: true }] },
    ],
  },
  about: {
    title: 'About page',
    description: 'The company story, quality policy, manufacturing expertise, global presence and certificates.',
    fields: [
      { type: 'text', path: 'title', label: 'Title' },
      { type: 'textarea', path: 'lede', label: 'Lede', rows: 2 },
      { type: 'string-list', path: 'story', label: 'Story paragraphs' },
      { type: 'group', path: 'quality', label: 'Quality policy', fields: [
        { type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'quote', label: 'Quote' }, { type: 'string-list', path: 'body', label: 'Paragraphs' },
        { type: 'string-list', path: 'commitments', label: 'Commitments' }, { type: 'textarea', path: 'process', label: 'Process paragraph', rows: 3 }, { type: 'image', path: 'diagram', label: 'Diagram' },
      ] },
      { type: 'object-list', path: 'usp', label: 'Three promises', itemLabel: 'Promise', titleField: 'title', fields: [{ type: 'text', path: 'title', label: 'Title' }, { type: 'textarea', path: 'text', label: 'Text', rows: 2 }] },
      { type: 'group', path: 'manufacturing', label: 'Manufacturing expertise', fields: [
        { type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'title', label: 'Title' }, { type: 'textarea', path: 'lede', label: 'Lede', rows: 2 },
        { type: 'string-list', path: 'capabilities', label: 'Capabilities' }, { type: 'string-list', path: 'metals', label: 'Metals' }, { type: 'string-list', path: 'plastics', label: 'Plastics' },
      ] },
      { type: 'group', path: 'global', label: 'Global presence', fields: [{ type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'title', label: 'Title' }, { type: 'string-list', path: 'body', label: 'Paragraphs' }, { type: 'image', path: 'map', label: 'World map' }] },
      { type: 'group', path: 'certificates', label: 'Certificates', fields: [
        { type: 'text', path: 'kicker', label: 'Kicker' }, { type: 'text', path: 'title', label: 'Title' },
        { type: 'image-list', path: 'company', label: 'Company certificates' }, { type: 'image-list', path: 'products', label: 'Product certification marks' },
      ] },
      { type: 'group', path: 'alsoAvailable', label: 'Also in our range', fields: [{ type: 'text', path: 'title', label: 'Title' }, { type: 'textarea', path: 'lede', label: 'Lede', rows: 2 }, { type: 'string-list', path: 'items', label: 'Items' }] },
    ],
  },
  contact: {
    title: 'Contact page',
    description: 'Contact page copy and the enquiry form labels. The form endpoint itself is in Site settings.',
    fields: [
      { type: 'text', path: 'title', label: 'Title' },
      { type: 'textarea', path: 'lede', label: 'Lede', rows: 2 },
      { type: 'group', path: 'office', label: 'Office', fields: [{ type: 'text', path: 'heading', label: 'Heading' }] },
      { type: 'group', path: 'form', label: 'Enquiry form', fields: [
        { type: 'text', path: 'heading', label: 'Heading' }, { type: 'text', path: 'intro', label: 'Intro' },
        { type: 'object-list', path: 'fields', label: 'Form fields', itemLabel: 'Field', titleField: 'label', help: 'The field name is what the form endpoint receives.', fields: [
          { type: 'text', path: 'name', label: 'Name', mono: true }, { type: 'text', path: 'label', label: 'Label' },
          { type: 'select', path: 'type', label: 'Type', options: [{ value: 'text', label: 'Text' }, { value: 'textarea', label: 'Multi-line' }, { value: 'email', label: 'Email' }, { value: 'tel', label: 'Phone' }, { value: 'country', label: 'Country list' }] },
          { type: 'boolean', path: 'required', label: 'Required' }, { type: 'number', path: 'rows', label: 'Rows (multi-line)' }, { type: 'text', path: 'autocomplete', label: 'Autocomplete hint', mono: true },
        ] },
        { type: 'text', path: 'submit', label: 'Submit button' }, { type: 'text', path: 'sending', label: 'Sending label' }, { type: 'textarea', path: 'privacy', label: 'Privacy note', rows: 2 },
      ] },
    ],
  },
  markets: {
    title: 'Export markets',
    description: 'Regions and countries shown on the home and about pages. The hero counts these countries.',
    fields: [
      { type: 'textarea', path: 'intro', label: 'Intro', rows: 2 },
      { type: 'object-list', path: 'regions', label: 'Regions', itemLabel: 'Region', titleField: 'name', fields: [{ type: 'text', path: 'name', label: 'Region' }, { type: 'string-list', path: 'countries', label: 'Countries' }] },
    ],
  },
  countries: {
    title: 'Country list',
    description: 'The country drop-down on the enquiry form.',
    fields: [{ type: 'string-list', path: 'list', label: 'Countries' }],
  },
  site: {
    title: 'Site settings',
    description: 'Company identity, contact details, navigation, quality marks, header statistics and the enquiry form endpoint.',
    fields: [
      { type: 'text', path: 'name', label: 'Company name' }, { type: 'text', path: 'shortName', label: 'Short name' }, { type: 'text', path: 'tagline', label: 'Tagline' },
      { type: 'textarea', path: 'description', label: 'Site description (search engines)', rows: 3 },
      { type: 'text', path: 'siteUrl', label: 'Public site URL', mono: true, help: 'Used for canonical links and the sitemap.' },
      { type: 'image', path: 'logo', label: 'Logo' },
      { type: 'group', path: 'contact', label: 'Contact details', fields: [
        { type: 'string-list', path: 'address', label: 'Address lines' }, { type: 'text', path: 'phone', label: 'Phone (displayed)' }, { type: 'text', path: 'phoneHref', label: 'Phone (dial format)', mono: true },
        { type: 'text', path: 'email', label: 'Email' }, { type: 'number', path: 'mapLat', label: 'Map latitude' }, { type: 'number', path: 'mapLng', label: 'Map longitude' },
      ] },
      { type: 'object-list', path: 'nav', label: 'Navigation', itemLabel: 'Link', titleField: 'label', fields: [{ type: 'text', path: 'label', label: 'Label' }, { type: 'text', path: 'href', label: 'Link', mono: true }, { type: 'boolean', path: 'mega', label: 'Opens the products menu' }] },
      { type: 'group', path: 'cta', label: 'Header button', fields: [{ type: 'text', path: 'label', label: 'Label' }, { type: 'text', path: 'href', label: 'Link', mono: true }] },
      { type: 'string-list', path: 'qualityMarks', label: 'Quality marks' },
      { type: 'object-list', path: 'stats', label: 'Header statistics', itemLabel: 'Statistic', titleField: 'label', help: '{{markets}} and {{products}} are replaced by the counted values.', fields: [{ type: 'text', path: 'value', label: 'Value' }, { type: 'text', path: 'label', label: 'Label' }] },
      { type: 'textarea', path: 'aiNotice', label: 'AI-enhanced photo notice (footer)', rows: 3 },
      { type: 'group', path: 'form', label: 'Enquiry form', help: 'The endpoint is a Formspree-style URL that accepts a POST. Leave it empty to show the "not configured" notice.', fields: [
        { type: 'text', path: 'endpoint', label: 'Form endpoint URL', mono: true }, { type: 'text', path: 'subject', label: 'Email subject' },
        { type: 'textarea', path: 'notConfigured', label: 'Not configured notice', rows: 2 }, { type: 'textarea', path: 'success', label: 'Success message', rows: 2 }, { type: 'textarea', path: 'error', label: 'Error message', rows: 2 },
      ] },
    ],
  },
};
