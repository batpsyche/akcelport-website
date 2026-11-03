export interface User { id: number; email: string; name: string; role: 'admin' | 'editor'; mustChangePassword: boolean }
export interface Me { user: User; csrfToken: string; canPublish: boolean }

export type ItemType = 'family' | 'product' | 'download';
export interface ItemSummary {
  id: number; slug: string; name: string; familyId?: number; sortOrder: number; status: 'hidden' | 'live'; publishedStatus: 'hidden' | 'live';
  hasDraft: boolean; neverPublished: boolean; pendingDeletion: boolean; pending: boolean; updatedAt: string;
}
export interface Version { id: number; versionNo: number; note: string | null; createdAt: string; createdBy: string | null }
export interface ItemFull<B = Record<string, unknown>> { item: ItemSummary; body: B; live: B | null; versions: Version[] }
export interface PageFull<B = Record<string, unknown>> { key: string; body: B; live: B | null; hasDraft: boolean; updatedAt: string; versions: Version[] }

export interface MediaRow { id: number; path: string; kind: 'image' | 'pdf'; mime: string; bytes: number; width: number | null; height: number | null; pages: number | null; originalFilename: string | null; createdAt: string; updatedAt: string }

export interface Image { src: string; w: number; h: number; alt?: string; caption?: string; aiEnhanced?: boolean; original?: { src: string; w: number; h: number }; thumb?: { src: string; w: number; h: number } }
export interface Fact { label: string; value: string }
export interface SpecTable { id: string; title: string; columns: string[]; rows: string[][]; caption?: string; note?: string }
export interface Variant { id: string; name: string; summary?: string; images?: Image[]; specImage?: Image; specImage2?: Image; specLabel?: string; facts?: Fact[]; table?: { columns: string[]; rows: string[][] }; bullets?: string[] }
export interface ProductBody {
  name: string; legacyUrl: string | null; source: 'existing' | 'new'; summary: string; facts: Fact[]; intro: string[]; features: string[]; applications?: string[]; notes?: string[];
  hero: Image; gallery?: Image[]; variants?: Variant[]; variantsLabel?: string; busbarSupports?: Image[]; tables?: SpecTable[]; seo: { title: string; description: string }; downloads: string[];
  [k: string]: unknown;
}
export interface FamilyBody { name: string; shortName: string; icon: string; summary: string; image: Image; [k: string]: unknown }
export interface DownloadBody { title: string; kind: 'catalogue' | 'legacy'; file: string; description: string; pages: number; sizeBytes: number; thumb: string; [k: string]: unknown }

export interface PendingItem extends ItemSummary { type: ItemType; change: string }
export interface Pending { items: PendingItem[]; pages: Array<{ key: string; updatedAt: string; change: string }> }

export interface PublishRecord { id: number; kind: 'publish' | 'preview' | 'rollback'; status: 'running' | 'success' | 'failed'; startedBy: string | null; releaseId: string | null; items: Array<{ type: string; slug: string; change: string }> | null; log: string | null; error: string | null; startedAt: string; finishedAt: string | null }
export interface PublishState { current: string | null; releases: Array<{ id: string; createdAt: string; current: boolean }>; publishes: PublishRecord[]; busy: boolean; previewBuiltAt: string | null; pending: Pending; canPublish: boolean; sitePort: number }

export interface Redirect { id: number; kind: 'page' | 'download'; fromPath: string; toPath: string; sortOrder: number; updatedAt: string }
export interface AuditEntry { id: number; userEmail: string | null; action: string; entityType: string | null; entityId: string | null; label: string | null; changes: Record<string, { from: unknown; to: unknown }> | null; ip: string | null; createdAt: string }
export interface UserRow { id: number; email: string; name: string; role: 'admin' | 'editor'; is_active: boolean; must_change_password: boolean; created_at: string; last_login_at: string | null }
