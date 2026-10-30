"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const { serviceHost, wildcardServices, matchWildcard } = require('../lib-public/hosts');

const config = {
  domain: 'example.com',
  services: {
    www: { subdomain: { type: 'index', protocol: 'secure' } },
    maker: { subdomain: { type: 'proxy', protocol: 'secure', wildcard: true, altDomain: 'noveltyfactor.tech', altDomainPrefix: 'maker' } },
    files: { subdomain: { type: 'dirlist', protocol: 'secure', wildcard: true } },
    off: { subdomain: { type: 'proxy', wildcard: true, disabled: true } },
    plain: { subdomain: { type: 'proxy', wildcard: false } },
  },
};

test('serviceHost: alt domain with prefix, alt domain apex, default domain', () => {
  assert.equal(serviceHost(config, 'maker'), 'maker.noveltyfactor.tech');
  assert.equal(serviceHost({ ...config, services: { a: { subdomain: { altDomain: 'other.org' } } } }, 'a'), 'other.org');
  assert.equal(serviceHost(config, 'files'), 'files.example.com');
});

test('wildcardServices: only enabled services marked wildcard, longest host first', () => {
  assert.deepEqual(wildcardServices(config), [
    { name: 'maker', host: 'maker.noveltyfactor.tech' },
    { name: 'files', host: 'files.example.com' },
  ]);
});

test('matchWildcard: subdomains match, the host itself and lookalikes do not', () => {
  const wildcards = wildcardServices(config);
  assert.equal(matchWildcard(wildcards, 'shop.maker.noveltyfactor.tech'), 'maker');
  assert.equal(matchWildcard(wildcards, 'Shop.Maker.NoveltyFactor.tech:8080'), 'maker');
  assert.equal(matchWildcard(wildcards, 'a.b.files.example.com'), 'files');
  assert.equal(matchWildcard(wildcards, 'maker.noveltyfactor.tech'), undefined);
  assert.equal(matchWildcard(wildcards, 'notmaker.noveltyfactor.tech'), undefined);
  assert.equal(matchWildcard(wildcards, 'evilmaker.noveltyfactor.tech.attacker.net'), undefined);
  assert.equal(matchWildcard(wildcards, '.maker.noveltyfactor.tech'), undefined);
  assert.equal(matchWildcard(wildcards, undefined), undefined);
});
