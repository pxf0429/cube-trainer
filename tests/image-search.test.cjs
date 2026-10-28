const test = require('node:test');
const assert = require('node:assert/strict');
const { selectEntities, representativeFiles, searchImages } = require('../scripts/image-search.cjs');
const { parseBingImages } = require('../scripts/image-search.cjs');
const claim = (file, rank='normal') => ({rank,mainsnak:{datavalue:{value:file}}});
test('semantic lookup excludes substring hits such as eggfruit for egg',()=>{
  const result=selectEntities('鸡蛋',[{id:'Q1',label:'雞蛋',match:{text:'鸡蛋'}},{id:'Q2',label:'鸡蛋花',match:{text:'鸡蛋花'}},{id:'bad',label:'鸡蛋'}]);
  assert.deepEqual(result.map(e=>e.id),['Q1']);
});
test('representative photos ignore deprecated claims and disambiguation pages',()=>{
  const candidates=[{id:'Q1',label:'鸡蛋'},{id:'Q2',label:'鸡蛋'}];
  const result=representativeFiles('鸡蛋',candidates,{Q1:{claims:{P18:[claim('old.jpg','deprecated'),claim('normal.jpg'),claim('preferred.jpg','preferred')]}},
    Q2:{claims:{P18:[claim('wrong.jpg')],P31:[{mainsnak:{datavalue:{value:{id:'Q4167410'}}}}]}}});
  assert.deepEqual(result.map(e=>e.title),['File:preferred.jpg','File:normal.jpg']);
  assert.ok(result.every(e=>e.match.recommended));
});
test('a secondary meaning cannot be auto-selected when the main meaning has no photo',()=>{
  const result=representativeFiles('火箭',[{id:'Q1'},{id:'Q2',description:'虚构人物'}],{Q1:{claims:{}},Q2:{claims:{P18:[claim('Character.jpg')]}}});
  assert.equal(result[0].match.recommended,false);
});
test('an exact concept retrieves its designated photo rather than the first broad-search result',async()=>{
  const requests=[];
  const result=await searchImages('鸡蛋',async address=>{
    const params=new URL(address).searchParams; requests.push(params);
    if(params.get('action')==='wbsearchentities')return{search:[{id:'Q1',label:'雞蛋',description:'鸡的蛋',match:{text:'鸡蛋'}}]};
    if(params.get('action')==='wbgetentities')return{entities:{Q1:{claims:{P18:[claim('Chicken egg.jpg')]}}}};
    assert.equal(params.get('titles'),'File:Chicken egg.jpg');
    return{query:{pages:[{title:'File:Chicken egg.jpg',imageinfo:[{mime:'image/jpeg',url:'https://upload.wikimedia.org/egg.jpg'}]}]}};
  });
  assert.equal(requests.length,3); assert.ok(requests.every(p=>!p.has('generator')));
  assert.equal(result.query.pages[0].memoryMatch.kind,'entity');
  assert.equal(result.query.pages[0].memoryMatch.recommended,true);
});
test('unresolved words produce explicitly unconfirmed filename-search candidates',async()=>{
  const result=await searchImages('鸡蛋',async address=>{
    const params=new URL(address).searchParams;
    if(params.get('action')==='wbsearchentities')return{search:[{id:'Q2',label:'鸡蛋花',match:{text:'鸡蛋花'}}]};
    assert.equal(params.get('gsrsearch'),'intitle:"鸡蛋" filetype:bitmap');
    return{query:{pages:[{title:'File:Possible.jpg',index:1,imageinfo:[{}]}]}};
  });
  assert.equal(result.query.pages[0].memoryMatch.kind,'candidate');
  assert.equal(result.query.pages[0].memoryMatch.recommended,false);
});
test('rate limits do not trigger another broad-search request',async()=>{
  let calls=0;
  await assert.rejects(()=>searchImages('鸡蛋',async()=>{calls++;const error=new Error('rate limit');error.status=429;throw error;}),/rate limit/);
  assert.equal(calls,1);
});
test('Chinese search preserves the exact phrase and excludes untrusted thumbnail URLs',()=>{
  const item=(title,url,source)=>' m="'+JSON.stringify({t:title,turl:url,purl:source,murl:source+'/image'}).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"';
  const html=item('美女与破伞合成图','https://ts1.mm.bing.net/th?id=1','https://example.com/1')+
    item('破伞摄影','https://ts2.mm.bing.net/th?id=2','https://example.com/2')+
    item('破伞','https://127.0.0.1/private','https://example.com/3');
  const result=parseBingImages(html,'破伞');
  assert.equal(result.length,2);assert.equal(result[0].title,'破伞摄影');assert.equal(result[0].memoryMatch.recommended,false);
  assert.equal(new URL(result[0].imageinfo[0].thumburl).hostname,'tse2.mm.bing.net');
  assert.equal(new URL(result[0].imageinfo[0].thumburl).searchParams.get('pid'),'Api');
});
test('a semantic-service rate limit can use independent Chinese search without more API requests',async()=>{
  let calls=0;
  const html='m="'+JSON.stringify({t:'破伞',turl:'https://ts1.mm.bing.net/th?id=1',purl:'https://example.com/1'}).replace(/"/g,'&quot;')+'"';
  const result=await searchImages('破伞',async()=>{calls++;const error=new Error('limited');error.status=429;throw error;},false,async()=>html);
  assert.equal(calls,1);assert.equal(result.query.pages[0].title,'破伞');
});
