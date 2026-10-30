"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const { getStatus, installPlugin } = require('../lib-private/certbot-plugin');

// A fake machine: which certbot is found where, which plugins it lists, and which commands fail
function machine({ certbot = '/usr/bin/certbot', plugins = 'apache\nnginx\n', failing = [] } = {}) {
  const calls = [];
  const state = { plugins };
  const run = async (file, args) => {
    const line = [file, ...args].join(' ');
    calls.push(line);
    if (failing.some(prefix => line.startsWith(prefix))) throw new Error(`Command failed: ${line}\nsudo: a password is required`);
    if (file === 'which') {
      if (!certbot) throw new Error('not found');
      return `${certbot}\n`;
    }
    if (line === 'sudo -n certbot plugins') return state.plugins;
    if (line.startsWith('sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install') || line.startsWith('sudo -n snap install')) {
      state.plugins += 'dns-route53\n';
    }
    return '';
  };
  return { run, calls };
}

test('getStatus: tells whether the plugin is listed', async () => {
  assert.equal((await getStatus(machine().run)).installed, false);
  assert.equal((await getStatus(machine({ plugins: 'dns-route53\n' }).run)).installed, true);
});

test('getStatus: apt and snap installs get their own directions, and a missing certbot is reported', async () => {
  assert.ok((await getStatus(machine().run)).directions.includes('sudo apt install -y python3-certbot-dns-route53'));
  const snap = await getStatus(machine({ certbot: '/snap/bin/certbot' }).run);
  assert.equal(snap.method, 'snap');
  assert.ok(snap.directions.includes('sudo snap install certbot-dns-route53'));
  const none = await getStatus(machine({ certbot: null }).run);
  assert.equal(none.method, 'none');
  assert.equal(none.installed, false);
});

test('installPlugin: installs with apt when missing, without prompting', async () => {
  const { run, calls } = machine();
  const status = await installPlugin(run);
  assert.equal(status.installed, true);
  assert.ok(calls.includes('sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y python3-certbot-dns-route53'));
});

test('installPlugin: does nothing when it is already installed', async () => {
  const { run, calls } = machine({ plugins: 'dns-route53\n' });
  assert.equal((await installPlugin(run)).installed, true);
  assert.equal(calls.some(call => call.includes('install')), false);
});

test('installPlugin: installs through snap for a snap certbot', async () => {
  const { run, calls } = machine({ certbot: '/snap/bin/certbot' });
  assert.equal((await installPlugin(run)).installed, true);
  assert.ok(calls.includes('sudo -n snap set certbot trust-plugin-with-root=ok'));
  assert.ok(calls.includes('sudo -n snap install certbot-dns-route53'));
});

test('installPlugin: a failed install comes back with the reason and directions instead of throwing', async () => {
  const status = await installPlugin(machine({ failing: ['sudo -n env DEBIAN_FRONTEND'] }).run);
  assert.equal(status.installed, false);
  assert.match(status.detail, /password is required/);
  assert.ok(status.directions.length > 0);
});
