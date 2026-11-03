// Zod schemas for every content body the CMS stores. They mirror the JSON files under content/ exactly,
// so an export of a valid body is a valid content file. Unknown keys are kept (loose objects) so nothing
// the templates might read is lost.
import { z } from 'zod';

export const subImageSchema = z.looseObject({
  src: z.string().min(1),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  alt: z.string().optional(),
});

export const imageSchema = z.looseObject({
  src: z.string().min(1, 'Choose an image'),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  alt: z.string().default(''),
  caption: z.string().optional(),
  aiEnhanced: z.boolean().optional(),
  original: subImageSchema.optional(),
  thumb: subImageSchema.optional(),
});
export type Image = z.infer<typeof imageSchema>;

export const factSchema = z.object({ label: z.string().min(1), value: z.string() });
export type Fact = z.infer<typeof factSchema>;

export const tableSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string(),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
  caption: z.string().optional(),
  note: z.string().optional(),
});
export type SpecTable = z.infer<typeof tableSchema>;

export const variantSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().optional(),
  images: z.array(imageSchema).optional(),
  specImage: imageSchema.optional(),
  specImage2: imageSchema.optional(),
  specLabel: z.string().optional(),
  facts: z.array(factSchema).optional(),
  table: z.looseObject({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }).optional(),
  bullets: z.array(z.string()).optional(),
});
export type Variant = z.infer<typeof variantSchema>;

export const seoSchema = z.looseObject({ title: z.string(), description: z.string() });

export const productBodySchema = z.looseObject({
  name: z.string().min(1, 'Name is required'),
  legacyUrl: z.string().nullable().default(null),
  source: z.enum(['existing', 'new']).default('new'),
  summary: z.string().min(1, 'Summary is required'),
  facts: z.array(factSchema).default([]),
  intro: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  applications: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  hero: imageSchema,
  gallery: z.array(imageSchema).optional(),
  variants: z.array(variantSchema).optional(),
  variantsLabel: z.string().optional(),
  busbarSupports: z.array(imageSchema).optional(),
  tables: z.array(tableSchema).optional(),
  seo: seoSchema,
  downloads: z.array(z.string()).min(1, 'Link at least one datasheet'),
});
export type ProductBody = z.infer<typeof productBodySchema>;

export const familyBodySchema = z.looseObject({
  name: z.string().min(1, 'Name is required'),
  shortName: z.string().min(1, 'Short name is required'),
  icon: z.string().min(1),
  summary: z.string().min(1, 'Summary is required'),
  image: imageSchema,
});
export type FamilyBody = z.infer<typeof familyBodySchema>;

export const downloadBodySchema = z.looseObject({
  title: z.string().min(1, 'Title is required'),
  kind: z.enum(['catalogue', 'legacy']),
  file: z.string().min(1, 'Choose a PDF'),
  description: z.string().default(''),
  pages: z.number().int().nonnegative().default(0),
  sizeBytes: z.number().int().nonnegative().default(0),
  thumb: z.string().min(1, 'Choose a thumbnail image'),
});
export type DownloadBody = z.infer<typeof downloadBodySchema>;

// Site-wide documents. The forms edit the fields below; anything else in the document is preserved.
export const siteBodySchema = z.looseObject({
  name: z.string().min(1),
  shortName: z.string().min(1),
  tagline: z.string(),
  description: z.string(),
  siteUrl: z.string().url(),
  logo: imageSchema,
  contact: z.looseObject({
    address: z.array(z.string()),
    phone: z.string(),
    phoneHref: z.string(),
    email: z.string(),
    mapLat: z.number(),
    mapLng: z.number(),
  }),
  nav: z.array(z.looseObject({ label: z.string(), href: z.string(), mega: z.boolean().optional() })),
  cta: z.looseObject({ label: z.string(), href: z.string() }),
  aiNotice: z.string(),
  qualityMarks: z.array(z.string()),
  stats: z.array(z.looseObject({ value: z.string(), label: z.string() })),
  form: z.looseObject({
    endpoint: z.string(),
    subject: z.string(),
    notConfigured: z.string(),
    success: z.string(),
    error: z.string(),
  }),
});

export const marketsBodySchema = z.looseObject({
  intro: z.string(),
  regions: z.array(z.looseObject({ name: z.string().min(1), countries: z.array(z.string().min(1)) })),
});

export const countriesBodySchema = z.object({ list: z.array(z.string().min(1)) });

export const companyImagesBodySchema = z.record(z.string(), subImageSchema);

const anyDocument = z.looseObject({});

export const pageKeys = ['site', 'home', 'about', 'contact', 'markets', 'countries', 'company-images'] as const;
export type PageKey = (typeof pageKeys)[number];

export const pageSchemas: Record<PageKey, z.ZodType> = {
  site: siteBodySchema,
  home: anyDocument,
  about: anyDocument,
  contact: anyDocument,
  markets: marketsBodySchema,
  countries: countriesBodySchema,
  'company-images': companyImagesBodySchema,
};

export const redirectSchema = z.object({
  kind: z.enum(['page', 'download']),
  from_path: z.string().regex(/^\/[^\s]*$/, 'Must start with /'),
  to_path: z.string().regex(/^\/[^\s]*$/, 'Must start with /'),
});

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and single hyphens only');
