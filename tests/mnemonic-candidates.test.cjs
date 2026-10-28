require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reference = require('../src/data/BLDCandidates.json');
const pictures = require('../src/data/BLDCandidateImages.json');
const { mnemonicWords, mnemonicImages } = require('../src/lib/MnemonicCandidates.ts');
const { loadBLDStore, learnMnemonic, sanitizeImage } = require('../src/lib/Blindfold.ts');
const { BlindfoldTrainer } = require('../src/BlindfoldTrainer.ts');

test('the reference retains the workbook grid, orientation and original words', () => {
  assert.equal(Object.keys(reference.codes).length, 576);
  assert.equal(Object.values(reference.codes).filter(words => words.length).length, 565);
  assert.equal(Object.values(reference.codes).flat().length, 615);
  assert.deepEqual(mnemonicWords('AB'), ['安倍']);
  assert.deepEqual(mnemonicWords('BA'), ['保安']);
  assert.deepEqual(mnemonicWords('GD'), ['果冻', '工地']);
  assert.deepEqual(mnemonicWords('TC'), ['陶瓷', '体操']);
  assert.deepEqual(mnemonicWords('ON'), ['on（开机/向前）']);
  assert.deepEqual(mnemonicWords('CT'), ['餐厅', '插头', 'CT']);
  assert.equal(reference.cells['A B'], 'B3');
  assert.equal(reference.cells['B A'], 'C2');
  assert.deepEqual(mnemonicWords('DN'), []);
  assert.deepEqual(mnemonicWords('UV'), []);
  assert.deepEqual(mnemonicWords('1 12'), []);
  const result = mnemonicWords('AB'); result.push('changed');
  assert.deepEqual(mnemonicWords('AB'), ['安倍']);
});

test('every reference word has local image bytes and retained source attribution', () => {
  const words = [...new Set(Object.values(reference.codes).flat())];
  assert.equal(words.length, 613);
  for (const word of words) {
    const images = mnemonicImages(word);
    assert.ok(images.length, 'Missing cached images: ' + word);
    for (const image of images) {
      assert.match(image.cachedUrl, /^\.\/assets\/memory\/[a-f0-9]{24}\.(jpg|png|webp)$/);
      assert.match(image.url, /^https:\/\//);
      assert.match(image.source, /^https:\/\//);
      const file = path.join(__dirname, '../public', image.cachedUrl.slice(2));
      assert.ok(fs.statSync(file).size > 150, word);
    }
  }
  assert.equal(Object.keys(pictures.words).length, words.length);
});

test('image cache paths survive saved words while unsafe paths are discarded', () => {
  const image = mnemonicImages('AA制')[0];
  const store = loadBLDStore(null), entry = learnMnemonic(store, 'AA', 'AA制').entry;
  entry.image = { ...image, match: 'chosen' };
  const restored = loadBLDStore(JSON.stringify(store));
  assert.equal(restored.entries[0].image.cachedUrl, image.cachedUrl);
  for (const bad of ['../secret.jpg', './assets/memory/../../secret.jpg', 'https://other.example/image.jpg', 'javascript:alert(1)']) {
    assert.equal(sanitizeImage({ ...image, cachedUrl: bad }).cachedUrl, undefined);
  }
});

test('an unanswered encoding shows reference words without revealing any image', () => {
  const trainer = new BlindfoldTrainer(() => {}, () => {});
  trainer.encoding.code = 'G D';
  const saved = learnMnemonic(trainer.store, 'GD', '果冻').entry;
  saved.image = mnemonicImages('果冻')[0];
  const before = JSON.stringify(trainer.store);
  const html = trainer.markup();
  assert.ok(html.includes('data-bld-candidate="0">果冻</button>'));
  assert.ok(html.includes('data-bld-candidate="1">工地</button>'));
  assert.ok(!html.includes('data-memory-image'));
  assert.equal(JSON.stringify(trainer.store), before);
});

test('submitting a reference word uses prepared images without a network search', async () => {
  const trainer = new BlindfoldTrainer(() => {}, () => {});
  trainer.encoding.code = 'G D'; trainer.encoding.word = '果冻';
  trainer.focus = () => {};
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('Unexpected online search'); };
  try {
    await trainer.submitEncoding();
    assert.equal(trainer.encoding.phase, 'result');
    assert.ok(trainer.encodingCandidates.length);
    assert.ok(trainer.markup().includes('./assets/memory/'));
    assert.equal(trainer.store.entries.length, 1);
  } finally { global.fetch = originalFetch; }
});
