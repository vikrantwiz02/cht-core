const util = require('util');
const path = require('path');
const fs = require('fs');
const { writeFile, readdir, readFile: readFileAsync } = require('node:fs/promises');
const couchCompile = util.promisify(require('couchdb-compile'));

const { VIEWS_BY_DDOC } = require('../../shared-libs/constants/src/index');

const DB_DIR_MAP = {
  'medic': 'medic-db',
  'sentinel': 'sentinel-db',
  'users-meta': 'users-meta-db',
  '_users': 'users-db',
  'logs': 'logs-db',
};

const SKIP_DDOCS = new Set(['medic-offline-freetext']);

const readFile = (filePath) => fs.readFileSync(filePath, 'utf-8').replace(/\n$/, '');

const readOptionalFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    return readFile(filePath);
  }
};

const loadView = (viewsDir, viewName) => {
  const viewDir = path.join(viewsDir, viewName);
  const view = { map: readFile(path.join(viewDir, 'map.js')) };

  // couchdb-compile reads 'reduce' (no extension) as a plain string and 'reduce.js' as JS
  const reduce = readOptionalFile(path.join(viewDir, 'reduce'));
  const reduceJs = readOptionalFile(path.join(viewDir, 'reduce.js'));
  if (reduce) {
    view.reduce = reduce.trim();
  } else if (reduceJs) {
    view.reduce = reduceJs;
  }

  return view;
};

const compileDdocsForDb = async (dbName, ddocs, buildDir) => {
  const dbDirName = DB_DIR_MAP[dbName];
  if (!dbDirName) {
    return [];
  }

  const dbPath = path.join(buildDir, dbDirName);
  const viewsDir = path.join(dbPath, 'views');

  // Validate views on disk match constants
  if (fs.existsSync(viewsDir)) {
    const viewsOnDisk = new Set((await readdir(viewsDir)).filter(f => !f.startsWith('.')));
    const expectedViews = new Set();
    for (const [ddocName, views] of Object.entries(ddocs)) {
      if (SKIP_DDOCS.has(ddocName)) {
        continue;
      }
      views.forEach(v => expectedViews.add(v));
    }

    for (const v of expectedViews) {
      if (!viewsOnDisk.has(v)) {
        throw new Error(`View "${v}" in VIEWS_BY_DDOC[${dbName}] not found in ${viewsDir}`);
      }
    }
    for (const v of viewsOnDisk) {
      if (!expectedViews.has(v)) {
        throw new Error(`View "${v}" on disk in ${viewsDir} not in VIEWS_BY_DDOC[${dbName}]`);
      }
    }
  }

  const compiledDocs = [];

  for (const [ddocName, viewNames] of Object.entries(ddocs)) {
    if (SKIP_DDOCS.has(ddocName)) {
      continue;
    }

    const ddocDir = path.join(dbPath, ddocName);
    let doc;

    // If a ddoc directory exists on disk, compile it (picks up validate_doc_update, nouveau, etc.)
    if (fs.existsSync(ddocDir)) {
      doc = await couchCompile(ddocDir);
    } else {
      doc = {};
    }

    doc._id = `_design/${ddocName}`;

    // Add views from the flat views directory
    if (fs.existsSync(viewsDir) && viewNames.length > 0) {
      doc.views = doc.views || {};
      for (const viewName of viewNames) {
        doc.views[viewName] = loadView(viewsDir, viewName);
      }
    }

    compiledDocs.push(doc);
  }

  return compiledDocs;
};

const compilePrimary = async () => {
  const buildDir = path.resolve(__dirname, '../../build/ddocs');

  const allDocs = {};
  for (const [dbName, ddocs] of Object.entries(VIEWS_BY_DDOC)) {
    const dbDirName = DB_DIR_MAP[dbName];
    if (!dbDirName) {
      continue;
    }
    allDocs[dbDirName] = await compileDdocsForDb(dbName, ddocs, buildDir);
  }

  // Write medic.json (all medic-db ddocs)
  await writeFile(
    path.join(buildDir, 'medic.json'),
    JSON.stringify({ docs: allDocs['medic-db'] }, null, 2)
  );
  console.log('ddoc compiled successfully: build/ddocs/medic.json');

  // Write other database JSON files
  for (const [dbDirName, docs] of Object.entries(allDocs)) {
    if (dbDirName === 'medic-db') {
      continue;
    }
    const outName = dbDirName.replace(/-db$/, '') + '.json';
    await writeFile(
      path.join(buildDir, outName),
      JSON.stringify({ docs }, null, 2)
    );
    console.log(`ddoc compiled successfully: build/ddocs/${outName}`);
  }
};

const compileStaging = async () => {
  const docs = [await couchCompile('build/staging')];
  await writeFile('build/staging.json', JSON.stringify({ docs }, null, 2));
  console.log('ddoc compiled successfully: build/staging.json');
};

const commands = {
  'primary': compilePrimary,
  'staging': compileStaging,
};

const getCommand = () => {
  const cmdKey = process.argv.length > 2 && process.argv[2];
  const cmd = cmdKey && commands[cmdKey];
  if (!cmd) {
    throw new Error(`Unknown command: "${cmdKey}"`);
  }
  return cmd;
};

(async () => {
  await getCommand()();
})();
