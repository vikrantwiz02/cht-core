/**
 * @module memdown-medic
 * @description Initialise an in-memory PouchDB instance using ddocs
 * defined at the supplied path.
 *
 * USAGE
 * 	memdownMedic = require('@medic/memdown');
 * 	memdownMedic('.')
 * 	  .then(db => {
 * 	    db.allDocs()
 * 	      .then(console.log)
 * 	      .catch(console.log);
 * 	  })
 */
const fs = require('fs');
const path = require('path');
const uuid = require('uuid').v4;

const { VIEWS_BY_DDOC } = require('@medic/constants');

const PouchDB = require('pouchdb-core');
PouchDB.plugin(require('pouchdb-adapter-memory'));
PouchDB.plugin(require('pouchdb-mapreduce'));

let ddocs;

const readFile = (filePath) => {
  return fs.readFileSync(filePath, { encoding: 'utf-8' });
};

const readOptionalFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    return readFile(filePath);
  }
};

const loadView = (viewsDir, viewName) => {
  const viewDir = path.join(viewsDir, viewName);
  return {
    map: readFile(`${viewDir}/map.js`),
    reduce: readOptionalFile(`${viewDir}/reduce.js`),
  };
};

module.exports = (rootDir='./') => {
  if (!ddocs) {
    ddocs = [];
    const viewsDir = path.join(rootDir, 'ddocs', 'medic-db', 'views');
    const medicDdocs = VIEWS_BY_DDOC.medic;

    for (const [ddocName, viewNames] of Object.entries(medicDdocs)) {
      const views = {};
      for (const viewName of viewNames) {
        const viewDir = path.join(viewsDir, viewName);
        if (fs.existsSync(viewDir)) {
          views[viewName] = loadView(viewsDir, viewName);
        }
      }
      ddocs.push({ _id: `_design/${ddocName}`, views });
    }
  }
  const db = new PouchDB(uuid(), { adapter: 'memory' });
  return Promise.all(ddocs.map(ddoc => db.put(ddoc)))
    .then(() => db);
};
