require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { cubePalette, changeCubeColor, loadCubeColors, DEFAULT_CUBE_COLORS } = require('../src/lib/CubeColors.ts');
const { loadStored, parseScramble, hasAlignedCenters } = require('../src/lib/Practice.ts');
const { CubieCube, FaceletCube } = require('../src/lib/CubeLib.ts');
const { cubeMarkup } = require('../src/CubeView.ts');

test('all 24 color schemes are real rotations with unchanged corner handedness', () => {
  const physicalRotations = new Set();
  const queue = [new CubieCube()];
  while (queue.length) {
    const cube = queue.shift();
    const palette = FaceletCube.from_cubie(cube).map(face => face[4]);
    const key = palette.join(',');
    if (physicalRotations.has(key)) continue;
    physicalRotations.add(key);
    for (const move of ['x', 'y', 'z']) queue.push(cube.apply(move));
  }
  assert.equal(physicalRotations.size, 24);
  const schemes = new Set();
  for (let bottom = 0; bottom < 6; bottom++) {
    for (let left = 0; left < 6; left++) {
      if (left === bottom || left === (bottom ^ 1)) continue;
      const palette = cubePalette({ bottom, left });
      assert.ok(physicalRotations.has(palette.join(',')), palette.join(','));
      assert.equal(new Set(palette).size, 6);
      assert.equal(palette[1], bottom);
      assert.equal(palette[4], left);
      assert.equal(palette[5], left ^ 1);
      schemes.add(palette.join(','));
    }
  }
  assert.equal(schemes.size, 24);
});

test('changing either bridge keeps the opposite bridge and bottom consistent', () => {
  const rightBlue = changeCubeColor({ bottom: 1, left: 4 }, 'right', 3);
  assert.deepEqual(cubePalette(rightBlue), [0, 1, 5, 4, 2, 3]);
  const bottomGreen = changeCubeColor(rightBlue, 'bottom', 2);
  assert.equal(bottomGreen.bottom, 2);
  assert.notEqual(bottomGreen.left, 2);
  assert.notEqual(bottomGreen.left, 3);
  assert.deepEqual(changeCubeColor(rightBlue, 'left', 1), rightBlue);
});

test('saved colors survive reload and old or corrupt settings recover defaults', () => {
  const colors = { bottom: 0, left: 3 };
  assert.deepEqual(loadStored(JSON.stringify({ cubeColors: colors })).cubeColors, colors);
  for (const value of [null, {}, { bottom: 0, left: 1 }, { bottom: 9, left: 3 }, { bottom: '1', left: 4 }]) {
    assert.deepEqual(loadCubeColors(value), DEFAULT_CUBE_COLORS);
  }
  assert.deepEqual(loadStored(null).cubeColors, DEFAULT_CUBE_COLORS);
});

test('blue-left white-bottom defaults replace the former default only once', () => {
  const current = loadStored(null);
  assert.deepEqual(cubePalette(current.cubeColors), [1, 0, 5, 4, 3, 2]);
  const old = { cubeColors: { bottom: 1, left: 4 }, categories: ['3/1'], focusLR: true };
  const upgraded = loadStored(JSON.stringify(old));
  assert.deepEqual(upgraded.cubeColors, { bottom: 0, left: 3 });
  assert.deepEqual(upgraded.categories, ['3/1']);
  assert.equal(upgraded.focusLR, true);
  assert.deepEqual(loadStored(JSON.stringify({ ...old, cubeColorsVersion: 1 })).cubeColors, old.cubeColors);
  const custom = { bottom: 1, left: 2 };
  assert.deepEqual(loadStored(JSON.stringify({ cubeColors: custom })).cubeColors, custom);
  for (const net of [false, true]) {
    const markup = cubeMarkup(new CubieCube(), net, false, -27, -34);
    assert.ok(markup.includes('白色 · D 中心'));
    assert.ok(markup.includes('蓝色 · L 中心'));
    assert.ok(markup.includes('绿色 · R 中心'));
  }
});

test('recoloring uses the same stickers in 3D, peek faces and net without changing the practice state', () => {
  const { cube, match } = parseScramble("M' U M2 U M'");
  const before = JSON.stringify(cube);
  const colors = { bottom: 0, left: 2 };
  for (const net of [false, true]) {
    const markup = cubeMarkup(cube, net, true, -27, -34, colors);
    assert.ok(markup.includes('白色 · D'));
    assert.ok(markup.includes('绿色 · L'));
    assert.ok(markup.includes('蓝色 · R'));
    assert.ok(markup.includes('muted-sticker'));
  }
  assert.equal(JSON.stringify(cube), before);
  assert.ok(hasAlignedCenters(cube));
  assert.equal(parseScramble("M' U M2 U M'").match.category, match.category);
});
