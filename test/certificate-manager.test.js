"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const { certificatePlan, assertValidDomains, wildcardCertbotArgs, wildcardCertbotCommand } = require('../lib-private/certificate-manager');

const config = {
  domain: 'example.com',
  services: {
    www: { subdomain: { type: 'index', protocol: 'secure' } },
    api: { subdomain: { type: 'proxy', protocol: 'secure', altDomain: 'other.org' } },
    maker: { subdomain: { type: 'proxy', protocol: 'secure', wildcard: true, altDomain: 'noveltyfactor.tech', altDomainPrefix: 'maker' } },
    insecure: { subdomain: { type: 'proxy', protocol: 'insecure', wildcard: true } },
    off: { subdomain: { type: 'proxy', protocol: 'secure', disabled: true } },
  },
};

test('certificatePlan: with wildcard certificates on, wildcard services get their own certificate and leave the shared one', () => {
  const plan = certificatePlan({ ...config, wildcardCerts: true });
  assert.deepEqual(plan.domains, ['example.com', 'www.example.com', 'other.org']);
  assert.deepEqual(plan.secureServices, ['www', 'api', 'maker']);
  assert.deepEqual(plan.wildcardJobs, [
    { name: 'maker', certName: 'maker.noveltyfactor.tech', domains: ['maker.noveltyfactor.tech', '*.maker.noveltyfactor.tech'] },
  ]);
  assert.doesNotThrow(() => assertValidDomains(plan));
});

test('certificatePlan: with wildcard certificates off, a wildcard service is an ordinary secure service', () => {
  const plan = certificatePlan(config);
  assert.deepEqual(plan.domains, ['example.com', 'www.example.com', 'other.org', 'maker.noveltyfactor.tech']);
  assert.deepEqual(plan.wildcardJobs, []);
});

test('assertValidDomains: rejects anything that could be interpreted by a shell', () => {
  for (const bad of ['a.com; rm -rf /', 'a.com $(id)', 'a b.com', 'localhost', '*.a.com']) {
    const plan = { domains: ['example.com', bad], wildcardJobs: [] };
    assert.throws(() => assertValidDomains(plan), (error) => error.statusCode === 400, bad);
  }
  assert.throws(() => assertValidDomains({ domains: ['example.com'], wildcardJobs: [{ certName: 'x', domains: ['x y.com'] }] }));
});

test('wildcardCertbotArgs / wildcardCertbotCommand: DNS challenge for the host and its wildcard, quoted for cron', () => {
  const job = { certName: 'maker.noveltyfactor.tech', domains: ['maker.noveltyfactor.tech', '*.maker.noveltyfactor.tech'] };
  const args = wildcardCertbotArgs(job, 'me+tag@example.com');
  assert.deepEqual(args.slice(0, 4), ['certonly', '--dns-route53', '--cert-name', 'maker.noveltyfactor.tech']);
  assert.ok(args.includes('*.maker.noveltyfactor.tech'));

  const command = wildcardCertbotCommand(job, 'me+tag@example.com');
  assert.ok(command.includes('certbot certonly --dns-route53 --cert-name maker.noveltyfactor.tech'));
  assert.ok(command.includes("-d '*.maker.noveltyfactor.tech'"));
  assert.ok(command.includes("--email 'me+tag@example.com'") || command.includes('--email me+tag@example.com'));
  assert.ok(command.startsWith('sudo env AWS_SHARED_CREDENTIALS_FILE=/etc/letsencrypt/'));
});
