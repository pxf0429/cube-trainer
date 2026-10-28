require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CubieCube } = require('../src/lib/CubeLib.ts');
const { cubeMarkup, faceMarkup, hiddenFaces, mappedFacesMarkup } = require('../src/CubeView.ts');
const { cubePalette } = require('../src/lib/CubeColors.ts');

test('default view reveals exactly the opposite left, back and bottom faces',()=>{
  assert.deepEqual(hiddenFaces(-27,-34),[1,3,4]);
  assert.deepEqual(hiddenFaces(-25,145),[1,2,5]);
  assert.deepEqual(hiddenFaces(55,-35),[0,3,4]);
  for(const pitch of [-80,-27,30,80])for(const yaw of [-430,-110,-34,40,145,380]){
    const faces=hiddenFaces(pitch,yaw);
    assert.equal(new Set(faces).size,3);
    assert.ok(faces.includes(0)!==faces.includes(1));
    assert.ok(faces.includes(2)!==faces.includes(3));
    assert.ok(faces.includes(4)!==faces.includes(5));
  }
});
test('each projection uses its actual face stickers after turns, recoloring and LR focus',()=>{
  const colors={bottom:0,left:2},palette=cubePalette(colors);
  for(const moves of ['',"M' U M2 U M'",'U M2 U2']){
    const cube=new CubieCube().apply(moves),before=JSON.stringify(cube);
    for(const focus of [false,true]){
      const markup=mappedFacesMarkup(cube,focus,-27,-34,colors);
      assert.equal((markup.match(/data-mapped-face=/g)||[]).length,3);
      assert.equal((markup.match(/class="sticker/g)||[]).length,27);
      for(const face of [1,3,4])assert.ok(markup.includes(faceMarkup(cube,face,focus,palette)));
    }
    assert.equal(JSON.stringify(cube),before);
  }
});
test('3D has three projections while the six-face net has no duplicate views',()=>{
  const cube=new CubieCube();
  assert.equal((cubeMarkup(cube,false,false,-27,-34).match(/data-mapped-face=/g)||[]).length,3);
  assert.equal((cubeMarkup(cube,true,false,-27,-34).match(/class="sticker/g)||[]).length,54);
  assert.ok(!cubeMarkup(cube,false,false,-27,-34).includes('peek-faces'));
});
