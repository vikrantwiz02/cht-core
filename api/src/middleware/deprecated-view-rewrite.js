const logger = require('@medic/logger');
const { VIEWS, VIEWS_BY_DDOC, getDdoc } = require('@medic/constants');

// All known medic-db ddocs that external projects might reference in view URLs.
// Derived from VIEWS_BY_DDOC so there is no duplicate mapping to maintain.
const KNOWN_DDOCS = Object.keys(VIEWS_BY_DDOC.medic);

// Matches: /{db}/_design/{ddoc}/_view/{view}
// Captures: ddoc name and view name
const VIEW_URL_PATTERN = new RegExp(
  String.raw`^(\/[^/]+\/_design\/)(${KNOWN_DDOCS.join('|')})(\/_view\/)([a-z_]+)(.*)`
);

const rewriteDeprecatedViewUrl = (req, res, next) => {
  const match = req.url.match(VIEW_URL_PATTERN);
  if (!match) {
    return next();
  }

  const [, prefix, oldDdoc, viewSegment, viewName, rest] = match;
  const viewKey = viewName.toUpperCase();
  const currentDdoc = VIEWS[viewKey] && getDdoc(VIEWS[viewKey]);

  if (!currentDdoc || currentDdoc === oldDdoc) {
    return next();
  }

  const oldUrl = req.url;
  req.url = `${prefix}${currentDdoc}${viewSegment}${viewName}${rest}`;
  logger.warn(`Rewriting deprecated view URL: ${oldUrl} -> ${req.url}`);
  next();
};

module.exports = {
  rewriteDeprecatedViewUrl,
};
