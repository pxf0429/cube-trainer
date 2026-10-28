require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CubieCube, MoveSeq } = require('../src/lib/CubeLib.ts');
const { findEOLRCase, getEOLRCategory, formatEOLRCase } = require('../src/lib/EOLRCases.ts');
const { CATEGORIES, keyForCase, parseScramble } = require('../src/lib/Practice.ts');
const cases = require('../src/data/EOLR.json');
const rules = require('../src/data/EOLRRecognitionRulesFinal.json');
const expected = require('./expected-cases.json');
const indices = [0, 1, 2, 3, 4, 6];
const slots = ['UF', 'UL', 'UB', 'UR', 'DF', 'DB'];
const pairs = [];
for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push([a, b]);
function cubeFor(eo, [a, b], swap = false, remaining = [0, 2, 4, 6]) {
  const cube = new CubieCube(), others = [...remaining];
  indices.forEach((p, i) => { cube.eo[p] = Number(eo[i]); cube.ep[p] = i === a ? (swap ? 3 : 1) : i === b ? (swap ? 1 : 3) : others.shift(); });
  return cube;
}
function permutations(values) {
  return values.length ? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(tail => [value, ...tail])) : [[]];
}
test('preserves all 51 Chinese recognition texts and all nine categories', () => {
  assert.equal(cases.length, 51);
  assert.equal(rules.length, 51);
  assert.deepEqual(rules.map(r => [r.category, r.name, r.recognition]), cases.map(c => [c.category, c.name, c.recognition]));
  assert.deepEqual([...new Set(cases.map(c => c.category))], CATEGORIES);
});
test('answers retain U setups and never add a whole-cube turn to the original notes',()=>{
  for(const item of cases){
    const expectedText=`大类：${item.category}\n名称：${item.name}\n识别：${item.recognition}\n解法：${item.solution}`;
    assert.equal(formatEOLRCase({...item,recognitionView:{y2:true,auf:'U2'}}),'U层调整：U2\n'+expectedText);
    assert.equal(formatEOLRCase({...item,recognitionView:{y2:false,auf:''}}),expectedText);
  }
});
test('reported 2o/2 adjacent scramble needs exactly a U setup',()=>{
  const {cube,match}=parseScramble("M' U M' U2 M' U2 M U M' U M'");
  assert.equal(match.category,'2o/2'); assert.equal(match.name,'相邻');
  assert.deepEqual(match.recognitionView,{y2:false,auf:'U'});
  const adjusted=findEOLRCase(cube.apply('U'));
  assert.equal(adjusted.name,match.name); assert.equal(adjusted.recognitionView.auf,'');
  assert.ok(formatEOLRCase(match).startsWith('U层调整：U\n'));
  assert.ok(!formatEOLRCase(match).includes('y2'));
});
for (const item of cases) test('source example: ' + keyForCase(item), () => {
  const match = parseScramble(item.scramble).match;
  assert.equal(match.name, item.name);
  assert.equal(match.category, item.category);
  assert.equal(match.recognition, item.recognition);
  assert.equal(match.solution, item.solution);
});
for (const category of CATEGORIES) pairs.forEach((pair, i) => {
  test(category + ' ' + slots[pair[0]] + '/' + slots[pair[1]] + ' = ' + expected[category].names[i], () => {
    for (const swap of [false, true]) {
      const initial = cubeFor(expected[category].eo, pair, swap);
      for (const basis of ['', 'y2']) for (const auf of ['', 'U', 'U2', "U'"]) {
        const cube = (basis ? initial.changeBasis(new MoveSeq(basis)) : initial).apply(auf);
        const match = findEOLRCase(cube);
        assert.ok(match);
        assert.equal(match.category, category);
        assert.equal(match.name, expected[category].names[i]);
        const view = match.recognitionView;
        // Verify the internal comparison frame; it is not a displayed solving step.
        const aligned = cube.apply(view.y2 ? 'y2' : '').apply(view.auf);
        const alignedMatch = findEOLRCase(aligned);
        assert.equal(alignedMatch.name, match.name);
        assert.deepEqual(alignedMatch.recognitionView, { y2: false, auf: '' });
      }
      for (const others of permutations([0, 2, 4, 6])) {
        assert.equal(findEOLRCase(cubeFor(expected[category].eo, pair, swap, others)).name, expected[category].names[i]);
      }
    }
  });
});
test('all 480 EO/LR projections are isolated to their category; all 51 rules reached', () => {
  const reached = new Set();
  let count = 0, matched = 0;
  for (let bits = 0; bits < 64; bits++) {
    const eo = indices.map((_, i) => (bits >> i) & 1);
    if (eo.reduce((a, b) => a + b) % 2) continue;
    for (const pair of pairs) {
      const cube = cubeFor(eo.join(''), pair);
      const category = getEOLRCategory(cube), match = findEOLRCase(cube, category);
      count++;
      if (category === 'solved') assert.equal(match, undefined);
      else { assert.ok(match); assert.equal(match.category, category); reached.add(keyForCase(match)); matched++; }
      for (const wrong of CATEGORIES.filter(c => c !== category)) assert.equal(findEOLRCase(cube, wrong), undefined);
    }
  }
  assert.equal(count, 480); assert.equal(matched, 465); assert.equal(reached.size, 51);
});
test('M moves cannot be used to jump across EO categories', () => {
  const cube = new CubieCube().apply(cases[0].scramble);
  assert.equal(getEOLRCategory(cube), '4/0');
  assert.equal(getEOLRCategory(cube.apply('M2')), '2o/2');
  assert.equal(findEOLRCase(cube.apply('M2'), '4/0'), undefined);
});
test('aliases respect actual categories and invalid states cannot use 3/1 fallback', () => {
  assert.equal(findEOLRCase(cubeFor(expected['3/1'].eo, [0, 4]), 'arrow').category, '3/1');
  assert.equal(findEOLRCase(cubeFor(expected['4/2'].eo, [0, 4]), '6flip').category, '4/2');
  const odd = new CubieCube(); odd.eo[0] = 1;
  assert.equal(findEOLRCase(odd), undefined);
  const outside = cubeFor(expected['3/1'].eo, [0, 1]);
  [outside.ep[0], outside.ep[5]] = [outside.ep[5], outside.ep[0]];
  assert.equal(findEOLRCase(outside), undefined);
});
