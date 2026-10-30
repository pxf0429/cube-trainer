require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CubieCube, FaceletCube } = require('../src/lib/CubeLib.ts');
const { E } = require('../src/lib/Defs.ts');
const { faceMarkup, cubeMarkup } = require('../src/CubeView.ts');
const { cubePalette } = require('../src/lib/CubeColors.ts');

test('LR focus tracks only the two target pieces through turns and recoloring', () => {
  const faces = ['u_face','d_face','f_face','b_face','l_face','r_face'];
  for (const moves of ['', "M' U M2 U M'", "U M U2 M' U' M2", 'x y U R']) {
    const cube = new CubieCube().apply(moves);
    const before = cube.serialize();
    for (const colors of [{bottom:1,left:4}, {bottom:0,left:2}]) {
      const palette = cubePalette(colors);
      let targets = 0;
      faces.forEach((name, face) => {
        const focused = [...faceMarkup(cube,face,true,palette).matchAll(/<span[^>]*>/g)].map(m=>m[0]);
        const ordinary = [...faceMarkup(cube,face,false,palette).matchAll(/<span[^>]*>/g)].map(m=>m[0]);
        focused.forEach((sticker,i) => {
          const [position,,type] = FaceletCube.faces[name][i];
          const piece = type === E ? cube.ep[position] : -1;
          const expected = piece === 1 || piece === 3;
          assert.equal(sticker.includes('lr-target'),expected);
          assert.equal(sticker.includes('muted-sticker'),!expected);
          assert.equal(sticker.match(/--sticker:[^";]+/)[0],ordinary[i].match(/--sticker:[^";]+/)[0]);
          assert.ok(!ordinary[i].includes('lr-target'));
          assert.ok(!ordinary[i].includes('muted-sticker'));
          if(expected) {
            targets++;
            assert.ok(sticker.includes('data-lr="'+(piece===1?'L':'R')+'"'));
          }
        });
      });
      assert.equal(targets,4,'two stickers on each target edge');
      assert.equal((cubeMarkup(cube,true,true,-27,-34,colors).match(/lr-target/g)||[]).length,4);
    }
    assert.equal(cube.serialize(),before);
  }
});
