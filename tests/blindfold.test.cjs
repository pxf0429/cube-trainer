require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCode, displayCode, parseLetters, loadBLDStore, makeEntry, eligibleEntry, reviewEntry, matchesWord,
  importBLD, parseBulkEntries, mergeEntries, safeImageUrl, sanitizeImage, SPEFFZ_CORNERS, SPEFFZ_EDGES } = require('../src/lib/Blindfold.ts');
const { parseImageResults } = require('../src/lib/MemoryImages.ts');
const { allowedUrl } = require('../scripts/memory-images.cjs');
const { availableCodes, randomCode, learnMnemonic } = require('../src/lib/Blindfold.ts');

test('the first-page random codes cover empty dictionaries and obey piece exclusions', () => {
  const store=loadBLDStore(null);
  assert.equal(availableCodes(store).length,676);
  const first=randomCode(store); assert.ok(first); assert.notEqual(randomCode(store,first),first);
  store.group='corner'; assert.equal(availableCodes(store).length,504);
  assert.equal(availableCodes(store).includes('D I'),false);
  store.group='edge'; assert.equal(availableCodes(store).length,528);
  assert.equal(availableCodes(store).includes('C I'),false);
});
test('submitted mnemonic words are saved once and reuse images across codes', () => {
  const store=loadBLDStore(null);
  const first=learnMnemonic(store,'AB','鸡蛋');
  assert.equal(first.existing,false); assert.equal(store.entries.length,1);
  first.entry.image={url:'https://upload.wikimedia.org/egg.jpg',source:'https://commons.wikimedia.org/wiki/File:Egg.jpg',title:'Egg',author:'Author',license:'CC BY 4.0'};
  const again=learnMnemonic(store,'AB',' 鸡蛋 ');
  assert.equal(again.existing,true); assert.equal(again.reusedImage,true); assert.equal(store.entries.length,1);
  const different=learnMnemonic(store,'CD','鸡蛋');
  assert.equal(different.existing,false); assert.equal(different.reusedImage,true); assert.equal(store.entries.length,2);
  assert.deepEqual(different.entry.image,first.entry.image);
  assert.notEqual(different.entry.image,first.entry.image);
  const newWord=learnMnemonic(store,'AB','苹果');
  assert.equal(newWord.reusedImage,false); assert.equal(store.entries.length,3);
  assert.throws(()=>learnMnemonic(store,'AB',' '));
});

