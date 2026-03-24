// Type declarations for dynamically-built constants that TypeScript cannot infer from the JS source.
// Static literal objects (DOC_IDS, DDOC_IDS, etc.) are inferred directly
// from index.js and do not need declarations here.

export declare const VIEWS: Record<string, string>;
export declare const VIEWS_BY_DDOC: Record<string, Record<string, string[]>>;
export declare const NOUVEAU_INDEXES: Record<string, string>;

export declare function getDdoc(viewPath: string): string | undefined;
export declare function getViewName(viewPath: string): string | undefined;
export declare function viewUrl(viewPath: string): string;
export declare function nouveauUrl(indexPath: string): string;
export declare function nouveauInfoUrl(indexPath: string): string;
