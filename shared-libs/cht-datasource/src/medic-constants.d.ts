// Type declarations for @medic/constants, which is a plain JS module with
// dynamically-built exports that TypeScript cannot infer (e.g. VIEWS is
// populated via a loop). Only the exports used by cht-datasource are declared.
declare module '@medic/constants' {
  /** @ignore */
  export const VIEWS: Record<string, string>;
  /** @ignore */
  export const NOUVEAU_INDEXES: Record<string, string>;
  /** @ignore */
  export function nouveauUrl(indexPath: string): string;
}
