// Shared constants for CHT-Core
// This library provides a single source of truth for magic strings and constants used throughout the application

// Document IDs
const DOC_IDS = {
  SERVICE_WORKER_META: 'service-worker-meta',
  SETTINGS: 'settings',
  RESOURCES: 'resources',
  PRIVACY_POLICIES: 'privacy-policies',
  PARTNERS: 'partners',
};

// Contact Types
const CONTACT_TYPES = {
  HEALTH_CENTER: 'health_center',
};

// Document Types
const DOC_TYPES = {
  TOKEN_LOGIN: 'token_login',
  TRANSLATIONS: 'translations',
};

// HTTP Headers
const HTTP_HEADERS = {
  REQUEST_ID: 'X-Request-Id',
};

// Sentinel Metadata
const SENTINEL_METADATA = {
  TRANSITIONS_SEQ: '_local/transitions-seq',
  BACKGROUND_SEQ: '_local/background-seq',
};

// Design document IDs (medic database)
const DDOC_IDS = {
  MEDIC: '_design/medic',
  MEDIC_ADMIN: '_design/medic-admin',
  MEDIC_CLIENT: '_design/medic-client',
  MEDIC_CONFLICTS: '_design/medic-conflicts',
  MEDIC_SMS: '_design/medic-sms',
};

// Design documents replicated to offline clients
const REPLICATED_DDOCS = [
  DDOC_IDS.MEDIC_CLIENT,
];

// Mapping of database -> ddoc -> views. This is the authoritative source of which
// views live in which design document in which database.
const VIEWS_BY_DDOC = {
  'medic': {
    'medic-offline-freetext': [
      'contacts_by_freetext',
      'contacts_by_type_freetext',
      'reports_by_freetext',
    ],
    'medic': [
      'contacts_by_depth',
      'contacts_by_primary_contact',
      'doc_summaries_by_id',
      'docs_by_shortcode',
      'messages_by_state',
      'reports_by_form_and_parent',
      'reports_by_form_year_month_parent_reported_date',
      'reports_by_form_year_week_parent_reported_date',
      'tasks_in_terminal_state',
    ],
    'medic-admin': [
      'contacts_by_dhis_orgunit',
      'message_queue',
    ],
    'medic-client': [
      'contacts_by_last_visited',
      'contacts_by_parent',
      'contacts_by_phone',
      'contacts_by_place',
      'contacts_by_reference',
      'contacts_by_type',
      'data_records_by_type',
      'doc_by_type',
      'docs_by_id_lineage',
      'messages_by_contact_date',
      'registered_patients',
      'reports_by_date',
      'reports_by_form',
      'reports_by_place',
      'reports_by_subject',
      'reports_by_validity',
      'reports_by_verification',
      'tasks_by_contact',
      'visits_by_date',
    ],
    'medic-conflicts': [
      'conflicts',
    ],
    'medic-sms': [
      'gateway_messages_by_state',
      'messages_by_gateway_ref',
      'messages_by_last_updated_state',
      'messages_by_uuid',
    ],
    'medic-scripts': [],
  },
  'sentinel': {
    'sentinel': [
      'outbound_push_tasks',
    ],
  },
  'users-meta': {
    'users-meta': [
      'device_by_user',
      'feedback_by_date',
    ],
  },
  '_users': {
    'users': [
      'users_by_field',
    ],
  },
  'medic-user': {
    'medic-user': [
      'read',
    ],
  },
  'logs': {
    'logs': [
      'connected_users',
      'replication_limit',
    ],
  },
};

// Build VIEWS from the ddoc mapping. Each constant is a 'ddoc/view' path string.
const VIEWS = {};
const _viewToDdoc = {};
for (const [db, ddocs] of Object.entries(VIEWS_BY_DDOC)) {
  for (const [ddoc, views] of Object.entries(ddocs)) {
    for (const view of views) {
      const key = view.toUpperCase();
      const path = `${ddoc}/${view}`;
      VIEWS[key] = path;
      _viewToDdoc[path] = { db, ddoc, view };
    }
  }
}

Object.freeze(VIEWS);

// Returns the ddoc name for a given view path, e.g. getDdoc(VIEWS.CONTACTS_BY_DEPTH) => 'medic'
const getDdoc = (viewPath) => {
  const entry = _viewToDdoc[viewPath];
  return entry && entry.ddoc;
};

// Returns the view name for a given view path, e.g. getViewName(VIEWS.CONTACTS_BY_DEPTH) => 'contacts_by_depth'
const getViewName = (viewPath) => {
  const entry = _viewToDdoc[viewPath];
  return entry && entry.view;
};

// User Roles
const USER_ROLES = {
  ONLINE: 'mm-online',
};

// CouchDB Nouveau index paths (ddoc/index)
const NOUVEAU_INDEXES = {
  // medic ddoc
  CONTACTS_BY_FREETEXT: 'medic/contacts_by_freetext',
  REPORTS_BY_FREETEXT: 'medic/reports_by_freetext',
  DOCS_BY_REPLICATION_KEY: 'medic/docs_by_replication_key',
};

// Register nouveau indexes in the lookup
Object.values(NOUVEAU_INDEXES).forEach(path => {
  const [ddoc, view] = path.split('/');
  _viewToDdoc[path] = { ddoc, view };
});

// Converts a view path to the CouchDB URL segment
// e.g. 'medic-client/doc_by_type' => '_design/medic-client/_view/doc_by_type'
const viewUrl = (viewPath) => {
  const entry = _viewToDdoc[viewPath] || {};
  const ddoc = entry.ddoc || viewPath.split('/')[0];
  const view = entry.view || viewPath.split('/')[1];
  return `_design/${ddoc}/_view/${view}`;
};

// Converts a nouveau index path like 'medic/docs_by_replication_key'
// to '_design/medic/_nouveau/docs_by_replication_key'
const nouveauUrl = (indexPath) => {
  const entry = _viewToDdoc[indexPath] || {};
  const ddoc = entry.ddoc || indexPath.split('/')[0];
  const view = entry.view || indexPath.split('/')[1];
  return `_design/${ddoc}/_nouveau/${view}`;
};

// Converts a nouveau index path to its info URL segment
const nouveauInfoUrl = (indexPath) => {
  const entry = _viewToDdoc[indexPath] || {};
  const ddoc = entry.ddoc || indexPath.split('/')[0];
  const view = entry.view || indexPath.split('/')[1];
  return `_design/${ddoc}/_nouveau_info/${view}`;
};

module.exports = {
  DDOC_IDS,
  DOC_IDS,
  DOC_TYPES,
  HTTP_HEADERS,
  NOUVEAU_INDEXES,
  REPLICATED_DDOCS,
  SENTINEL_METADATA,
  USER_ROLES,
  CONTACT_TYPES,
  VIEWS,
  VIEWS_BY_DDOC,
  getDdoc,
  getViewName,
  nouveauInfoUrl,
  nouveauUrl,
  viewUrl,
};
