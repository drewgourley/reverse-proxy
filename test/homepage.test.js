"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findHomepage } = require('../lib-public/helpers');

const withFolder = (setup, check) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'homepage-'));
  try {
    setup(folder);
    check(folder);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
};

test('findHomepage: a homepage/index.html replaces the root page', () => {
  withFolder(
    (folder) => {
      fs.mkdirSync(path.join(folder, 'homepage'));
      fs.writeFileSync(path.join(folder, 'homepage', 'index.html'), '<h1>me</h1>');
      fs.writeFileSync(path.join(folder, 'index.html'), '<h1>canned</h1>');
    },
    (folder) => assert.equal(findHomepage(folder), path.join(folder, 'homepage', 'index.html'))
  );
});

test('findHomepage: nothing to find falls back to the root index.html', () => {
  withFolder(
    (folder) => fs.writeFileSync(path.join(folder, 'index.html'), '<h1>canned</h1>'),
    (folder) => assert.equal(findHomepage(folder), null)
  );
});

test('findHomepage: an empty homepage folder does not count', () => {
  withFolder(
    (folder) => fs.mkdirSync(path.join(folder, 'homepage')),
    (folder) => assert.equal(findHomepage(folder), null)
  );
});