test('codes preserve pair boundaries for letters and numeric sticker labels', () => {
  assert.equal(parseCode('ab'), 'A B');
  assert.equal(parseCode('A · B'), 'A B');
  assert.equal(parseCode('1 12'), '1 12');
  assert.notEqual(parseCode('1 12'), parseCode('11 2'));
  assert.equal(displayCode('A B'), 'AB');
  assert.equal(displayCode('1 12'), '1 · 12');
  for (const bad of ['', 'ABC', '1', '<script>', 'A A A', 'AB<script>']) assert.throws(() => parseCode(bad));
});
test('custom sticker schemes require exactly 24 unique short labels', () => {
  assert.deepEqual(parseLetters(SPEFFZ_CORNERS.join(' ')), SPEFFZ_CORNERS);
  assert.equal(parseLetters(Array.from({length:24}, (_,i)=>i+1).join(' ')).length, 24);
  for (const bad of ['', 'A B', Array(24).fill('A').join(' '), SPEFFZ_EDGES.join(' ').replace('C', 'ZZZZ')]) assert.throws(() => parseLetters(bad));
});
test('piece-specific practice excludes two stickers on the same physical piece', () => {
  const store = loadBLDStore(null);
  store.group = 'corner';
  assert.equal(eligibleEntry(makeEntry('DI', '同角'), store), false);
  assert.equal(eligibleEntry(makeEntry('DA', '不同角'), store), true);
  assert.equal(eligibleEntry(makeEntry('DA', '棱词', 'edge'), store), false);
  store.group = 'edge';
  assert.equal(eligibleEntry(makeEntry('CI', '同棱'), store), false);
  assert.equal(eligibleEntry(makeEntry('CD', '不同棱'), store), true);
  store.scheme = 'custom'; store.edgeLetters = Array.from({length:24}, (_,i)=>String(i+1));
  assert.equal(eligibleEntry(makeEntry('1 2', '同块'), store), false);
  assert.equal(eligibleEntry(makeEntry('1 3', '不同块'), store), true);
});
test('a code accepts multiple saved mnemonic words and normalizes letter case', () => {
  const entries = [makeEntry('AB', 'Apple Pie'), makeEntry('AB', '阿波罗'), makeEntry('CD', '苹果')];
  assert.ok(matchesWord(' APPLE   PIE ', 'A B', entries));
  assert.ok(matchesWord('阿波罗', 'A B', entries));
  assert.equal(matchesWord('苹果', 'A B', entries), false);
});
test('review intervals grow after correct recall and reset after a mistake', () => {
  const entry = makeEntry('AB', '苹果'), now = 1000;
  reviewEntry(entry, true, now); assert.equal(entry.due, now + 86400000);
  reviewEntry(entry, true, now); assert.equal(entry.due, now + 3*86400000);
  reviewEntry(entry, false, now); assert.equal(entry.due, now + 600000);
  assert.equal(entry.streak, 0); assert.equal(entry.reviews, 3); assert.equal(entry.correct, 2); assert.equal(entry.mistakes, 1);
});
test('reference-site word tables import strings and every alternate word', () => {
  const entries = importBLD({AB:['苹果','阿波罗'],CD:'茶点',bad:42});
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(e=>displayCode(e.code)), ['AB','AB','CD']);
  assert.throws(()=>importBLD({}), /没有有效/);
});
test('batch entry parsing is atomic, supports custom numbers and deduplicates merges', () => {
  const rows = parseBulkEntries('AB 苹果 / 阿波罗\n1 12 猫头鹰', 'general');
  assert.equal(rows.length, 3); assert.equal(rows[2].code, '1 12');
  assert.equal(mergeEntries(rows, rows).length, 3);
  assert.throws(()=>parseBulkEntries('AB 苹果\n错误行', 'general'), /第2行/);
  assert.equal(rows.length, 3);
});
test('complete backups round-trip images, notes, custom schemes and review progress', () => {
  const store = loadBLDStore(null), row = makeEntry('JD', '鸡蛋');
  row.note = '鸡蛋滚过桌面'; row.image = {url:'https://upload.wikimedia.org/egg.jpg',source:'https://commons.wikimedia.org/wiki/File:Egg.jpg',title:'Egg',author:'Author',license:'CC BY-SA 4.0'};
  reviewEntry(row, true, 1000); store.entries.push(row); store.scheme='custom';
  const restored = loadBLDStore(JSON.stringify(store));
  assert.deepEqual(restored, store);
  assert.deepEqual(importBLD({app:'cube-studio-bld',version:1,...store}), store.entries);
});
test('corrupt storage is recoverable and duplicate IDs cannot alias entries', () => {
  assert.equal(loadBLDStore('{bad').entries.length, 0);
  const good=makeEntry('AB','苹果'); const row={...makeEntry('CD','茶点'), id:good.id};
  const restored=loadBLDStore(JSON.stringify({entries:[good,row,{code:'bad',word:'坏'}]}));
  assert.equal(restored.entries.length,2); assert.notEqual(restored.entries[0].id,restored.entries[1].id);
});
test('image metadata is sanitized and search ordering follows relevance', () => {
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeImage({url:'data:text/html,bad'}), undefined);
  const result=parseImageResults({query:{pages:[
    {index:2,title:'File:Egg 2',imageinfo:[{mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/2.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:2.jpg',extmetadata:{Artist:{value:'<a>Bob</a>'},LicenseShortName:{value:'CC BY 4.0'}}}]},
    {index:1,title:'File:Egg 1',imageinfo:[{mime:'image/png',thumburl:'https://upload.wikimedia.org/1.png'}]},
    {index:3,title:'File:Bad',imageinfo:[{mime:'text/html',url:'https://example.com/evil'}]}
  ]}});
  assert.equal(result.length,2); assert.equal(result[0].title,'Egg 1'); assert.equal(result[1].author,'Bob');
});
test('automatic image matching distinguishes representative pictures from unconfirmed search hits',()=>{
  const results=parseImageResults({query:{pages:[
    {index:0,title:'File:Egg.jpg',memoryMatch:{kind:'entity',recommended:true,label:'鸡蛋',description:'鸡的蛋'},imageinfo:[{mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/egg.jpg'}]},
    {index:1,title:'File:Flower.jpg',imageinfo:[{mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/flower.jpg'}]}
  ]}});
  assert.equal(results[0].match,'entity');assert.equal(results[0].recommended,true);assert.equal(results[0].meaning,'鸡蛋 · 鸡的蛋');
  assert.equal(results[1].match,'candidate');assert.equal(results[1].recommended,false);
  assert.deepEqual(sanitizeImage(results[0]),results[0]);
});
test('a manually corrected word image is preferred over older reused pictures',()=>{
  const store=loadBLDStore(null);
  const old=makeEntry('AB','鸡蛋'),corrected=makeEntry('CD','鸡蛋');
  old.image={url:'https://upload.wikimedia.org/old.jpg',source:'',title:'Old',author:'',license:''};
  corrected.image={...old.image,url:'https://upload.wikimedia.org/eggs.jpg',match:'chosen'};
  store.entries=[old,corrected];
  const result=learnMnemonic(store,'EF','鸡蛋');
  assert.equal(result.entry.image.url,corrected.image.url);
});
test('the local image service only accepts the fixed public image providers', () => {
  for (const url of ['https://upload.wikimedia.org/a.jpg','https://thumb.wikimedia.org/a.jpg']) assert.ok(allowedUrl(url));
  for (const url of ['http://upload.wikimedia.org/a.jpg','https://127.0.0.1/','https://evil.example/a.jpg','https://upload.wikimedia.org.evil.example/a','https://upload.wikimedia.org:123/a','https://user:pass@upload.wikimedia.org/a']) assert.equal(allowedUrl(url),null);
});
