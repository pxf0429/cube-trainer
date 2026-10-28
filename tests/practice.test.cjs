require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadStored, parseScramble, summarize, localDay, CATEGORIES, keyForCase, hasAlignedCenters } = require('../src/lib/Practice.ts');
const { CubieCube } = require('../src/lib/CubeLib.ts');

test('center constraint accepts both U/D orders and rejects quarter-M orientations', () => {
  for (const moves of ['', 'U', 'M2', "U M2 U'"]) {
    assert.ok(hasAlignedCenters(new CubieCube().apply(moves)), moves);
  }
  for (const moves of ['M', "M'", "M' U", 'U M U2 M2']) {
    assert.equal(hasAlignedCenters(new CubieCube().apply(moves)), false, moves);
  }
});
test('custom practice rejects side-facing white/yellow centers before classifying', () => {
  assert.throws(() => parseScramble("M' U"), /顶底色的中心/);
  const legacy = parseScramble("M' U", { allowSideCenters: true });
  assert.equal(legacy.match.category, '2o/2');
  assert.equal(hasAlignedCenters(legacy.cube), false);
  assert.equal(hasAlignedCenters(parseScramble("M' U M2 U M'").cube), true);
});
test('old side-center favorites remain in stored backups without becoming valid practice', () => {
  const scramble = "M' U";
  const legacy = parseScramble(scramble, { allowSideCenters: true });
  const favorite = { id: 'legacy-favorite', key: keyForCase(legacy.match), scramble, at: 1 };
  const stored = loadStored(JSON.stringify({ favorites: [favorite] }));
  assert.deepEqual(stored.favorites, [favorite]);
  assert.equal(hasAlignedCenters(new CubieCube().apply(stored.favorites[0].scramble)), false);
  assert.throws(() => parseScramble(stored.favorites[0].scramble), /顶底色的中心/);
});
test('custom scrambles reject unsupported or executable text and EO-solved cases', () => {
  for (const text of ['', 'R U', 'U M<script>', 'U U', 'M3', '<img src=x onerror=alert(1)>', Array(101).fill('M').join(' ')]) {
    assert.throws(() => parseScramble(text));
  }
  assert.equal(parseScramble("m’\u00a0u m2 u m’").match.category, '3/1');
});
test('corrupt storage recovers defaults instead of crashing the app', () => {
  for (const value of [null, '{broken', 'null', '4', '[]']) {
    assert.deepEqual(loadStored(value).categories, CATEGORIES);
  }
  const valid = loadStored(JSON.stringify({ categories: ['4/0', '4/0', 'unknown'], favorites: [{ scramble: '<script>' }], attempts: [{ elapsed: -1 }] }));
  assert.deepEqual(valid.categories, ['4/0']);
  assert.deepEqual(valid.favorites, []);
  assert.deepEqual(valid.attempts, []);
});
test('valid favorites are checked against their actual category and name', () => {
  const scramble = "M' U M2 U M'";
  const key = keyForCase(parseScramble(scramble).match);
  const good = { id: 'favorite', scramble, key, at: 1 };
  const bad = { ...good, id: 'bad', key: '4/0:相对' };
  assert.deepEqual(loadStored(JSON.stringify({ favorites: [good, bad] })).favorites, [good]);
});
test('statistics use local dates and distinguish viewed from self-rated answers', () => {
  const today = new Date(2026, 9, 27, 12).getTime(), yesterday = new Date(2026, 9, 26, 12).getTime();
  const attempt = (id, elapsed, rating, at = today) => ({ id, key: '4/0:好', category: '4/0', name: '好', elapsed, rating, at });
  const result = summarize([attempt('1', 1000, 'known'), attempt('2', 3000, 'again'), attempt('3', 2000, 'viewed'), attempt('4', 9000, 'known', yesterday)], today);
  assert.deepEqual(result, { count: 3, average: 2000, known: 1, rate: 50 });
  assert.equal(localDay(today), '2026-10-27');
  assert.deepEqual(summarize([], today), { count: 0, average: 0, known: 0, rate: 0 });
});
