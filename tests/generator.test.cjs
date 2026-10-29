require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { LSEEngine } = require('../src/lib/LSEEngine.ts');
const { CubieCube } = require('../src/lib/CubeLib.ts');
const { CATEGORIES, parseScramble, keyForCase, hasAlignedCenters } = require('../src/lib/Practice.ts');
const cases = require('../src/data/EOLR.json');
const engine = new LSEEngine();
test('generator enumerates all 184,320 legal LSE states', () => {
  assert.equal(engine.stateCount, 184320);
  assert.equal(engine.practiceStateCount, 89280);
  assert.equal(engine.scrambleFor(0), '');
  assert.throws(() => engine.scrambleFor(-1));
});
test('every named case can be generated from legal M/U moves', () => {
  for (const item of cases) for (let i = 0; i < 8; i++) {
    const result = engine.sample([item.category], keyForCase(item));
    const parsed = parseScramble(result.scramble);
    assert.equal(keyForCase(parsed.match), result.key);
    assert.ok(hasAlignedCenters(parsed.cube), 'White/yellow centers must be on U/D for ' + result.key);
    assert.deepEqual([parsed.cube.tp[0], parsed.cube.tp[1]].sort(), [0, 1]);
    assert.equal(result.key, keyForCase(item));
    assert.match(result.scramble, /^[UM2' ]+$/);
  }
});
test('mixed-category sampling stays in the selected groups and rejects empty ranges', () => {
  for (let i = 0; i < 300; i++) {
    const categories = [CATEGORIES[i % 9], CATEGORIES[(i + 2) % 9]];
    const result = parseScramble(engine.sample(categories).scramble);
    assert.ok(categories.includes(result.match.category));
    assert.ok(hasAlignedCenters(result.cube));
  }
  assert.throws(() => engine.sample([]));
  assert.throws(() => engine.sample(['4/0'], '3/1:坏'));
});
test('each selected case is sampled equally despite different numbers of underlying states', () => {
  const random = Math.random;
  let seed = 123456789;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    const categories = ['3/1', '4/2'];
    const expectedKeys = cases.filter(item => categories.includes(item.category)).map(keyForCase);
    const counts = new Map(expectedKeys.map(key => [key, 0]));
    const draws = 16000;
    for (let i = 0; i < draws; i++) {
      const key = engine.sample(categories).key;
      assert.ok(counts.has(key));
      counts.set(key, counts.get(key) + 1);
    }
    const expected = draws / expectedKeys.length;
    for (const [key, count] of counts) {
      assert.ok(Math.abs(count - expected) < expected * 0.1, `${key}: ${count}, expected approximately ${expected}`);
    }
  } finally { Math.random = random; }
});
test('encoded graph coordinates agree with the real cube including centers and corners', () => {
  const slots = [0, 1, 2, 3, 4, 6], factorial = [120, 24, 6, 2, 1, 1];
  let checked = 0;
  for (let code = 0; code < 720 * 64 * 16; code += 113) {
    let scramble;
    try { scramble = engine.scrambleFor(code); } catch { continue; }
    const cube = new CubieCube().apply(scramble);
    const permutation = slots.map(slot => slots.indexOf(cube.ep[slot]));
    let rank = 0;
    permutation.forEach((value, i) => rank += permutation.slice(i + 1).filter(v => v < value).length * factorial[i]);
    const eo = slots.reduce((bits, slot, i) => bits | (cube.eo[slot] << i), 0);
    assert.equal(Math.floor(code / 16), rank * 64 + eo);
    assert.deepEqual(cube.cp, new CubieCube().apply(Array(code % 4).fill('U').join(' ')).cp);
    assert.deepEqual(cube.tp, new CubieCube().apply(Array(Math.floor((code % 16) / 4)).fill('M').join(' ')).tp);
    checked++;
  }
  assert.ok(checked > 1000);
});
