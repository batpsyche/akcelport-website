// Types for sections.mjs, so the CMS (TypeScript) can share the section order rules with the site build.
export interface SectionState { id: string; enabled: boolean }
export declare const PAGE_SECTIONS: Record<'home' | 'about' | 'contact', string[]>;
export declare function resolveSections(page: string, doc: unknown): SectionState[];
export declare function visibleSections(page: string, doc: unknown): string[];
export declare function sectionProblems(page: string, doc: unknown): string[];
