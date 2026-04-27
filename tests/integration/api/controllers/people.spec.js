const chai = require('chai');
const utils = require('@utils');
const { CONTACT_TYPES } = require('@medic/constants');

const password = 'passwordSUP3RS3CR37!';

const users = [
  {
    username: 'online',
    password: password,
    place: {
      _id: 'fixture:online',
      type: CONTACT_TYPES.DISTRICT_HOSPITAL,
      name: 'Online place',
    },
    contact: {
      _id: 'fixture:user:online',
      name: 'OnlineUser',
    },
    roles: ['national_admin'],
  },
  {
    username: 'online-no-perms',
    password: password,
    place: {
      _id: 'fixture:online-no-perms',
      type: CONTACT_TYPES.DISTRICT_HOSPITAL,
      name: 'No perms place',
    },
    contact: {
      _id: 'fixture:user:online-no-perms',
      name: 'NoPermsUser',
    },
    roles: ['mm-online'],
  },
];

let onlineRequestOptions;

describe('People API (legacy)', () => {
  before(async () => {
    const settings = await utils.getSettings();
    const permissions = {
      ...settings.permissions,
      'can_create_people': ['national_admin'],
    };
    await utils.updateSettings({ permissions }, { ignoreReload: true });
    await utils.createUsers(users);
  });

  after(async () => {
    await utils.deleteUsers(users);
    await utils.revertSettings(true);
  });

  beforeEach(() => {
    onlineRequestOptions = {
      path: '/api/v1/people',
      method: 'POST',
      auth: { username: 'online', password },
    };
  });

  describe('POST /api/v1/people', () => {
    it('should create a new person', () => {
      onlineRequestOptions.body = {
        name: 'Alice',
        type: 'person',
        parent: { _id: 'fixture:online' },
      };
      return utils.request(onlineRequestOptions)
        .then(result => {
          chai.expect(result.id).to.not.be.undefined;
          return utils.getDoc(result.id);
        })
        .then(person => {
          chai.expect(person).to.deep.include({ name: 'Alice', type: 'person' });
        });
    });

    it('should fail with 400 if body contains _rev (edit attempt)', () => {
      const existingPerson = {
        _id: 'existing-person-for-edit-test',
        name: 'Bob',
        type: 'person',
        parent: { _id: 'fixture:online' },
        reported_date: Date.now(),
      };
      return utils.saveDoc(existingPerson)
        .then(saved => utils.getDoc(saved.id))
        .then(doc => {
          onlineRequestOptions.body = { ...doc };
          return utils.request(onlineRequestOptions);
        })
        .then(() => chai.expect.fail('Should have returned 400'))
        .catch(err => {
          chai.expect(err.body.code).to.equal(400);
          chai.expect(err.body.error).to.equal('Person document already exists.');
        });
    });

    it('should fail with 400 if body contains _rev and _deleted (delete attempt)', () => {
      const existingPerson = {
        _id: 'existing-person-for-delete-test',
        name: 'Carol',
        type: 'person',
        parent: { _id: 'fixture:online' },
        reported_date: Date.now(),
      };
      return utils.saveDoc(existingPerson)
        .then(saved => utils.getDoc(saved.id))
        .then(doc => {
          onlineRequestOptions.body = { ...doc, _deleted: true };
          return utils.request(onlineRequestOptions);
        })
        .then(() => chai.expect.fail('Should have returned 400'))
        .catch(err => {
          chai.expect(err.body.code).to.equal(400);
          chai.expect(err.body.error).to.equal('Person document already exists.');
        });
    });

    it('should fail with 403 for user without can_create_people permission', () => {
      onlineRequestOptions.auth = { username: 'online-no-perms', password };
      onlineRequestOptions.body = {
        name: 'Dave',
        type: 'person',
        parent: { _id: 'fixture:online-no-perms' },
      };
      return utils.request(onlineRequestOptions)
        .then(() => chai.expect.fail('Should have returned 403'))
        .catch(err => {
          chai.expect(err.body.code).to.equal(403);
        });
    });
  });
});
