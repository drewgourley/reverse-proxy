"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const { lineageFor, buildTlsOptions } = require('../lib-public/tls-contexts');
const { wildcardServices } = require('../lib-public/hosts');

const config = {
  domain: 'example.com',
  services: {
    maker: { subdomain: { type: 'proxy', protocol: 'secure', wildcard: true, altDomain: 'noveltyfactor.tech', altDomainPrefix: 'maker' } },
  },
};

const lineages = {
  'example.com': { key: 'k-main', cert: 'c-main', ca: 'ca-main' },
  'maker.noveltyfactor.tech': { key: 'k-maker', cert: 'c-maker', ca: 'ca-maker' },
};

const deps = (available = Object.keys(lineages)) => ({
  read: (name) => available.includes(name) ? lineages[name] : undefined,
  createContext: (material) => ({ context: material.cert }),
});

const ask = (options, servername) => new Promise((resolve, reject) => {
  options.SNICallback(servername, (error, context) => error ? reject(error) : resolve(context));
});

test('lineageFor: the host and its subdomains use the wildcard certificate, anything else the default', () => {
  const wildcards = wildcardServices(config);
  assert.equal(lineageFor('maker.noveltyfactor.tech', wildcards), 'maker.noveltyfactor.tech');
  assert.equal(lineageFor('Shop.maker.noveltyfactor.tech', wildcards), 'maker.noveltyfactor.tech');
  assert.equal(lineageFor('noveltyfactor.tech', wildcards), null);
  assert.equal(lineageFor('notmaker.noveltyfactor.tech', wildcards), null);
  assert.equal(lineageFor(undefined, wildcards), null);
});

test('buildTlsOptions: picks the certificate by server name', async () => {
  const options = buildTlsOptions(config, deps());
  assert.equal(options.cert, 'c-main');
  assert.deepEqual(await ask(options, 'shop.maker.noveltyfactor.tech'), { context: 'c-maker' });
  assert.deepEqual(await ask(options, 'example.com'), { context: 'c-main' });
  assert.deepEqual(await ask(options, undefined), { context: 'c-main' });
});

test('buildTlsOptions: a wildcard certificate stands in as the default when the primary one is missing', async () => {
  const options = buildTlsOptions(config, deps(['maker.noveltyfactor.tech']));
  assert.equal(options.cert, 'c-maker');
  assert.deepEqual(await ask(options, 'example.com'), { context: 'c-maker' });
});

test('buildTlsOptions: the default is used for a wildcard host that has no certificate yet', async () => {
  const options = buildTlsOptions(config, deps(['example.com']));
  assert.deepEqual(await ask(options, 'shop.maker.noveltyfactor.tech'), { context: 'c-main' });
});

test('buildTlsOptions: nothing provisioned', () => {
  assert.equal(buildTlsOptions(config, deps([])), null);
});
