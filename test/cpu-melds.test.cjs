const test=require('node:test'),assert=require('node:assert/strict');
const {chooseNormalDiscard}=require('../dist-test/ai/normal.js');
test('CPU counts completed open melds when selecting a tenpai discard',()=>{
 const hand='m4 m5 m6 p2 p3 p4 p6 p6 s6 s7 N'.split(' ');
 const result=chooseNormalDiscard({selfHand:hand,openMelds:1,legalDiscardIndexes:hand.map((_,i)=>i)});
 assert.equal(result.tile,'N');assert.equal(result.shantenAfter,0);assert.equal(result.ukeire,8);
});
