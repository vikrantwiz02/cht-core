/** @internal */
export const DEFAULT_DOCS_PAGE_LIMIT = 100;

/** @internal */
export const DEFAULT_IDS_PAGE_LIMIT = 10000;

/** @internal */
export const END_OF_ALPHABET_MARKER = '\ufff0';

/** @internal */
export const ISO_8601_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/;

/** @ignore */
export const VIEWS = {
  CONTACTS_BY_FREETEXT: 'medic-offline-freetext/contacts_by_freetext',
  CONTACTS_BY_TYPE_FREETEXT: 'medic-offline-freetext/contacts_by_type_freetext',
  REPORTS_BY_FREETEXT: 'medic-offline-freetext/reports_by_freetext',
  CONTACTS_BY_TYPE: 'medic-client/contacts_by_type',
  CONTACTS_BY_PHONE: 'medic-client/contacts_by_phone',
  CONTACTS_BY_REFERENCE: 'medic-client/contacts_by_reference',
  REGISTERED_PATIENTS: 'medic-client/registered_patients',
  DOC_BY_TYPE: 'medic-client/doc_by_type',
  DOCS_BY_ID_LINEAGE: 'medic-client/docs_by_id_lineage',
  DOCS_BY_SHORTCODE: 'medic/docs_by_shortcode',
  REPORTS_BY_DATE: 'medic-client/reports_by_date',
  REPORTS_BY_FORM: 'medic-client/reports_by_form',
  REPORTS_BY_SUBJECT: 'medic-client/reports_by_subject',
  TASKS_BY_CONTACT: 'medic-client/tasks_by_contact',
  DOC_SUMMARIES_BY_ID: 'medic/doc_summaries_by_id',
} as const;

/** @ignore */
export const NOUVEAU_INDEXES = {
  CONTACTS_BY_FREETEXT: 'medic/contacts_by_freetext',
  REPORTS_BY_FREETEXT: 'medic/reports_by_freetext',
} as const;

/** @ignore */
export const nouveauUrl = (indexPath: string): string => `_design/${indexPath.replace('/', '/_nouveau/')}`;
