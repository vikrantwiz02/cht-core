/**
 * Assembles view files from flat per-database directories into the correct ddoc
 * directory structure expected by couchdb-compile.
 *
 * Source: build/ddocs/<db-dir>/views/<view-name>/
 * Dest:   build/ddocs/<db-dir>/<ddoc>/views/<view-name>/
 *
 * The mapping of views to ddocs comes from VIEWS_BY_DDOC in @medic/constants.
 * This script also generates _id files for each ddoc.
 */

const path = require('path');
const { cp, rm, readdir, mkdir, writeFile } = require('node:fs/promises');
const { existsSync } = require('fs');

const { VIEWS_BY_DDOC } = require('../../shared-libs/constants/src/index');

// Maps VIEWS_BY_DDOC database keys to ddocs/ directory names
const DB_DIR_MAP = {
  'medic': 'medic-db',
  'sentinel': 'sentinel-db',
  'users-meta': 'users-meta-db',
  '_users': 'users-db',
  'logs': 'logs-db',
};

// Ddocs with no view files on disk (built client-side in PouchDB)
const SKIP_DDOCS = new Set(['medic-offline-freetext']);

const buildDir = path.resolve(__dirname, '../../build/ddocs');

const assembleViews = async () => {
  for (const [dbName, ddocs] of Object.entries(VIEWS_BY_DDOC)) {
    const dbDirName = DB_DIR_MAP[dbName];
    if (!dbDirName) {
      continue; // skip databases without build directories (e.g. medic-user)
    }

    const viewsSourceDir = path.join(buildDir, dbDirName, 'views');
    if (!existsSync(viewsSourceDir)) {
      throw new Error(`Views directory not found: ${viewsSourceDir}`);
    }

    // Collect all views expected by constants for this database (excluding skipped ddocs)
    const expectedViews = new Set();

    for (const [ddocName, views] of Object.entries(ddocs)) {
      if (SKIP_DDOCS.has(ddocName)) {
        continue;
      }

      const ddocDir = path.join(buildDir, dbDirName, ddocName);

      // Create ddoc directory if it doesn't exist
      await mkdir(ddocDir, { recursive: true });

      // Generate _id file
      await writeFile(path.join(ddocDir, '_id'), `_design/${ddocName}`);

      // Create views directory in the ddoc
      const ddocViewsDir = path.join(ddocDir, 'views');
      await mkdir(ddocViewsDir, { recursive: true });

      for (const viewName of views) {
        expectedViews.add(viewName);

        const src = path.join(viewsSourceDir, viewName);
        if (!existsSync(src)) {
          throw new Error(
            `View "${viewName}" listed in VIEWS_BY_DDOC[${dbName}][${ddocName}] ` +
            `but not found at ${src}`
          );
        }

        const dest = path.join(ddocViewsDir, viewName);
        await cp(src, dest, { recursive: true });
      }
    }

    // Validate: every view on disk must be in VIEWS_BY_DDOC
    const viewsOnDisk = await readdir(viewsSourceDir);
    for (const viewName of viewsOnDisk) {
      if (!expectedViews.has(viewName)) {
        throw new Error(
          `View directory "${viewName}" found in ${viewsSourceDir} ` +
          `but not listed in VIEWS_BY_DDOC for database "${dbName}"`
        );
      }
    }

    // Remove the flat views directory so couchdb-compile doesn't treat it as a ddoc
    await rm(viewsSourceDir, { recursive: true });
  }

  console.log('Views assembled successfully');
};

assembleViews().catch(err => {
  console.error('Failed to assemble views:', err.message);
  process.exit(1);
});
