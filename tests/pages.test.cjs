require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { BlindfoldTrainer } = require('../src/BlindfoldTrainer.ts');
const { searchMemoryImages } = require('../src/lib/MemoryImages.ts');

test('GitHub Pages displays cached and remote images without the local proxy', () => {
  const previousLocation = global.location;
  global.location = { hostname: 'pxf0429.github.io' };
  try {
    const trainer = new BlindfoldTrainer(() => {}, () => {});
    const remote = { url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg', source: '', title: 'test', author: '', license: '' };
    assert.ok(trainer.image(remote, 'test').includes('src="https://upload.wikimedia.org/'));
    assert.ok(!trainer.image(remote, 'test').includes('./api/memory-image?'));
    assert.ok(trainer.image({ ...remote, cachedUrl: './assets/memory/aaaaaaaaaaaaaaaaaaaaaaaa.jpg' }, 'test').includes('src="./assets/memory/'));
  } finally {
    if (previousLocation === undefined) delete global.location;
    else global.location = previousLocation;
  }
});

test('new-word search on GitHub Pages calls the public API directly', async () => {
  const saved = { window: global.window, location: global.location, fetch: global.fetch };
  const requests = [];
  global.window = { setTimeout, clearTimeout };
  global.location = { hostname: 'pxf0429.github.io' };
  global.fetch = async address => { requests.push(address); return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }) }; };
  try {
    assert.deepEqual(await searchMemoryImages('企鹅'), []);
    assert.equal(requests.length, 1);
    const request = new URL(requests[0]);
    assert.equal(request.origin, 'https://commons.wikimedia.org');
    assert.equal(request.searchParams.get('origin'), '*');
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete global[key];
      else global[key] = saved[key];
    }
  }
});
