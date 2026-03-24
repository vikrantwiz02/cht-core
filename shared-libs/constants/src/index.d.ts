export declare const DOC_IDS: {
  readonly SERVICE_WORKER_META: string;
  readonly SETTINGS: string;
  readonly RESOURCES: string;
  readonly PARTNERS: string;
};

export declare const CONTACT_TYPES: {
  readonly HEALTH_CENTER: string;
};

export declare const DOC_TYPES: {
  readonly TOKEN_LOGIN: string;
  readonly TRANSLATIONS: string;
};

export declare const HTTP_HEADERS: {
  readonly REQUEST_ID: string;
};

export declare const SENTINEL_METADATA: {
  readonly TRANSITIONS_SEQ: string;
  readonly BACKGROUND_SEQ: string;
};

export declare const DDOC_IDS: {
  readonly MEDIC: string;
  readonly MEDIC_ADMIN: string;
  readonly MEDIC_CLIENT: string;
  readonly MEDIC_CONFLICTS: string;
  readonly MEDIC_SMS: string;
};

export declare const REPLICATED_DDOCS: readonly string[];

export declare const VIEWS: Record<string, string>;

export declare const VIEWS_BY_DDOC: Record<string, Record<string, string[]>>;

export declare const NOUVEAU_INDEXES: Record<string, string>;

export declare const USER_ROLES: {
  readonly ONLINE: string;
};

export declare function getDdoc(viewPath: string): string | undefined;
export declare function getViewName(viewPath: string): string | undefined;
export declare function viewUrl(viewPath: string): string;
export declare function nouveauUrl(indexPath: string): string;
export declare function nouveauInfoUrl(indexPath: string): string;
