require('./register.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const cases=require('../src/data/EOLR.json');
const {CATEGORIES}=require('../src/lib/Practice.ts');
const {caseReferences,buildLearningGraph}=require('../src/lib/EOLRLearning.ts');
const original=JSON.stringify(cases);
const graph=buildLearningGraph(cases,CATEGORIES);

test('every conversion in the original notes resolves to an existing case',()=>{
  const declarations=cases.reduce((sum,item)=>sum+(item.solution.match(/(?:转换|转化)为/g)||[]).length,0);
  assert.equal(declarations,46);
  assert.equal(graph.dependencies.filter(edge=>edge.conversion).length,declarations);
  assert.equal(graph.dependencies.length,47);
  for(const item of cases){
    for(const ref of caseReferences(item.solution,cases)){
      assert.ok(graph.byKey.has(ref.targetKey));
      assert.equal(item.solution.slice(ref.start,ref.end),ref.text);
    }
  }
  assert.equal(JSON.stringify(cases),original);
});
test('the reported conversion opens good 3/1 and preserves its exact wording',()=>{
  const item=cases.find(item=>item.category==='1/1'&&item.name==='好');
  const refs=graph.references.get('1/1:好');
  assert.equal(refs.length,1);assert.equal(refs[0].text,'好3/1');assert.equal(refs[0].targetKey,'3/1:好');
  assert.equal(graph.byKey.get(refs[0].targetKey).solution,'做M操作将D层的色相错误棱块放到U层，调整U层的LR棱块到D层LR棱块的上方，再做M操作。');
  assert.ok(item.solution.endsWith('转换为好3/1'));
});
test('references resolve category-specific aliases without rewriting the notes',()=>{
  assert.equal(caseReferences('转换为好的3/1',cases)[0].targetKey,'3/1:好');
  assert.equal(caseReferences('转化为堆叠3/1',cases)[0].targetKey,'3/1:堆积');
  assert.equal(caseReferences('转换为相邻1/1',cases)[0].targetKey,'1/1:UF相邻');
  assert.equal(caseReferences('坏3/1\n转化为堆积3/1',cases).filter(ref=>ref.conversion).length,1);
  assert.deepEqual(caseReferences('转换为不存在3/1',cases),[]);
});
test('conversion totals separate cross-category and same-category references',()=>{
  assert.equal(graph.crossCategoryCount,42);assert.equal(graph.withinCategoryCount,4);
  assert.equal(graph.incoming('3/1'),31);
  assert.equal(graph.categoryEdges.find(edge=>edge.source==='1/1'&&edge.target==='3/1').count,7);
  assert.equal(graph.categoryEdges.find(edge=>edge.source==='2a/2'&&edge.target==='3/1').count,8);
});
test('the learning order places every external prerequisite before its dependent',()=>{
  assert.deepEqual(graph.order,['3/1','2a/2','2o/0','1/1','0/2','4/0','4/2','2a/0','2o/2']);
  assert.equal(new Set(graph.order).size,9);
  for(const edge of graph.categoryEdges.filter(edge=>edge.source!==edge.target))assert.ok(graph.order.indexOf(edge.target)<graph.order.indexOf(edge.source));
  assert.equal(graph.cycles.length,0);
});
test('cross-category cycles receive one shared learning level',()=>{
  const item=(category,name,solution)=>({category,name,solution,position:'',recognition:'',scramble:''});
  const cyclic=buildLearningGraph([item('3/1','堆积','转换为好1/1'),item('1/1','好','转换为堆积3/1')],['3/1','1/1']);
  assert.equal(cyclic.cycles.length,1);assert.equal(cyclic.levels.get('3/1'),cyclic.levels.get('1/1'));
});
